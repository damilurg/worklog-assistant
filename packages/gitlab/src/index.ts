export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committed_date: string;
  web_url: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string; // opened, closed, locked, merged
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  target_branch: string;
  source_branch: string;
  web_url: string;
  author: { id: number; username: string; name: string };
}

export interface GitLabNote {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  system: boolean;
  author: { id: number; username: string; name: string };
  resolvable: boolean;
}

interface GitLabClientOptions {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
}

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get('retry-after');
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

export class GitLabClient {
  private baseUrl: string;
  private token: string;
  private fetchImpl: typeof fetch;
  private sleep: (milliseconds: number) => Promise<void>;
  private random: () => number;
  private maxAttempts: number;

  constructor(url: string, token: string, options: GitLabClientOptions = {}) {
    this.baseUrl = url.replace(/\/$/, '') + '/api/v4';
    this.token = token;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { 'PRIVATE-TOKEN': this.token },
          signal: AbortSignal.timeout(30_000),
        });

        if (response.ok) return response;
        if (!retryableStatuses.has(response.status)) {
          throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
        }

        lastError = new Error(`GitLab API error: ${response.status} ${response.statusText}`);
        if (attempt === this.maxAttempts) break;

        const retryAfter = retryAfterMilliseconds(response);
        const backoff = 500 * 2 ** (attempt - 1) + Math.floor(this.random() * 250);
        const delay = Math.min(retryAfter ?? backoff, 30_000);
        console.warn(
          `[GitLab] Temporary error ${response.status}; retry ${attempt + 1}/${this.maxAttempts} in ${delay}ms`,
        );
        await this.sleep(delay);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GitLab API error:')) {
          throw error;
        }

        lastError = error;
        if (attempt === this.maxAttempts) break;

        const delay = 500 * 2 ** (attempt - 1) + Math.floor(this.random() * 250);
        console.warn(
          `[GitLab] Network error; retry ${attempt + 1}/${this.maxAttempts} in ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`GitLab request failed after ${this.maxAttempts} attempts: ${message}`);
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T[]> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('per_page', '100');

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const results: T[] = [];
    let currentUrl: string | null = url.toString();

    while (currentUrl) {
      console.log(`[GitLab] Fetching ${currentUrl}`);
      const response = await this.fetchWithRetry(currentUrl);

      const data = (await response.json()) as T[];
      results.push(...data);

      const linkHeader = response.headers.get('link');
      currentUrl = this.getNextPageUrl(linkHeader);
    }

    return results;
  }

  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    const links = linkHeader.split(',');
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) return match[1];
    }
    return null;
  }

  async getCommits(projectId: string, since?: Date, until?: Date): Promise<GitLabCommit[]> {
    const params: Record<string, string> = {};
    if (since) params.since = since.toISOString();
    if (until) params.until = until.toISOString();
    params.all = 'true';

    return this.request<GitLabCommit>(
      `/projects/${encodeURIComponent(projectId)}/repository/commits`,
      params,
    );
  }

  // Get MRs that were created or updated in the timeframe
  async getMergeRequests(
    projectId: string,
    updatedAfter?: Date,
    updatedBefore?: Date,
  ): Promise<GitLabMergeRequest[]> {
    const params: Record<string, string> = {};
    if (updatedAfter) params.updated_after = updatedAfter.toISOString();
    if (updatedBefore) params.updated_before = updatedBefore.toISOString();

    return this.request<GitLabMergeRequest>(
      `/projects/${encodeURIComponent(projectId)}/merge_requests`,
      params,
    );
  }

  async getMergeRequestNotes(
    projectId: string,
    mrIid: number,
    sort: 'asc' | 'desc' = 'asc',
  ): Promise<GitLabNote[]> {
    return this.request<GitLabNote>(
      `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/notes`,
      { sort },
    );
  }
}

export * from './sync';
