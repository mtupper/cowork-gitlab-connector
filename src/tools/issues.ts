import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

function resolveProject(project_id: string | undefined, defaultProject: string | undefined): string {
  const resolved = project_id || defaultProject;
  if (!resolved) throw new Error("project_id is required (no default project configured)");
  return resolved;
}

export function registerIssueTools(server: McpServer, gitlab: GitLabClient, defaultProject?: string) {
  const projectParam = defaultProject
    ? z.string().optional().describe(`Project ID or path (default: ${defaultProject})`)
    : z.string().describe("Project ID or path");

  server.tool(
    "search_issues",
    "Search for issues in a GitLab project. Use this to check for duplicates before creating a new issue.",
    {
      project_id: projectParam,
      search: z.string().optional().describe("Text search query"),
      labels: z.string().optional().describe("Comma-separated label names to filter by"),
      state: z.enum(["opened", "closed"]).optional(),
      per_page: z.number().min(1).max(100).optional().default(20),
    },
    async ({ project_id, search, labels, state, per_page }) => {
      const pid = resolveProject(project_id, defaultProject);
      const issues = await gitlab.withRetry(() =>
        gitlab.api.Issues.all({
          projectId: pid,
          search,
          labels,
          state,
          perPage: per_page,
        })
      );

      const results = issues.map((i) => ({
        iid: i.iid,
        title: i.title,
        state: i.state,
        labels: i.labels,
        web_url: i.web_url,
        created_at: i.created_at,
        author: i.author?.name,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "get_issue",
    "Get full details of a specific issue by IID.",
    {
      project_id: projectParam,
      issue_iid: z.number().describe("Issue IID (project-scoped number)"),
    },
    async ({ project_id, issue_iid }) => {
      const pid = resolveProject(project_id, defaultProject);
      const issue = await gitlab.withRetry(() =>
        gitlab.api.Issues.show(issue_iid, { projectId: pid })
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(issue, null, 2) }],
      };
    }
  );

  server.tool(
    "create_issue",
    "Create a new issue (bug report, feature request, etc.) in a GitLab project. Claude should compose a well-structured title and description before calling this.",
    {
      project_id: projectParam,
      title: z.string().min(1).describe("Issue title"),
      description: z.string().max(1_000_000).optional().describe("Issue description (Markdown, max 1MB)"),
      labels: z.string().optional().describe("Comma-separated label names"),
      milestone_id: z.number().optional().describe("Milestone ID to assign"),
      assignee_ids: z.array(z.number()).optional().describe("Array of user IDs to assign"),
      confidential: z.boolean().optional().default(false),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    },
    async ({ project_id, title, description, labels, milestone_id, assignee_ids, confidential, due_date }) => {
      const pid = resolveProject(project_id, defaultProject);
      const issue = await gitlab.withRetry(() =>
        gitlab.api.Issues.create(pid, title, {
          description,
          labels,
          milestoneId: milestone_id,
          assigneeIds: assignee_ids,
          confidential,
          dueDate: due_date,
        })
      );

      gitlab.logWrite("create_issue", pid, "issue", issue.iid);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { iid: issue.iid, title: issue.title, web_url: issue.web_url, state: issue.state },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "update_issue",
    "Update an existing issue's title, description, labels, state, or other fields.",
    {
      project_id: projectParam,
      issue_iid: z.number().describe("Issue IID"),
      title: z.string().min(1).optional(),
      description: z.string().max(1_000_000).optional(),
      labels: z.string().optional().describe("Comma-separated label names (replaces existing)"),
      state_event: z.enum(["close", "reopen"]).optional(),
    },
    async ({ project_id, issue_iid, title, description, labels, state_event }) => {
      const pid = resolveProject(project_id, defaultProject);
      const issue = await gitlab.withRetry(() =>
        gitlab.api.Issues.edit(pid, issue_iid, {
          title,
          description,
          labels,
          stateEvent: state_event,
        })
      );

      gitlab.logWrite("update_issue", pid, "issue", issue.iid);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ iid: issue.iid, title: issue.title, web_url: issue.web_url, state: issue.state }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "add_issue_comment",
    "Add a comment (note) to an existing issue.",
    {
      project_id: projectParam,
      issue_iid: z.number().describe("Issue IID"),
      body: z.string().min(1).describe("Comment body (Markdown)"),
    },
    async ({ project_id, issue_iid, body }) => {
      const pid = resolveProject(project_id, defaultProject);
      const note = await gitlab.withRetry(() =>
        gitlab.api.IssueNotes.create(pid, issue_iid, body)
      );

      gitlab.logWrite("add_issue_comment", pid, "issue_note", note.id);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ id: note.id, body: note.body, created_at: note.created_at }, null, 2),
          },
        ],
      };
    }
  );
}
