import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

function resolveProject(project_id: string | undefined, defaultProject: string | undefined): string {
  const resolved = project_id || defaultProject;
  if (!resolved) throw new Error("project_id is required (no default project configured)");
  return resolved;
}

export function registerUploadTools(server: McpServer, gitlab: GitLabClient, defaultProject?: string) {
  const projectParam = defaultProject
    ? z.string().optional().describe(`Project ID or path (default: ${defaultProject})`)
    : z.string().describe("Project ID or path");

  server.tool(
    "upload_file",
    "Upload a file (screenshot, log, etc.) to a GitLab project and return a Markdown link that can be embedded in issues or MR descriptions.",
    {
      project_id: projectParam,
      file_path: z.string().describe("Absolute path to the local file to upload"),
    },
    async ({ project_id, file_path }) => {
      const pid = resolveProject(project_id, defaultProject);
      const fileContent = await readFile(file_path);
      const fileName = basename(file_path);

      const encodedProject = encodeURIComponent(pid);
      const formData = new FormData();
      formData.append("file", new Blob([fileContent]), fileName);

      const response = await gitlab.withRetry(async () => {
        const res = await fetch(`${gitlab.baseUrl}/api/v4/projects/${encodedProject}/uploads`, {
          method: "POST",
          headers: {
            "PRIVATE-TOKEN": gitlab.token,
          },
          body: formData,
        });
        if (!res.ok) {
          throw new Error(`Upload failed: HTTP ${res.status} ${await res.text()}`);
        }
        return res.json() as Promise<{ alt: string; url: string; full_path: string; markdown: string }>;
      });

      gitlab.logWrite("upload_file", pid, "upload", response.url);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                alt: response.alt,
                url: response.url,
                full_path: response.full_path,
                markdown: response.markdown,
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
