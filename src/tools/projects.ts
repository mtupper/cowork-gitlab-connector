import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

export function registerProjectTools(server: McpServer, gitlab: GitLabClient) {
  server.tool(
    "list_projects",
    "List GitLab projects accessible to the authenticated user. Use search to filter by name.",
    {
      search: z.string().optional().describe("Search query to filter projects by name"),
      per_page: z.number().optional().default(20).describe("Results per page (max 100)"),
    },
    async ({ search, per_page }) => {
      const projects = await gitlab.withRetry(() =>
        gitlab.api.Projects.all({
          membership: true,
          search,
          perPage: per_page,
        })
      );

      const results = projects.map((p) => ({
        id: p.id,
        name: p.name,
        path_with_namespace: p.path_with_namespace,
        web_url: p.web_url,
        description: p.description,
        default_branch: p.default_branch,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "get_project",
    "Get details for a specific GitLab project by ID or path (e.g. 'my-group/my-project').",
    {
      project_id: z.string().describe("Project ID (numeric) or full path (e.g. 'group/project')"),
    },
    async ({ project_id }) => {
      const project = await gitlab.withRetry(() =>
        gitlab.api.Projects.show(project_id)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: project.id,
                name: project.name,
                path_with_namespace: project.path_with_namespace,
                web_url: project.web_url,
                description: project.description,
                default_branch: project.default_branch,
                topics: project.topics,
                visibility: project.visibility,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
