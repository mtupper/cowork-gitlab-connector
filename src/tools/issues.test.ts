import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient } from "../gitlab/client.js";
import { registerIssueTools } from "./issues.js";

// Mock the GitLab client
function mockGitlab() {
  const client = new GitLabClient({ baseUrl: "https://gitlab.com", token: "test" });
  client.withRetry = vi.fn((fn) => fn()) as any;
  client.logWrite = vi.fn();
  return client;
}

// Helper to extract registered tool handler
function getToolHandler(server: McpServer, name: string) {
  const tools = (server as any)._registeredTools;
  const tool = tools?.[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler;
}

describe("Issue Tools", () => {
  let server: McpServer;
  let gitlab: ReturnType<typeof mockGitlab>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    gitlab = mockGitlab();
    registerIssueTools(server, gitlab);
  });

  describe("search_issues", () => {
    it("calls GitLab API and returns mapped results", async () => {
      gitlab.api.Issues.all = vi.fn().mockResolvedValue([
        {
          iid: 1,
          title: "Test issue",
          state: "opened",
          labels: ["bug"],
          web_url: "https://gitlab.com/test/1",
          created_at: "2026-01-01",
          author: { name: "Michael" },
        },
      ]) as any;

      const handler = getToolHandler(server, "search_issues");
      const result = await handler({ project_id: "my/project", per_page: 20 }, {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].iid).toBe(1);
      expect(parsed[0].title).toBe("Test issue");
      expect(parsed[0].author).toBe("Michael");
    });
  });

  describe("create_issue", () => {
    it("creates an issue and logs the write", async () => {
      gitlab.api.Issues.create = vi.fn().mockResolvedValue({
        iid: 42,
        title: "New bug",
        web_url: "https://gitlab.com/test/42",
        state: "opened",
      }) as any;

      const handler = getToolHandler(server, "create_issue");
      const result = await handler(
        { project_id: "my/project", title: "New bug", confidential: false, per_page: 20 },
        {}
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.iid).toBe(42);
      expect(parsed.web_url).toContain("42");
      expect(gitlab.logWrite).toHaveBeenCalledWith("create_issue", "my/project", "issue", 42);
    });
  });

  describe("update_issue", () => {
    it("updates an issue and logs the write", async () => {
      gitlab.api.Issues.edit = vi.fn().mockResolvedValue({
        iid: 10,
        title: "Updated",
        web_url: "https://gitlab.com/test/10",
        state: "opened",
      }) as any;

      const handler = getToolHandler(server, "update_issue");
      const result = await handler(
        { project_id: "my/project", issue_iid: 10, title: "Updated" },
        {}
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.iid).toBe(10);
      expect(gitlab.logWrite).toHaveBeenCalledWith("update_issue", "my/project", "issue", 10);
    });
  });

  describe("add_issue_comment", () => {
    it("adds a comment and logs the write", async () => {
      gitlab.api.IssueNotes.create = vi.fn().mockResolvedValue({
        id: 99,
        body: "investigation notes",
        created_at: "2026-01-01",
      }) as any;

      const handler = getToolHandler(server, "add_issue_comment");
      const result = await handler(
        { project_id: "my/project", issue_iid: 5, body: "investigation notes" },
        {}
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.id).toBe(99);
      expect(parsed.body).toBe("investigation notes");
      expect(gitlab.logWrite).toHaveBeenCalledWith("add_issue_comment", "my/project", "issue_note", 99);
    });
  });

  describe("default project", () => {
    it("uses default project when project_id not provided", async () => {
      const serverWithDefault = new McpServer({ name: "test", version: "0.0.1" });
      registerIssueTools(serverWithDefault, gitlab, "default/project");

      gitlab.api.Issues.all = vi.fn().mockResolvedValue([]) as any;

      const handler = getToolHandler(serverWithDefault, "search_issues");
      await handler({ per_page: 20 }, {});

      expect(gitlab.api.Issues.all).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "default/project" })
      );
    });

    it("explicit project_id overrides default", async () => {
      const serverWithDefault = new McpServer({ name: "test", version: "0.0.1" });
      registerIssueTools(serverWithDefault, gitlab, "default/project");

      gitlab.api.Issues.all = vi.fn().mockResolvedValue([]) as any;

      const handler = getToolHandler(serverWithDefault, "search_issues");
      await handler({ project_id: "other/project", per_page: 20 }, {});

      expect(gitlab.api.Issues.all).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "other/project" })
      );
    });
  });
});
