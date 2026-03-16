# Cowork GitLab Connector

An MCP (Model Context Protocol) connector that gives Claude access to your GitLab projects. Automate documentation-heavy workflows like filing bug reports, writing MR descriptions, generating release notes, and maintaining wikis — all through natural language.

## What It Does

Connect Claude to your GitLab instance and let it handle the tedious parts of project documentation:

- **File bug reports** from a quick description, error log, or screenshot — Claude structures the title, reproduction steps, labels, and severity for you.
- **Generate MR descriptions** by reading the diff and commit history, so reviewers always have context.
- **Draft release notes** from a milestone's merged MRs and closed issues, categorized by type.
- **Manage issues** — search, create, update, comment, and deduplicate.
- **Maintain wiki pages** — read, create, and update project documentation.
- **Discover templates** — Claude finds your project's issue and MR templates and uses them automatically.

## Prerequisites

- **Node.js** 18 or later
- A **GitLab Personal Access Token** with `api` scope (or granular: `read_api`, `read_repository`, `write_repository`)
- Works with GitLab.com and self-hosted GitLab instances

## Install as a Cowork Custom Connector

### 1. Clone the repository

```bash
git clone https://github.com/mtupper/cowork-gitlab-connector.git
cd cowork-gitlab-connector
```

### 2. Install dependencies and build

```bash
npm install
npm run build
```

### 3. Create a GitLab Personal Access Token

1. Go to **GitLab → Preferences → Access Tokens** (or `/-/user_settings/personal_access_tokens` on your instance).
2. Create a token with the `api` scope.
3. Copy the token — you'll need it in the next step.

### 4. Register the connector in Cowork

Open your Claude Code MCP settings file. The location depends on your setup:

- **Global (all projects):** `~/.claude/claude_desktop_config.json`
- **Project-level:** `.claude/claude_desktop_config.json` in your project root

Add the connector under the `mcpServers` key:

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "node",
      "args": ["/absolute/path/to/cowork-gitlab-connector/dist/index.js"],
      "env": {
        "GITLAB_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_BASE_URL": "https://gitlab.com"
      }
    }
  }
}
```

Replace `/absolute/path/to/cowork-gitlab-connector` with the actual path where you cloned the repo. For self-hosted GitLab, change `GITLAB_BASE_URL` to your instance URL.

### 5. Restart Claude

Restart Claude Code or Cowork to pick up the new connector. You should see the GitLab tools become available.

## Usage

Once installed, just talk to Claude naturally:

> "File a bug for the login page — users are getting a 500 error when submitting the form with special characters in the password field."

> "Write an MR description for MR !42 in my-group/my-project."

> "Generate release notes for the v2.1 milestone."

> "Search for existing issues about the payment timeout bug before I file a new one."

> "Update the API docs wiki page to reflect the new `/users` endpoint."

Claude will use the connector tools automatically based on your request.

## Available Tools

| Category | Tools |
|---|---|
| Projects | `list_projects`, `get_project` |
| Issues | `search_issues`, `get_issue`, `create_issue`, `update_issue`, `add_issue_comment` |
| Merge Requests | `list_merge_requests`, `get_merge_request`, `get_mr_diff`, `update_mr_description`, `add_mr_comment` |
| Labels & Milestones | `list_labels`, `list_milestones`, `get_milestone_issues` |
| Releases | `list_releases`, `create_release_notes_draft` |
| Templates | `list_issue_templates`, `list_mr_templates`, `get_template` |
| Uploads | `upload_file` |
| Wiki | `list_wiki_pages`, `get_wiki_page`, `create_wiki_page`, `update_wiki_page` |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITLAB_TOKEN` | Yes | — | GitLab Personal Access Token |
| `GITLAB_BASE_URL` | No | `https://gitlab.com` | GitLab instance URL |

### Tip: Default Project

You don't need to specify the project every time. Just tell Claude which project you're working on at the start of a conversation, and it will use that context for subsequent requests.

## Development

```bash
npm run dev        # Run in watch mode (auto-reloads on changes)
npm run typecheck  # Type-check without emitting
npm run lint       # Lint the source
npm run build      # Compile TypeScript to dist/
```

## Security Notes

- Your GitLab token is passed via environment variables and never stored in plaintext by the connector.
- All write operations (creating issues, updating MRs, etc.) go through Cowork's permission flow — Claude will ask for your approval before making changes.
- The connector does not cache or persist any GitLab data beyond the current session.
- Use a token with the minimum scopes you need. If you only need read access, `read_api` is sufficient.

## License

MIT
