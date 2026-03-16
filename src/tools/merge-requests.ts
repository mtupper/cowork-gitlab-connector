import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

function resolveProject(project_id: string | undefined, defaultProject: string | undefined): string {
  const resolved = project_id || defaultProject;
  if (!resolved) throw new Error("project_id is required (no default project configured)");
  return resolved;
}

export function registerMergeRequestTools(server: McpServer, gitlab: GitLabClient, defaultProject?: string) {
  const projectParam = defaultProject
    ? z.string().optional().describe(`Project ID or path (default: ${defaultProject})`)
    : z.string().describe("Project ID or path");

  server.tool(
    "list_merge_requests",
    "List merge requests in a project, optionally filtered by state or milestone.",
    {
      project_id: projectParam,
      state: z.enum(["opened", "closed", "merged", "locked"]).optional().default("opened"),
      milestone: z.string().optional().describe("Milestone title to filter by"),
      per_page: z.number().min(1).max(100).optional().default(20),
    },
    async ({ project_id, state, milestone, per_page }) => {
      const pid = resolveProject(project_id, defaultProject);
      const mrs = await gitlab.withRetry(() =>
        gitlab.api.MergeRequests.all({
          projectId: pid,
          state,
          milestone,
          perPage: per_page,
        })
      );

      const results = mrs.map((mr) => ({
        iid: mr.iid,
        title: mr.title,
        state: mr.state,
        source_branch: mr.source_branch,
        target_branch: mr.target_branch,
        web_url: mr.web_url,
        author: mr.author?.name,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "get_merge_request",
    "Get full details of a specific merge request.",
    {
      project_id: projectParam,
      mr_iid: z.number().describe("Merge request IID"),
    },
    async ({ project_id, mr_iid }) => {
      const pid = resolveProject(project_id, defaultProject);
      const mr = await gitlab.withRetry(() =>
        gitlab.api.MergeRequests.show(pid, mr_iid)
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(mr, null, 2) }],
      };
    }
  );

  server.tool(
    "get_mr_diff",
    "Get the diff (changed files and content) for a merge request. Use this to generate MR descriptions.",
    {
      project_id: projectParam,
      mr_iid: z.number().describe("Merge request IID"),
    },
    async ({ project_id, mr_iid }) => {
      const pid = resolveProject(project_id, defaultProject);
      const changes = await gitlab.withRetry(() =>
        gitlab.api.MergeRequests.allDiffs(pid, mr_iid)
      );

      const diffs = changes.map((d) => ({
        old_path: d.old_path,
        new_path: d.new_path,
        new_file: d.new_file,
        deleted_file: d.deleted_file,
        renamed_file: d.renamed_file,
        diff: d.diff,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(diffs, null, 2) }],
      };
    }
  );

  server.tool(
    "update_mr_description",
    "Update a merge request's description with Claude-generated content.",
    {
      project_id: projectParam,
      mr_iid: z.number().describe("Merge request IID"),
      description: z.string().max(1_000_000).describe("New description (Markdown)"),
    },
    async ({ project_id, mr_iid, description }) => {
      const pid = resolveProject(project_id, defaultProject);
      const mr = await gitlab.withRetry(() =>
        gitlab.api.MergeRequests.edit(pid, mr_iid, { description })
      );

      gitlab.logWrite("update_mr_description", pid, "merge_request", mr.iid);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ iid: mr.iid, title: mr.title, web_url: mr.web_url }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "add_mr_comment",
    "Add a comment to a merge request.",
    {
      project_id: projectParam,
      mr_iid: z.number().describe("Merge request IID"),
      body: z.string().min(1).describe("Comment body (Markdown)"),
    },
    async ({ project_id, mr_iid, body }) => {
      const pid = resolveProject(project_id, defaultProject);
      const note = await gitlab.withRetry(() =>
        gitlab.api.MergeRequestNotes.create(pid, mr_iid, body)
      );

      gitlab.logWrite("add_mr_comment", pid, "mr_note", note.id);

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
