# Implementation Guide — Cowork GitLab Connector

Internal reference for what's done, what's left, and how to ship this.

## Current State (v0.1.0)

We have a working MCP server with 25 tools across 8 categories. The core is built: TypeScript, `@modelcontextprotocol/sdk` for the server framework, `@gitbeaker/rest` for GitLab API calls, Zod for input validation. It runs over stdio, authenticates with a PAT via environment variable, and has retry logic with exponential backoff for rate limits and transient errors.

Everything in Phase 1 and Phase 2 of the PRD is implemented in code. Here's what we actually need to do to make this production-ready.

---

## Must-Do Before Sharing Externally

### 1. Testing

There are no tests right now. This is the biggest gap.

**Unit tests** — Each tool handler in `src/tools/` should have tests that mock the GitLab API client and verify the tool returns the right shape. Use Vitest (it plays well with ESM and TypeScript). Key things to cover:

- Input validation (Zod schemas reject bad inputs)
- Happy-path responses (correct fields returned, data mapped properly)
- Error handling (API errors get formatted with status codes, not raw exceptions)
- Retry logic in `src/gitlab/client.ts` (mock 429 and 5xx responses, verify backoff)

**Integration tests** — Stand up a test project on GitLab.com (or use a self-hosted instance) and run the tools against real API endpoints. These can be slower and run separately from unit tests. At minimum, test the full lifecycle: create an issue → search for it → add a comment → close it.

### 2. Input Validation Hardening

The Zod schemas define the types, but we should add:

- `project_id` format validation (must be a number or a string matching `group/project` pattern)
- Description length limits (GitLab has a 1MB limit on issue descriptions)
- Label name validation (no commas inside label names when we split on commas)
- Pagination bounds checking (enforce `per_page` between 1 and 100)

### 3. Error Messages for Claude

Right now errors return the HTTP status and GitLab's error message. We should add contextual hints that help Claude recover. For example:

- 404 on a project → "Project not found. Ask the user to verify the project path or check that the token has access."
- 403 → "Permission denied. The token may not have the required scope."
- 422 on issue creation → "Validation failed. Check that required fields (title) are provided and labels exist in the project."

### 4. Token Scope Validation

On startup, make a quick `GET /user` call to verify the token is valid and has the right scopes. Fail fast with a clear error message rather than letting the first tool call fail cryptically.

### 5. Logging

Add structured logging (at minimum, log every write operation with the tool name, project, and resource ID). This gives us an audit trail and makes debugging easier. Use stderr since stdout is reserved for MCP protocol messages.

---

## Should-Do Before v1.0

### 6. OAuth 2.0 Support (Phase 3)

PATs work for personal use, but for distribution we need OAuth. This involves:

- Registering a GitLab OAuth application
- Implementing the authorization code flow (redirect URI, token exchange, refresh)
- Storing tokens securely (system keychain via `keytar` or similar)
- Handling token expiry and refresh transparently

This is the biggest single piece of work remaining and is required for the connector to work in hosted Cowork (where users can't set environment variables).

### 7. SSE/HTTP Transport (Phase 3)

The connector currently only supports stdio (local use with Claude Code). For hosted Cowork, we need an HTTP transport using Server-Sent Events. The MCP SDK supports this — we need to add it as an alternative transport mode, likely behind a CLI flag or config option.

### 8. Default Project Configuration

The PRD mentions a `defaults.projectId` config option so users don't have to specify the project every time. This isn't implemented yet. Options:

- Read from a config file (`.cowork-gitlab.json` in the project root)
- Accept it as an environment variable (`GITLAB_DEFAULT_PROJECT`)
- Let Claude infer it from conversation context (no code change needed, just prompting)

The environment variable approach is simplest and consistent with how we handle `GITLAB_TOKEN`.

### 9. Built-in Prompt Templates

The `src/templates/` directory exists but is empty. We planned to ship default templates for bug reports, MR descriptions, and release notes. These aren't strictly necessary (Claude does a good job without them), but they'd improve consistency. We could ship them as markdown files that get read at startup and included in tool descriptions.

### 10. Rate Limit Awareness

The retry logic handles 429s, but we don't proactively track the `RateLimit-Remaining` header. For heavy usage (e.g., generating release notes for a milestone with 50+ MRs), we could hit limits. Add header tracking and optionally slow down requests when remaining calls are low.

---

## Nice-to-Have / Future

### 11. Batch Operations

Bulk issue updates, label cleanup, cross-project searches. These are Phase 3 items and aren't urgent.

### 12. Webhook-Triggered Automation

Auto-generate MR descriptions when a new MR is created. Requires a webhook listener, which means either a hosted service or a local server. Defer until we have the HTTP transport.

### 13. CI/CD Pipeline Status

Enrich MR descriptions with pipeline status (pass/fail, test coverage). Useful but not core to the documentation workflow.

### 14. npm Package Publishing

If we want others to install this with `npm install -g cowork-gitlab-connector`, we need to publish to npm. This means cleaning up the `package.json` (add `bin` field, `files` field, `engines`), writing a proper `.npmignore`, and setting up a publish workflow.

### 15. Plugin Packaging for Cowork

For distribution through Cowork's plugin system, we'd need to package this as a `.plugin` file with a manifest. This is the ideal distribution path once the plugin marketplace is more mature.

---

## Architecture Decisions to Make

**Multi-project support:** The tools currently require `project_id` on every call. Should we add a `set_default_project` tool that Claude can call once per conversation? This would reduce friction but adds state to the server.

**Approval flow for writes:** Cowork's MCP permission system handles this at the transport level, so we don't need to build our own confirmation flow. But we should verify this works correctly for all write tools (create_issue, update_issue, create_wiki_page, etc.).

**Self-hosted GitLab compatibility:** The Gitbeaker client handles API differences, but we should test against at least one self-hosted instance (GitLab CE) to make sure URLs, authentication, and API versions work correctly.

---

## Immediate Next Steps

1. **Add Vitest and write unit tests** for the tool handlers (start with issues and merge-requests, they're the most used).
2. **Add token validation on startup** — quick win that improves the first-run experience.
3. **Improve error messages** with Claude-friendly recovery hints.
4. **Test against a real GitLab project** end-to-end and fix any rough edges.
5. **Add `GITLAB_DEFAULT_PROJECT` env var support** — small change, big UX improvement.
