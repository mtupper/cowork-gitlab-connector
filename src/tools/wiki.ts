import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";

function resolveProject(project_id: string | undefined, defaultProject: string | undefined): string {
  const resolved = project_id || defaultProject;
  if (!resolved) throw new Error("project_id is required (no default project configured)");
  return resolved;
}

export function registerWikiTools(server: McpServer, gitlab: GitLabClient, defaultProject?: string) {
  const projectParam = defaultProject
    ? z.string().optional().describe(`Project ID or path (default: ${defaultProject})`)
    : z.string().describe("Project ID or path");

  server.tool(
    "list_wiki_pages",
    "List all wiki pages in a project.",
    {
      project_id: projectParam,
    },
    async ({ project_id }) => {
      const pid = resolveProject(project_id, defaultProject);
      const pages = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.all(pid)
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
      project_id: projectParam,
      slug: z.string().describe("Wiki page slug"),
    },
    async ({ project_id, slug }) => {
      const pid = resolveProject(project_id, defaultProject);
      const page = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.show(pid, slug)
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
      project_id: projectParam,
      title: z.string().min(1).describe("Page title"),
      content: z.string().min(1).describe("Page content (Markdown)"),
    },
    async ({ project_id, title, content }) => {
      const pid = resolveProject(project_id, defaultProject);
      const page = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.create(pid, content, title)
      );

      gitlab.logWrite("create_wiki_page", pid, "wiki_page", page.slug);

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
      project_id: projectParam,
      slug: z.string().describe("Wiki page slug"),
      title: z.string().optional().describe("New title"),
      content: z.string().min(1).describe("Updated content (Markdown)"),
    },
    async ({ project_id, slug, title, content }) => {
      const pid = resolveProject(project_id, defaultProject);
      const opts: { content: string; title?: string; format?: string } = { content };
      if (title) opts.title = title;

      const page = await gitlab.withRetry(() =>
        gitlab.api.ProjectWikis.edit(pid, slug, opts as { content: string })
      );

      gitlab.logWrite("update_wiki_page", pid, "wiki_page", page.slug);

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
