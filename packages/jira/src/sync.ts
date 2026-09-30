import { db, jiraIssues, jiraWorklogs, syncRuns } from '@worklog-assistant/db';
import { JiraClient } from './index';
import { config } from '@worklog-assistant/config';
import * as crypto from 'crypto';
import { sql } from 'drizzle-orm';

export async function syncJira(fromDate: Date, toDate: Date) {
  const client = new JiraClient();
  const syncRunId = crypto.randomUUID();

  await db.insert(syncRuns).values({
    id: syncRunId,
    provider: 'jira',
    startedAt: new Date(),
    status: 'running',
  });

  let recordsReceived = 0;
  let recordsCreated = 0;

  try {
    // Format YYYY-MM-DD
    const fromStr = fromDate.toISOString().split('T')[0];
    const toStr = toDate.toISOString().split('T')[0];

    // Find issues where we logged work in this period
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${fromStr}" AND worklogDate <= "${toStr}"`;
    console.log(`[Jira] Searching issues: ${jql}`);

    const issues = await client.searchIssues(jql);

    for (const issue of issues) {
      await db
        .insert(jiraIssues)
        .values({
          key: issue.key,
          summary: issue.fields.summary,
          originalEstimateSeconds: issue.fields.timeoriginalestimate,
          remainingEstimateSeconds: issue.fields.timeestimate,
        })
        .onConflictDoUpdate({
          target: jiraIssues.key,
          set: {
            summary: issue.fields.summary,
            originalEstimateSeconds: issue.fields.timeoriginalestimate,
            remainingEstimateSeconds: issue.fields.timeestimate,
          },
        });

      const worklogs = await client.getIssueWorklogs(issue.key);

      for (const wl of worklogs) {
        // Check if author matches
        if (
          wl.author.emailAddress !== config.JIRA_EMAIL &&
          wl.author.accountId !== config.JIRA_EMAIL
        ) {
          // basic fallback
          // To be safe we could just save it anyway or filter by our email
        }

        recordsReceived++;

        // Format comment if it's ADF
        let commentText = '';
        if (wl.comment && typeof wl.comment === 'string') {
          commentText = wl.comment;
        } else if (wl.comment && typeof wl.comment === 'object' && 'content' in wl.comment) {
          // Simplistic ADF to text
          commentText = JSON.stringify(wl.comment);
        }

        await db
          .insert(jiraWorklogs)
          .values({
            id: crypto.randomUUID(),
            jiraWorklogId: wl.id,
            jiraIssueKey: issue.key,
            author: wl.author.displayName || wl.author.emailAddress || 'Unknown',
            startedAt: new Date(wl.started),
            durationSeconds: wl.timeSpentSeconds,
            comment: commentText,
            createdAt: new Date(wl.created),
            updatedAt: new Date(wl.updated),
          })
          .onConflictDoUpdate({
            target: jiraWorklogs.jiraWorklogId,
            set: {
              startedAt: new Date(wl.started),
              durationSeconds: wl.timeSpentSeconds,
              comment: commentText,
              updatedAt: new Date(wl.updated),
            },
          });

        recordsCreated++;
      }
    }

    await db
      .update(syncRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        recordsReceived,
        recordsCreated,
      })
      .where(sql`id = ${syncRunId}`);

    console.log(`Jira sync complete. Received: ${recordsReceived}, Processed: ${recordsCreated}`);
  } catch (err: any) {
    console.error(err);
    await db
      .update(syncRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        error: err.message,
      })
      .where(sql`id = ${syncRunId}`);
    throw err;
  }
}
