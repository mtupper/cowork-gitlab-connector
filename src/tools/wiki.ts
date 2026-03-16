import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

export function registerWikiTools(server: McpServer, gitlab: GitLabClient) {
  server.tool(
    "list_wiki_pages",
    "List all wiki pages in a project.",
    {
      project_id: z.string().describe("Project ID or path"),
    },
    async ({ project_id }) => {
      const pages = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.all(project_id)
      );

      const results = pages.map((p: { slug: string; title: string; format: string }) => ({
        slug: p.slug,
        title: p.title,
        format: p.format,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.tool(
    "get_wiki_page",
    "Get the content of a specific wiki page by slug.",
    {
      project_id: z.string().describe("Project ID or path"),
      slug: z.string().describe("Wiki page slug"),
    },
    async ({ project_id, slug }) => {
      const page = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.show(project_id, slug)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ slug: page.slug, title: page.title, content: page.content, format: page.format }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "create_wiki_page",
    "Create a new wiki page in a project.",
    {
      project_id: z.string().describe("Project ID or path"),
      title: z.string().describe("Page title"),
      content: z.string().describe("Page content (Markdown)"),
    },
    async ({ project_id, title, content }) => {
      const page = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.create(project_id, content, title)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ slug: page.slug, title: page.title }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "update_wiki_page",
    "Update an existing wiki page's content.",
    {
      project_id: z.string().describe("Project ID or path"),
      slug: z.string().describe("Wiki page slug"),
      title: z.string().optional().describe("New title"),
      content: z.string().describe("Updated content (Markdown)"),
    },
    async ({ project_id, slug, title, content }) => {
      const opts: { content: string; title?: string; format?: string } = { content };
      if (title) opts.title = title;

      const page = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.edit(project_id, slug, opts as { content: string })
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ slug: page.slug, title: page.title }, null, 2),
          },
        ],
      };
    }
  );
}
