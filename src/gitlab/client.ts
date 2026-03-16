import { Gitlab } from "@gitbeaker/rest";

export interface GitLabClientOptions {
  baseUrl: string;
  token: string;
}

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
        const status = (err as { cause?: { response?: { status?: number } } })?.cause?.response
          ?.status;
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

  private formatError(err: unknown): Error {
    if (err instanceof Error) {
      const status = (err as { cause?: { response?: { status?: number } } })?.cause?.response
        ?.status;
      if (status) {
        return new Error(`GitLab API error (HTTP ${status}): ${err.message}`);
      }
      return err;
    }
    return new Error(String(err));
  }
}
