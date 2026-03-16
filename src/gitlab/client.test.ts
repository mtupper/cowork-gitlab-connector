import { describe, it, expect, vi } from "vitest";
import { GitLabClient } from "./client.js";

function makeClient() {
  return new GitLabClient({ baseUrl: "https://gitlab.com", token: "test-token" });
}

describe("GitLabClient", () => {
  describe("withRetry", () => {
    it("returns the result on first success", async () => {
      const client = makeClient();
      const result = await client.withRetry(() => Promise.resolve("ok"));
      expect(result).toBe("ok");
    });

    it("retries on 429 and eventually succeeds", async () => {
      const client = makeClient();
      let attempt = 0;
      const fn = () => {
        attempt++;
        if (attempt < 3) {
          const err = new Error("rate limited");
          (err as any).cause = { response: { status: 429 } };
          return Promise.reject(err);
        }
        return Promise.resolve("ok");
      };

      const result = await client.withRetry(fn, 3);
      expect(result).toBe("ok");
      expect(attempt).toBe(3);
    });

    it("retries on 500 and eventually succeeds", async () => {
      const client = makeClient();
      let attempt = 0;
      const fn = () => {
        attempt++;
        if (attempt === 1) {
          const err = new Error("server error");
          (err as any).cause = { response: { status: 500 } };
          return Promise.reject(err);
        }
        return Promise.resolve("recovered");
      };

      const result = await client.withRetry(fn, 3);
      expect(result).toBe("recovered");
      expect(attempt).toBe(2);
    });

    it("throws immediately on 404 (non-retryable)", async () => {
      const client = makeClient();
      const fn = () => {
        const err = new Error("not found");
        (err as any).cause = { response: { status: 404 } };
        return Promise.reject(err);
      };

      await expect(client.withRetry(fn)).rejects.toThrow(/HTTP 404/);
      await expect(client.withRetry(fn)).rejects.toThrow(/not found/i);
    });

    it("throws immediately on 403 (non-retryable)", async () => {
      const client = makeClient();
      const fn = () => {
        const err = new Error("forbidden");
        (err as any).cause = { response: { status: 403 } };
        return Promise.reject(err);
      };

      await expect(client.withRetry(fn)).rejects.toThrow(/HTTP 403/);
      await expect(client.withRetry(fn)).rejects.toThrow(/Permission denied/);
    });

    it("throws after exhausting all retries", async () => {
      const client = makeClient();
      const fn = () => {
        const err = new Error("server down");
        (err as any).cause = { response: { status: 502 } };
        return Promise.reject(err);
      };

      await expect(client.withRetry(fn, 2)).rejects.toThrow(/HTTP 502/);
    });

    it("includes error hint for 422", async () => {
      const client = makeClient();
      const fn = () => {
        const err = new Error("validation error");
        (err as any).cause = { response: { status: 422 } };
        return Promise.reject(err);
      };

      await expect(client.withRetry(fn)).rejects.toThrow(/Validation failed/);
    });
  });

  describe("formatError", () => {
    it("wraps non-Error values", async () => {
      const client = makeClient();
      const fn = () => Promise.reject("string error");

      await expect(client.withRetry(fn, 0)).rejects.toThrow("string error");
    });
  });

  describe("logWrite", () => {
    it("logs to stderr", () => {
      const client = makeClient();
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      client.logWrite("create_issue", "my/project", "issue", 42);

      expect(spy).toHaveBeenCalledOnce();
      const logged = spy.mock.calls[0][0] as string;
      expect(logged).toContain("[WRITE]");
      expect(logged).toContain("create_issue");
      expect(logged).toContain("my/project");

      spy.mockRestore();
    });
  });
});
