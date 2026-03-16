import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

function resolveProject(project_id: string | undefined, defaultProject: string | undefined): string {
  const resolved = project_id || defaultProject;
  if (!resolved) throw new Error("project_id is required (no default project configured)");
  return resolved;
}

export function registerReleaseTools(server: McpServer, gitlab: GitLabClient, defaultProject?: string) {
  const projectParam = defaultProject
    ? z.string().optional().describe(`Project ID or path (default: ${defaultProject})`)
    : z.string().describe("Project ID or path");

  server.tool(
    "list_releases",
    "List releases in a GitLab project, ordered by release date descending.",
    {
      project_id: projectParam,
      per_page: z.number().min(1).max(100).optional().default(20),
    },
    async ({ project_id, per_page }) => {
      const pid = resolveProject(project_id, defaultProject);
      const releases = await gitlab.withRetry(() =>
        gitlab.api.ProjectReleases.all(pid, { perPage: per_page })
      );

      const results = releases.map((r) => ({
        tag_name: r.tag_name,
        name: r.name,
        description: r.description,
        created_at: r.created_at,
        released_at: r.released_at,
        upcoming_release: r.upcoming_release,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "create_release_notes_draft",
    "Generate a draft of release notes by aggregating merged MRs and closed issues for a given milestone. Returns structured data that Claude can format into release notes.",
    {
      project_id: projectParam,
      milestone: z.string().describe("Milestone title to aggregate release notes for"),
    },
    async ({ project_id, milestone }) => {
      const pid = resolveProject(project_id, defaultProject);
      const [mergeRequests, issues] = await Promise.all([
        gitlab.withRetry(() =>
          gitlab.api.MergeRequests.all({
            projectId: pid,
            milestone,
            state: "merged",
            perPage: 100,
          })
        ),
        gitlab.withRetry(() =>
          gitlab.api.Issues.all({
            projectId: pid,
            milestone,
            state: "closed",
            perPage: 100,
          })
        ),
      ]);

      const categorized = {
        features: [] as Array<{ iid: number; title: string; author: string | undefined; web_url: string }>,
        fixes: [] as Array<{ iid: number; title: string; author: string | undefined; web_url: string }>,
        other: [] as Array<{ iid: number; title: string; author: string | undefined; web_url: string }>,
      };

      for (const mr of mergeRequests) {
        const labels = (mr.labels ?? []) as string[];
        const entry = {
          iid: mr.iid,
          title: mr.title,
          author: mr.author?.name,
          web_url: String(mr.web_url),
        };

        if (labels.some((l) => /feature|enhancement/i.test(l))) {
          categorized.features.push(entry);
        } else if (labels.some((l) => /bug|fix|hotfix/i.test(l))) {
          categorized.fixes.push(entry);
        } else {
          categorized.other.push(entry);
        }
      }

      const closedIssues = issues.map((i) => ({
        iid: i.iid,
        title: i.title,
        labels: i.labels,
        web_url: i.web_url,
      }));

      const contributors = [
        ...new Set(mergeRequests.map((mr) => mr.author?.name).filter(Boolean)),
      ];

      const result = {
        milestone,
        merge_requests: categorized,
        closed_issues: closedIssues,
        contributors,
        total_mrs: mergeRequests.length,
        total_issues: issues.length,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
