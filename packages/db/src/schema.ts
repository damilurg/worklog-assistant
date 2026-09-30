import { pgTable, text, timestamp, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const syncRuns = pgTable('sync_runs', {
  id: text('id').primaryKey(), // uuid
  provider: text('provider').notNull(), // gitlab, jira
  startedAt: timestamp('started_at').notNull(),
  finishedAt: timestamp('finished_at'),
  status: text('status').notNull(), // running, success, failed
  recordsReceived: integer('records_received').default(0).notNull(),
  recordsCreated: integer('records_created').default(0).notNull(),
  recordsUpdated: integer('records_updated').default(0).notNull(),
  error: text('error'),
});

export const syncCoverage = pgTable(
  'sync_coverage',
  {
    provider: text('provider').notNull(),
    scope: text('scope').default('default').notNull(),
    date: text('date').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    unqProviderScopeDate: uniqueIndex('sync_coverage_provider_scope_date').on(
      t.provider,
      t.scope,
      t.date,
    ),
  }),
);

export const gitlabProjects = pgTable('gitlab_projects', {
  id: text('id').primaryKey(), // stringified gitlab project ID
  name: text('name').notNull(),
});

export const gitlabCommits = pgTable(
  'gitlab_commits',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sha: text('sha').notNull(),
    shortSha: text('short_sha').notNull(),
    message: text('message').notNull(),
    authorName: text('author_name'),
    authorEmail: text('author_email'),
    authoredAt: timestamp('authored_at').notNull(),
    committedAt: timestamp('committed_at').notNull(),
    webUrl: text('web_url'),
  },
  (t) => ({
    unq: uniqueIndex('gitlab_commits_project_sha').on(t.projectId, t.sha),
  }),
);

export const gitlabMergeRequests = pgTable(
  'gitlab_merge_requests',
  {
    id: text('id').primaryKey(), // internal UUID or gitlab ID
    gitlabId: integer('gitlab_id').notNull(),
    iid: integer('iid').notNull(),
    projectId: text('project_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    sourceBranch: text('source_branch').notNull(),
    targetBranch: text('target_branch').notNull(),
    state: text('state').notNull(), // opened, closed, merged, locked
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    mergedAt: timestamp('merged_at'),
    webUrl: text('web_url'),
  },
  (t) => ({
    unq: uniqueIndex('gitlab_mrs_project_iid').on(t.projectId, t.iid),
  }),
);

export const activityEvents = pgTable(
  'activity_events',
  {
    id: text('id').primaryKey(), // uuid
    type: text('type').notNull(), // commit, merge_request_opened, merge_request_updated, merge_request_merged, merge_request_reviewed
    projectId: text('project_id').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    branch: text('branch'),
    commitSha: text('commit_sha'),
    mergeRequestId: text('merge_request_id'),
    detectedIssueKeys: text('detected_issue_keys').array().notNull(),
    sourceUrl: text('source_url'),
  },
  (t) => ({
    idxOccurredAt: index('idx_activity_occurred_at').on(t.occurredAt),
    unq: uniqueIndex('activity_events_unique_source').on(
      t.projectId,
      t.type,
      t.commitSha,
      t.mergeRequestId,
      t.occurredAt,
    ), // Simple idempotency
  }),
);

export const jiraIssues = pgTable('jira_issues', {
  key: text('key').primaryKey(),
  summary: text('summary'),
  originalEstimateSeconds: integer('original_estimate_seconds'),
  remainingEstimateSeconds: integer('remaining_estimate_seconds'),
});

export const jiraWorklogs = pgTable('jira_worklogs', {
  id: text('id').primaryKey(), // internal UUID
  jiraWorklogId: text('jira_worklog_id').notNull().unique(),
  jiraIssueKey: text('jira_issue_key').notNull(),
  author: text('author').notNull(),
  authorAccountId: text('author_account_id'),
  authorEmail: text('author_email'),
  startedAt: timestamp('started_at').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const worklogDays = pgTable('worklog_days', {
  date: text('date').primaryKey(), // YYYY-MM-DD
  targetSeconds: integer('target_seconds').notNull(),
});

export const worklogEntries = pgTable(
  'worklog_entries',
  {
    id: text('id').primaryKey(), // uuid
    date: text('date').notNull(), // YYYY-MM-DD
    jiraIssueKey: text('jira_issue_key').notNull(),
    state: text('state').notNull(), // draft, approved, syncing, synced, failed
    durationSeconds: integer('duration_seconds').notNull(),
    comment: text('comment'),
    jiraWorklogId: text('jira_worklog_id'),
    syncedAt: timestamp('synced_at'),
  },
  (t) => ({
    unqDateIssue: uniqueIndex('worklog_entries_date_issue').on(t.date, t.jiraIssueKey),
  }),
);

export const worklogEntryActivities = pgTable(
  'worklog_entry_activities',
  {
    worklogEntryId: text('worklog_entry_id').notNull(),
    activityEventId: text('activity_event_id').notNull(),
  },
  (t) => ({
    pk: uniqueIndex('worklog_entry_activities_pk').on(t.worklogEntryId, t.activityEventId),
  }),
);
