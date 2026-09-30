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

export class GitLabClient {
  private baseUrl: string;
  private token: string;

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/$/, '') + '/api/v4';
    this.token = token;
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
      const response = await fetch(currentUrl, {
        headers: {
          'PRIVATE-TOKEN': this.token,
        },
      });

      if (!response.ok) {
        throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
      }

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
