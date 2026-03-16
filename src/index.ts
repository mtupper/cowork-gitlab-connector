#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitLabClient } from "./gitlab/client.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerLabelMilestoneTools } from "./tools/labels-milestones.js";
import { registerMergeRequestTools } from "./tools/merge-requests.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerReleaseTools } from "./tools/releases.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerUploadTools } from "./tools/uploads.js";
import { registerWikiTools } from "./tools/wiki.js";

const server = new McpServer({
  name: "cowork-gitlab",
  version: "0.1.0",
});

const baseUrl = process.env.GITLAB_BASE_URL ?? "https://gitlab.com";
const token = process.env.GITLAB_TOKEN;
const defaultProject = process.env.GITLAB_DEFAULT_PROJECT;

if (!token) {
  console.error(
    "GITLAB_TOKEN environment variable is required. Set it to a GitLab Personal Access Token."
  );
  process.exit(1);
}

const gitlab = new GitLabClient({ baseUrl, token });

registerProjectTools(server, gitlab);
registerIssueTools(server, gitlab, defaultProject);
registerMergeRequestTools(server, gitlab, defaultProject);
registerLabelMilestoneTools(server, gitlab, defaultProject);
registerReleaseTools(server, gitlab, defaultProject);
registerTemplateTools(server, gitlab, defaultProject);
registerUploadTools(server, gitlab, defaultProject);
registerWikiTools(server, gitlab, defaultProject);

async function main() {
  // Validate token before starting the server
  try {
    const user = await gitlab.validateToken();
    console.error(`Authenticated as ${user.username} (${user.name})`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (defaultProject) {
    console.error(`Default project: ${defaultProject}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cowork GitLab connector running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
