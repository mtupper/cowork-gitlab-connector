import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitLabClient } from "../gitlab/client.js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export function registerUploadTools(server: McpServer, gitlab: GitLabClient) {
  server.tool(
    "upload_file",
    "Upload a file (screenshot, log, etc.) to a GitLab project and return a Markdown link that can be embedded in issues or MR descriptions.",
    {
      project_id: z.string().describe("Project ID or path"),
      file_path: z.string().describe("Absolute path to the local file to upload"),
    },
    async ({ project_id, file_path }) => {
      const fileContent = await readFile(file_path);
      const fileName = basename(file_path);

      const encodedProject = encodeURIComponent(project_id);
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
