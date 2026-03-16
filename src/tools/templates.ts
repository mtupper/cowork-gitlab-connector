import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

function resolveProject(project_id: string | undefined, defaultProject: string | undefined): string {
  const resolved = project_id || defaultProject;
  if (!resolved) throw new Error("project_id is required (no default project configured)");
  return resolved;
}

export function registerTemplateTools(server: McpServer, gitlab: GitLabClient, defaultProject?: string) {
  const projectParam = defaultProject
    ? z.string().optional().describe(`Project ID or path (default: ${defaultProject})`)
    : z.string().describe("Project ID or path");

  server.tool(
    "list_issue_templates",
    "List available issue templates from the project's .gitlab/issue_templates/ directory. Use these to structure bug reports and feature requests.",
    {
      project_id: projectParam,
    },
    async ({ project_id }) => {
      const pid = resolveProject(project_id, defaultProject);
      const templates = await gitlab.withRetry(() =>
        gitlab.api.ProjectTemplates.all(pid, "issues")
      );

      const results = templates.map((t) => ({
        key: t.key,
        name: t.name,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "list_mr_templates",
    "List available merge request templates from the project's .gitlab/merge_request_templates/ directory.",
    {
      project_id: projectParam,
    },
    async ({ project_id }) => {
      const pid = resolveProject(project_id, defaultProject);
      const templates = await gitlab.withRetry(() =>
        gitlab.api.ProjectTemplates.all(pid, "merge_requests")
      );

      const results = templates.map((t) => ({
        key: t.key,
        name: t.name,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "get_template",
    "Get the content of a specific issue or merge request template. Use this to populate templates when creating issues or MR descriptions.",
    {
      project_id: projectParam,
      type: z.enum(["issues", "merge_requests"]).describe("Template type"),
      name: z.string().describe("Template name (key)"),
    },
    async ({ project_id, type, name }) => {
      const pid = resolveProject(project_id, defaultProject);
      const template = await gitlab.withRetry(() =>
        gitlab.api.ProjectTemplates.show(pid, type, name)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { name: template.name, content: template.content },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
