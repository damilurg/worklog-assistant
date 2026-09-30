import { config } from '@worklog-assistant/config';

export interface JiraWorklog {
  id: string;
  issueId: string;
  author: {
    accountId: string;
    emailAddress: string;
    displayName: string;
  };
  updateAuthor: {
    accountId: string;
  };
  comment: unknown; // Atlassian Document Format in v3, or string in v2
  created: string;
  updated: string;
  started: string;
  timeSpentSeconds: number;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    timeoriginalestimate?: number;
    timeestimate?: number;
  };
}

export class JiraClient {
  private baseUrl: string;
  private email: string;
  private token: string;
  private authMode: 'cloud' | 'data-center';

  constructor() {
    this.authMode = config.JIRA_AUTH_MODE;
    const apiVersion = this.authMode === 'data-center' ? '2' : '3';
    this.baseUrl = config.JIRA_URL
      ? `${config.JIRA_URL.replace(/\/$/, '')}/rest/api/${apiVersion}`
      : '';
    this.email = config.JIRA_EMAIL || '';
    this.token = config.JIRA_TOKEN || '';
  }

  private get authHeader() {
    if (this.authMode === 'data-center') {
      return `Bearer ${this.token}`;
    }

    return 'Basic ' + Buffer.from(`${this.email}:${this.token}`).toString('base64');
  }

  async searchIssues(jql: string): Promise<JiraIssue[]> {
    if (!this.baseUrl) throw new Error('JIRA_URL is not configured');

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql,
        fields: ['summary', 'timeoriginalestimate', 'timeestimate'],
        maxResults: 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { issues: JiraIssue[] };
    return data.issues;
  }

  async getIssueWorklogs(issueKey: string): Promise<JiraWorklog[]> {
    if (!this.baseUrl) throw new Error('JIRA_URL is not configured');

    const response = await fetch(`${this.baseUrl}/issue/${issueKey}/worklog`, {
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { worklogs: JiraWorklog[] };
    return data.worklogs;
  }
}

export * from './sync';
