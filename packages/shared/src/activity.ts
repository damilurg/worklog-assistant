export interface RawActivity {
  id: string;
  source: 'activity_events' | 'jira_worklogs' | 'gitlab_merge_requests';
  timestamp: string;
  type: string;
  title: string;
  issueKeys: string[];
  durationSeconds?: number;
  url?: string;
}
export interface DailyActivity {
  date: string;
  events: number;
  commits: number;
  reviews: number;
  mergedRequests: number;
  loggedSeconds: number;
}
export interface ActivitySummary {
  timezone: 'UTC';
  daily: DailyActivity[];
  hourly: { hour: number; events: number }[];
  totals: {
    events: number;
    commits: number;
    reviews: number;
    mergedRequests: number;
    loggedSeconds: number;
    worklogRows: number;
  };
  rows: RawActivity[];
}
