# PRD — Claude Cowork GitLab Connector

**Owner:** Michael
**Date:** 2026-03-15
**Status:** Draft

## 1) Summary

Build a **Claude Cowork Connector for GitLab** that enables Claude to interact with GitLab projects on behalf of the user to automate documentation-heavy workflows. Primary use cases include:
- **Filing bug reports** from natural-language descriptions, logs, or screenshots,
- **Writing and updating issue descriptions** with structured templates,
- **Drafting merge request descriptions** from diffs and commit history,
- **Generating release notes** from merged MRs in a milestone,
- **Maintaining wikis and project documentation** based on code changes.

The connector exposes GitLab operations as MCP (Model Context Protocol) tools, allowing Claude (via Cowork or Claude Code) to read from and write to GitLab projects with the user's authorization.

## 2) Problem / Motivation

Documentation tasks in GitLab are repetitive, time-consuming, and often skipped or done poorly:
- **Bug reports** lack reproduction steps, environment details, or proper labeling because filing them is tedious.
- **MR descriptions** are left blank or contain only a title, making reviews slower and history harder to trace.
- **Release notes** require manually combing through dozens of merged MRs.
- **Wiki/docs maintenance** falls behind because updating docs after code changes is a separate, easy-to-forget step.

Claude can automate these tasks — but only if it has structured, authorized access to GitLab's API. Today there is no Cowork connector for GitLab, so users must copy-paste between Claude and GitLab manually.

## 3) Goals

1. **MCP-based connector** that exposes GitLab API operations as tools Claude can invoke.
2. **Bug report automation:** Claude can file well-structured bug reports from minimal user input (description, logs, screenshots, error messages).
3. **MR description generation:** Claude can read a diff/commits and produce a structured MR description.
4. **Issue management:** Claude can search, read, create, update, and comment on issues.
5. **Release notes:** Claude can aggregate merged MRs for a milestone/tag and draft release notes.
6. **Wiki/docs:** Claude can read and update project wiki pages.
7. **Template-aware:** The connector respects project-level issue and MR templates.
8. **Secure auth:** OAuth 2.0 or personal access token (PAT) flow with minimal required scopes.

## 4) Non-Goals

- Full GitLab administration (user management, CI/CD pipeline configuration, runner setup).
- Real-time event streaming or webhooks (polling or on-demand only for v1).
- Replacing the GitLab UI for interactive workflows (this is a headless automation layer).
- Support for GitHub, Bitbucket, or other forges (GitLab-only scope).

## 5) Primary Users / Personas

- **Developer (Michael):** Wants to say "file a bug for the crash in the auth module" and have Claude produce a properly labeled, well-structured GitLab issue without leaving the editor.
- **Team lead:** Wants to generate weekly release notes or sprint summaries from GitLab data.
- **Reviewer:** Wants MR descriptions auto-populated so code reviews have context.

## 6) User Stories

### Bug Reports
- As a developer, I can describe a bug in natural language and have Claude file a GitLab issue with title, description, reproduction steps, environment info, severity label, and assignee.
- As a developer, I can paste an error log or stack trace and have Claude extract the relevant details into a bug report.
- As a developer, I can reference a screenshot and have Claude include it in the issue (via upload or link).

### Issue Management
- As a developer, I can ask Claude to search for existing issues before filing a duplicate.
- As a developer, I can ask Claude to update an issue's description, labels, or status.
- As a developer, I can ask Claude to add a comment summarizing investigation findings to an existing issue.

### Merge Request Descriptions
- As a developer, I can ask Claude to generate an MR description from the branch diff and commit messages.
- As a developer, I can ask Claude to update an MR description after new commits are pushed.

### Release Notes
- As a team lead, I can ask Claude to draft release notes for a milestone by aggregating all merged MRs and closed issues.
- As a team lead, I can specify a format (changelog, user-facing notes, internal notes) and Claude adapts.

### Wiki / Documentation
- As a developer, I can ask Claude to update a wiki page when an API or feature changes.
- As a developer, I can ask Claude to create a new wiki page from a template.

## 7) Key Concepts

### Connector Architecture
The connector is an **MCP server** that:
1. Authenticates with GitLab via PAT or OAuth 2.0 token.
2. Exposes a set of **tools** (MCP tool definitions) that map to GitLab API v4 endpoints.
3. Runs locally (alongside Claude Code) or as a hosted service (for Cowork cloud).

### Tool Categories
| Category | Tools |
|---|---|
| **Projects** | `list_projects`, `get_project` |
| **Issues** | `search_issues`, `get_issue`, `create_issue`, `update_issue`, `add_issue_comment` |
| **Merge Requests** | `list_merge_requests`, `get_merge_request`, `get_mr_diff`, `create_mr_description`, `add_mr_comment` |
| **Labels & Milestones** | `list_labels`, `list_milestones`, `get_milestone_issues` |
| **Wiki** | `list_wiki_pages`, `get_wiki_page`, `create_wiki_page`, `update_wiki_page` |
| **Releases** | `list_releases`, `create_release_notes_draft` |
| **Uploads** | `upload_file` (for attaching screenshots/logs to issues) |
| **Templates** | `list_issue_templates`, `list_mr_templates`, `get_template` |

### Documentation Templates
The connector ships with built-in prompt templates for common documentation tasks:
- **Bug report template:** Structured sections for summary, steps to reproduce, expected vs actual behavior, environment, severity.
- **MR description template:** Summary, changes made, testing done, screenshots, related issues.
- **Release notes template:** Version header, new features, bug fixes, breaking changes, contributors.

These can be overridden by project-level templates discovered via the Templates tools.

## 8) Functional Requirements

### 8.1 Authentication
- Support **Personal Access Token (PAT)** authentication (v1).
- Support **OAuth 2.0 authorization code flow** (v2).
- Token stored securely (system keychain or encrypted config).
- Required scopes: `api` (or granular: `read_api`, `read_repository`, `write_repository`).
- Support self-hosted GitLab instances (configurable base URL).

### 8.2 Issue Operations

**create_issue**
- Inputs: `project_id`, `title`, `description`, `labels[]`, `milestone_id`, `assignee_ids[]`, `confidential`, `due_date`
- Claude composes `title` and `description` from user's natural-language input.
- If the project has issue templates, Claude fetches and populates the appropriate one.
- Returns: created issue URL and IID.

**search_issues**
- Inputs: `project_id`, `search` (text query), `labels[]`, `state`, `scope`
- Used by Claude to check for duplicates before filing.

**update_issue / add_issue_comment**
- Standard CRUD for modifying existing issues.

### 8.3 Merge Request Operations

**get_mr_diff**
- Inputs: `project_id`, `mr_iid`
- Returns: diff content, changed files list, commit messages.
- Claude uses this to generate MR descriptions.

**create_mr_description**
- Inputs: `project_id`, `mr_iid`, `description`
- Updates the MR's description field with Claude-generated content.

### 8.4 Release Notes Generation

**get_milestone_issues**
- Inputs: `project_id`, `milestone_id`
- Returns: all issues and MRs associated with the milestone.

Claude aggregates these into formatted release notes grouped by type (feature, fix, chore).

### 8.5 Wiki Operations
- CRUD on project wiki pages via GitLab Wikis API.
- Claude can read existing pages for context before updating.

### 8.6 File Uploads
- Upload images/files to a project and return the markdown link.
- Used for attaching screenshots to bug reports.

### 8.7 Template Discovery
- List and read issue/MR templates from `.gitlab/issue_templates/` and `.gitlab/merge_request_templates/` in the repo.
- Claude uses discovered templates to structure its output.

## 9) Configuration

```jsonc
{
  "name": "gitlab",
  "version": "0.1.0",
  "transport": "stdio",
  "config": {
    "baseUrl": "https://gitlab.com",       // or self-hosted URL
    "auth": {
      "type": "pat",                        // "pat" | "oauth2"
      "token": "${GITLAB_TOKEN}"            // env var reference
    },
    "defaults": {
      "projectId": "my-group/my-project",   // default project
      "labels": ["bug"],                    // default labels for bug reports
      "bugTemplate": "bug",                 // default issue template name
      "mrTemplate": "default"               // default MR template name
    }
  }
}
```

## 10) Technical Architecture

### 10.1 MCP Server
- **Runtime:** Node.js (TypeScript) or Python.
- **Transport:** stdio (for Claude Code local) and SSE/HTTP (for hosted Cowork).
- **Dependencies:** GitLab API v4 client (`@gitbeaker/rest` for Node or `python-gitlab` for Python).

### 10.2 Tool Registration
Each tool is registered with:
- Name and description (used by Claude to decide when to invoke it).
- JSON Schema for input parameters.
- Handler function that calls GitLab API and returns structured results.

### 10.3 Rate Limiting & Error Handling
- Respect GitLab's rate limits (track `RateLimit-Remaining` headers).
- Return structured errors that Claude can interpret and communicate to the user.
- Retry with backoff on 429/5xx responses.

### 10.4 Data Flow

```
User (natural language)
  → Claude (interprets intent, composes structured data)
    → Cowork GitLab Connector (MCP tools)
      → GitLab API v4
        → GitLab project (issues, MRs, wiki, etc.)
```

## 11) Security & Privacy

- **Least privilege:** Request only the API scopes needed for enabled tools.
- **No credential storage in plaintext:** Use env vars or system keychain.
- **Audit trail:** Log all write operations (issue created, MR updated) with timestamps.
- **User confirmation:** Write operations (create/update) require explicit user approval via MCP permission flow before execution.
- **Data minimization:** Don't cache or persist GitLab data beyond the current session unless explicitly configured.

## 12) Success Metrics

- A developer can file a well-structured bug report in **<30 seconds** of natural-language interaction (vs. 3-5 minutes manually).
- **>80%** of auto-generated bug reports require no manual edits before submission.
- MR descriptions are auto-populated for **>90%** of merge requests when the connector is active.
- Release notes for a milestone can be generated in **<1 minute** regardless of MR count.

## 13) Milestones / Phases

### Phase 1 — Core Issue & MR Tools
- PAT authentication
- Project listing and selection
- Issue CRUD (create, read, update, comment, search)
- MR description generation from diffs
- Built-in bug report and MR description templates
- stdio transport for Claude Code

### Phase 2 — Templates, Wiki & Releases
- Template discovery from `.gitlab/` directory
- Wiki page CRUD
- Release notes generation from milestones
- File upload for screenshots/attachments
- Label and milestone management tools

### Phase 3 — Advanced Automation & Hosting
- OAuth 2.0 flow
- SSE/HTTP transport for hosted Cowork
- Batch operations (e.g., label cleanup, bulk issue updates)
- Webhook-triggered automation (e.g., auto-generate MR description on MR creation)
- Integration with CI/CD pipeline status for richer MR descriptions

## 14) Open Questions

1. **Language choice:** Node.js (TypeScript) vs Python for the MCP server? TypeScript aligns with existing MCP tooling; Python has `python-gitlab` which is mature.
2. **Hosted vs local-only for v1?** Starting with stdio/local keeps scope small, but hosted enables Cowork cloud use.
3. **Template customization:** Should users be able to define custom prompt templates beyond GitLab's issue/MR templates? (e.g., "always include severity and component labels")
4. **Multi-project support:** Should the connector handle multiple GitLab projects simultaneously, or require explicit project switching?
5. **Approval flow:** For write operations, should Claude auto-execute after user says "file the bug", or always show a preview and ask for confirmation?
