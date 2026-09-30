import {
  db,
  gitlabCommits,
  gitlabMergeRequests,
  activityEvents,
  syncRuns,
} from '@worklog-assistant/db';
import { GitLabClient } from './index';
import { config } from '@worklog-assistant/config';
import * as crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { extractJiraKeys } from '@worklog-assistant/shared';

export async function syncGitLab(fromDate: Date, toDate: Date) {
  const syncRunId = crypto.randomUUID();

  await db.insert(syncRuns).values({
    id: syncRunId,
    provider: 'gitlab',
    startedAt: new Date(),
    status: 'running',
  });

  let recordsReceived = 0;
  let recordsUpdated = 0;

  try {
    for (const instance of config.GITLAB_INSTANCES) {
      console.log(`[GitLab] Syncing instance: ${instance.url}`);
      const client = new GitLabClient(instance.url, instance.token);

      for (const projectId of instance.projectIds) {
        console.log(`  Syncing project ${projectId}...`);

        const pIdStr = projectId.toString();

        // Commits
        const commits = await client.getCommits(pIdStr, fromDate, toDate);
        for (const commit of commits) {
          const isAuthor =
            config.GITLAB_AUTHOR_EMAILS.includes(commit.author_email) ||
            config.GITLAB_AUTHOR_NAMES.includes(commit.author_name);

          if (!isAuthor) continue;

          recordsReceived++;
          const keys = extractJiraKeys(commit.title + ' ' + commit.message);
          const dt = new Date(commit.committed_date || commit.authored_date || new Date());

          await db
            .insert(gitlabCommits)
            .values({
              id: crypto.randomUUID(),
              projectId: pIdStr,
              sha: commit.id,
              shortSha: commit.short_id || commit.id.substring(0, 8),
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              message: commit.message,
              authoredAt: dt,
              committedAt: dt,
              webUrl: commit.web_url,
            })
            .onConflictDoNothing();

          await db
            .insert(activityEvents)
            .values({
              id: crypto.randomUUID(),
              projectId: pIdStr,
              commitSha: commit.id,
              type: 'commit',
              title: commit.title,
              occurredAt: dt,
              detectedIssueKeys: keys,
              sourceUrl: commit.web_url,
            })
            .onConflictDoNothing();

          recordsUpdated++;
        }

        // Merge Requests
        const mrs = await client.getMergeRequests(pIdStr, fromDate, toDate);
        for (const mr of mrs) {
          const isAuthor =
            config.GITLAB_AUTHOR_NAMES.includes(mr.author.name) ||
            config.GITLAB_AUTHOR_NAMES.includes(mr.author.username);

          if (isAuthor) {
            recordsReceived++;
            const keys = extractJiraKeys(mr.title + ' ' + mr.description);

            await db
              .insert(gitlabMergeRequests)
              .values({
                id: crypto.randomUUID(),
                gitlabId: mr.id,
                projectId: pIdStr,
                iid: mr.iid,
                title: mr.title,
                description: mr.description,
                sourceBranch: mr.source_branch || '',
                targetBranch: mr.target_branch || '',
                state: mr.state,
                createdAt: new Date(mr.created_at),
                updatedAt: new Date(mr.updated_at),
                mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
                webUrl: mr.web_url,
              })
              .onConflictDoUpdate({
                target: [gitlabMergeRequests.projectId, gitlabMergeRequests.iid],
                set: { state: mr.state, updatedAt: new Date(mr.updated_at) },
              });

            await db
              .insert(activityEvents)
              .values({
                id: crypto.randomUUID(),
                projectId: pIdStr,
                mergeRequestId: mr.iid.toString(),
                type: 'merge_request_opened',
                title: `MR: ${mr.title}`,
                occurredAt: new Date(mr.created_at),
                detectedIssueKeys: keys,
                sourceUrl: mr.web_url,
              })
              .onConflictDoNothing();
            recordsUpdated++;
          }

          // MR Reviews (Notes)
          const notes = await client.getMergeRequestNotes(pIdStr, mr.iid);
          for (const note of notes) {
            if (note.system) continue;

            const isNoteAuthor =
              config.GITLAB_AUTHOR_NAMES.includes(note.author.name) ||
              config.GITLAB_AUTHOR_NAMES.includes(note.author.username);

            if (!isNoteAuthor) continue;

            recordsReceived++;
            const keys = extractJiraKeys(mr.title);

            await db
              .insert(activityEvents)
              .values({
                id: crypto.randomUUID(),
                projectId: pIdStr,
                mergeRequestId: mr.iid.toString(),
                type: 'merge_request_reviewed',
                title: `Reviewed MR: ${mr.title}`,
                occurredAt: new Date(note.created_at),
                detectedIssueKeys: keys,
              })
              .onConflictDoNothing();
            recordsUpdated++;
          }
        }
      }
    }

    await db
      .update(syncRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        recordsReceived,
        recordsCreated: recordsUpdated,
      })
      .where(sql`id = ${syncRunId}`);

    console.log(`GitLab sync complete. Received: ${recordsReceived}, Processed: ${recordsUpdated}`);
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
