import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

export function registerIssueTools(server: McpServer, gitlab: GitLabClient) {
  server.tool(
    "search_issues",
    "Search for issues in a GitLab project. Use this to check for duplicates before creating a new issue.",
    {
      project_id: z.string().describe("Project ID or path"),
      search: z.string().optional().describe("Text search query"),
      labels: z.string().optional().describe("Comma-separated label names to filter by"),
      state: z.enum(["opened", "closed"]).optional(),
      per_page: z.number().optional().default(20),
    },
    async ({ project_id, search, labels, state, per_page }) => {
      const issues = await gitlab.withRetry(() =>
        gitlab.api.Issues.all({
          projectId: project_id,
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
      project_id: z.string().describe("Project ID or path"),
      issue_iid: z.number().describe("Issue IID (project-scoped number)"),
    },
    async ({ project_id, issue_iid }) => {
      const issue = await gitlab.withRetry(() =>
        gitlab.api.Issues.show(issue_iid, { projectId: project_id })
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
      project_id: z.string().describe("Project ID or path"),
      title: z.string().describe("Issue title"),
      description: z.string().optional().describe("Issue description (Markdown)"),
      labels: z.string().optional().describe("Comma-separated label names"),
      milestone_id: z.number().optional().describe("Milestone ID to assign"),
      assignee_ids: z.array(z.number()).optional().describe("Array of user IDs to assign"),
      confidential: z.boolean().optional().default(false),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    },
    async ({ project_id, title, description, labels, milestone_id, assignee_ids, confidential, due_date }) => {
      const issue = await gitlab.withRetry(() =>
        gitlab.api.Issues.create(project_id, title, {
          description,
          labels,
          milestoneId: milestone_id,
          assigneeIds: assignee_ids,
          confidential,
          dueDate: due_date,
        })
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                iid: issue.iid,
                title: issue.title,
                web_url: issue.web_url,
                state: issue.state,
              },
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
      project_id: z.string().describe("Project ID or path"),
      issue_iid: z.number().describe("Issue IID"),
      title: z.string().optional(),
      description: z.string().optional(),
      labels: z.string().optional().describe("Comma-separated label names (replaces existing)"),
      state_event: z.enum(["close", "reopen"]).optional(),
    },
    async ({ project_id, issue_iid, title, description, labels, state_event }) => {
      const issue = await gitlab.withRetry(() =>
        gitlab.api.Issues.edit(project_id, issue_iid, {
          title,
          description,
          labels,
          stateEvent: state_event,
        })
      );

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
      project_id: z.string().describe("Project ID or path"),
      issue_iid: z.number().describe("Issue IID"),
      body: z.string().describe("Comment body (Markdown)"),
    },
    async ({ project_id, issue_iid, body }) => {
      const note = await gitlab.withRetry(() =>
        gitlab.api.IssueNotes.create(project_id, issue_iid, body)
      );

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
