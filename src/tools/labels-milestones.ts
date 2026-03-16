import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

function resolveProject(project_id: string | undefined, defaultProject: string | undefined): string {
  const resolved = project_id || defaultProject;
  if (!resolved) throw new Error("project_id is required (no default project configured)");
  return resolved;
}

export function registerLabelMilestoneTools(server: McpServer, gitlab: GitLabClient, defaultProject?: string) {
  const projectParam = defaultProject
    ? z.string().optional().describe(`Project ID or path (default: ${defaultProject})`)
    : z.string().describe("Project ID or path");

  server.tool(
    "list_labels",
    "List all labels available in a GitLab project. Useful for discovering valid label names before creating or filtering issues.",
    {
      project_id: projectParam,
      search: z.string().optional().describe("Search query to filter labels by name"),
      per_page: z.number().min(1).max(100).optional().default(50).describe("Results per page (max 100)"),
    },
    async ({ project_id, search, per_page }) => {
      const pid = resolveProject(project_id, defaultProject);
      const labels = await gitlab.withRetry(() =>
        gitlab.api.ProjectLabels.all(pid, { search, perPage: per_page })
      );

      const results = labels.map((l) => ({
        name: l.name,
        color: l.color,
        description: l.description,
        open_issues_count: l.open_issues_count,
        open_merge_requests_count: l.open_merge_requests_count,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "list_milestones",
    "List milestones in a GitLab project. Use this to find milestone IDs for filtering issues or generating release notes.",
    {
      project_id: projectParam,
      state: z.enum(["active", "closed"]).optional().default("active"),
      search: z.string().optional().describe("Search query to filter milestones"),
      per_page: z.number().min(1).max(100).optional().default(20),
    },
    async ({ project_id, state, search, per_page }) => {
      const pid = resolveProject(project_id, defaultProject);
      const milestones = await gitlab.withRetry(() =>
        gitlab.api.ProjectMilestones.all(pid, { state, search, perPage: per_page })
      );

      const results = milestones.map((m) => ({
        id: m.id,
        iid: m.iid,
        title: m.title,
        description: m.description,
        state: m.state,
        due_date: m.due_date,
        start_date: m.start_date,
        web_url: m.web_url,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "get_milestone_issues",
    "Get all issues and merge requests associated with a milestone. Use this for generating release notes.",
    {
      project_id: projectParam,
      milestone_id: z.number().describe("Milestone ID"),
    },
    async ({ project_id, milestone_id }) => {
      const pid = resolveProject(project_id, defaultProject);
      const [issues, mergeRequests] = await Promise.all([
        gitlab.withRetry(() =>
          gitlab.api.Issues.all({
            projectId: pid,
            milestoneId: String(milestone_id),
            perPage: 100,
          })
        ),
        gitlab.withRetry(() =>
          gitlab.api.MergeRequests.all({
            projectId: pid,
            milestoneId: String(milestone_id),
            perPage: 100,
          })
        ),
      ]);

      const result = {
        issues: issues.map((i) => ({
          iid: i.iid,
          title: i.title,
          state: i.state,
          labels: i.labels,
          web_url: i.web_url,
          author: i.author?.name,
        })),
        merge_requests: mergeRequests.map((mr) => ({
          iid: mr.iid,
          title: mr.title,
          state: mr.state,
          labels: mr.labels,
          web_url: mr.web_url,
          author: mr.author?.name,
          merged_at: mr.merged_at,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
