import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient } from "../gitlab/client.js";
import { registerMergeRequestTools } from "./merge-requests.js";

function mockGitlab() {
  const client = new GitLabClient({ baseUrl: "https://gitlab.com", token: "test" });
  client.withRetry = vi.fn((fn) => fn()) as any;
  client.logWrite = vi.fn();
  return client;
}

function getToolHandler(server: McpServer, name: string) {
  const tools = (server as any)._registeredTools;
  const tool = tools?.[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler;
}

describe("Merge Request Tools", () => {
  let server: McpServer;
  let gitlab: ReturnType<typeof mockGitlab>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    gitlab = mockGitlab();
    registerMergeRequestTools(server, gitlab);
  });

  describe("list_merge_requests", () => {
    it("returns mapped MR list", async () => {
      gitlab.api.MergeRequests.all = vi.fn().mockResolvedValue([
        {
          iid: 5,
          title: "Add feature",
          state: "opened",
          source_branch: "feature",
          target_branch: "main",
          web_url: "https://gitlab.com/test/mr/5",
          author: { name: "Michael" },
        },
      ]) as any;

      const handler = getToolHandler(server, "list_merge_requests");
      const result = await handler({ project_id: "my/project", state: "opened", per_page: 20 }, {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].iid).toBe(5);
      expect(parsed[0].source_branch).toBe("feature");
    });
  });

  describe("get_mr_diff", () => {
    it("returns mapped diffs", async () => {
      gitlab.api.MergeRequests.allDiffs = vi.fn().mockResolvedValue([
        {
          old_path: "src/index.ts",
          new_path: "src/index.ts",
          new_file: false,
          deleted_file: false,
          renamed_file: false,
          diff: "@@ -1,3 +1,4 @@\n+new line",
        },
      ]) as any;

      const handler = getToolHandler(server, "get_mr_diff");
      const result = await handler({ project_id: "my/project", mr_iid: 5 }, {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].diff).toContain("+new line");
    });
  });

  describe("update_mr_description", () => {
    it("updates description and logs write", async () => {
      gitlab.api.MergeRequests.edit = vi.fn().mockResolvedValue({
        iid: 5,
        title: "Add feature",
        web_url: "https://gitlab.com/test/mr/5",
      }) as any;

      const handler = getToolHandler(server, "update_mr_description");
      const result = await handler(
        { project_id: "my/project", mr_iid: 5, description: "## Summary\nNew feature" },
        {}
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.iid).toBe(5);
      expect(gitlab.logWrite).toHaveBeenCalledWith("update_mr_description", "my/project", "merge_request", 5);
    });
  });

  describe("add_mr_comment", () => {
    it("adds comment and logs write", async () => {
      gitlab.api.MergeRequestNotes.create = vi.fn().mockResolvedValue({
        id: 77,
        body: "LGTM",
        created_at: "2026-01-01",
      }) as any;

      const handler = getToolHandler(server, "add_mr_comment");
      const result = await handler(
        { project_id: "my/project", mr_iid: 5, body: "LGTM" },
        {}
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.id).toBe(77);
      expect(gitlab.logWrite).toHaveBeenCalledWith("add_mr_comment", "my/project", "mr_note", 77);
    });
  });
});
