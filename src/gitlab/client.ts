import { Gitlab } from "@gitbeaker/rest";

export interface GitLabClientOptions {
  baseUrl: string;
  token: string;
}

const ERROR_HINTS: Record<number, string> = {
  401: "Authentication failed. The token may be invalid or expired. Ask the user to verify their GITLAB_TOKEN.",
  403: "Permission denied. The token may not have the required scope (needs 'api' or appropriate granular scopes).",
  404: "Resource not found. Verify the project path/ID exists and the token has access to it.",
  409: "Conflict. The resource may have been modified concurrently. Try fetching the latest state and retrying.",
  422: "Validation failed. Check that required fields are provided and values are valid (e.g., labels exist in the project).",
  429: "Rate limited by GitLab. The request will be retried automatically.",
};

export class GitLabClient {
  public readonly api: InstanceType<typeof Gitlab>;
  public readonly baseUrl: string;
  public readonly token: string;

  constructor(options: GitLabClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.api = new Gitlab({
      host: options.baseUrl,
      token: options.token,
    });
  }

  /**
   * Validate the token on startup by calling GET /user.
   * Throws a clear error if the token is invalid or lacks scopes.
   */
  async validateToken(): Promise<{ username: string; name: string }> {
    try {
      const user = await this.api.Users.showCurrentUser();
      return { username: user.username, name: user.name };
    } catch (err) {
      const status = this.extractStatus(err);
      if (status === 401) {
        throw new Error(
          "GITLAB_TOKEN is invalid or expired. Generate a new token at GitLab > Preferences > Access Tokens."
        );
      }
      throw new Error(`Failed to validate GitLab token: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Execute a GitLab API call with retry logic for rate limits (429) and server errors (5xx).
   * Respects Retry-After headers when available, otherwise uses exponential backoff.
   */
  async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const status = this.extractStatus(err);
        const isRetryable = status === 429 || (status !== undefined && status >= 500);

        if (!isRetryable || attempt === maxRetries) {
          throw this.formatError(err);
        }

        const retryAfter = (err as { cause?: { response?: { headers?: { get(k: string): string | null } } } })
          ?.cause?.response?.headers?.get("retry-after");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * 2 ** attempt, 10000);

        console.error(
          `GitLab API ${status} — retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw this.formatError(lastError);
  }

  /**
   * Log a write operation to stderr for audit trail.
   */
  logWrite(tool: string, project: string, resource: string, id?: string | number): void {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, tool, project, resource, id };
    console.error(`[WRITE] ${JSON.stringify(entry)}`);
  }

  private extractStatus(err: unknown): number | undefined {
    return (err as { cause?: { response?: { status?: number } } })?.cause?.response?.status;
  }

  private formatError(err: unknown): Error {
    if (err instanceof Error) {
      const status = this.extractStatus(err);
      if (status) {
        const hint = ERROR_HINTS[status] ?? "";
        const hintSuffix = hint ? ` ${hint}` : "";
        return new Error(`GitLab API error (HTTP ${status}): ${err.message}.${hintSuffix}`);
      }
      return err;
    }
    return new Error(String(err));
  }
}
