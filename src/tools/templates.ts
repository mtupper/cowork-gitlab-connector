import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

export function registerTemplateTools(server: McpServer, gitlab: GitLabClient) {
  server.tool(
    "list_issue_templates",
    "List available issue templates from the project's .gitlab/issue_templates/ directory. Use these to structure bug reports and feature requests.",
    {
      project_id: z.string().describe("Project ID or path"),
    },
    async ({ project_id }) => {
      const templates = await gitlab.withRetry(() =>
        gitlab.api.ProjectTemplates.all(project_id, "issues")
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
      project_id: z.string().describe("Project ID or path"),
    },
    async ({ project_id }) => {
      const templates = await gitlab.withRetry(() =>
        gitlab.api.ProjectTemplates.all(project_id, "merge_requests")
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
      project_id: z.string().describe("Project ID or path"),
      type: z.enum(["issues", "merge_requests"]).describe("Template type"),
      name: z.string().describe("Template name (key)"),
    },
    async ({ project_id, type, name }) => {
      const template = await gitlab.withRetry(() =>
        gitlab.api.ProjectTemplates.show(project_id, type, name)
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
