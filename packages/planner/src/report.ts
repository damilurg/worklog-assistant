import { config } from '@worklog-assistant/config';
import { db, jiraIssues, jiraWorklogs } from '@worklog-assistant/db';
import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { getDaySummary } from './index';

interface StandupItem {
  key: string;
  summary: string;
  timeSpentSeconds: number;
  activities: string[];
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1).replace('.0', '');
}

export async function generateStandupReport(dateStr: string): Promise<string> {
  const { issues: activityByIssue, unmatched } = await getDaySummary(dateStr);
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
  const authorFilter = config.JIRA_EMAIL
    ? or(
        eq(jiraWorklogs.authorEmail, config.JIRA_EMAIL),
        eq(jiraWorklogs.authorAccountId, config.JIRA_EMAIL),
      )
    : undefined;
  const localWorklogs = await db
    .select()
    .from(jiraWorklogs)
    .where(
      and(
        gte(jiraWorklogs.startedAt, startOfDay),
        lte(jiraWorklogs.startedAt, endOfDay),
        authorFilter,
      ),
    );
  const timeByIssue = new Map<string, number>();
  for (const worklog of localWorklogs) {
    timeByIssue.set(
      worklog.jiraIssueKey,
      (timeByIssue.get(worklog.jiraIssueKey) ?? 0) + worklog.durationSeconds,
    );
  }

  const allKeys = new Set([
    ...Array.from(activityByIssue.keys()).filter((key) => key !== 'AMBIGUOUS'),
    ...timeByIssue.keys(),
  ]);
  const allKeyList = [...allKeys];
  const storedIssues =
    allKeyList.length > 0
      ? await db.select().from(jiraIssues).where(inArray(jiraIssues.key, allKeyList))
      : [];
  const storedSummaryMap = new Map(storedIssues.map((issue) => [issue.key, issue.summary]));
  const projectMap = new Map<string, StandupItem[]>();

  for (const key of allKeys) {
    const activities = activityByIssue.get(key) ?? [];
    const uniqueActivities = [...new Set(activities.map((activity) => activity.title))];
    const summary = storedSummaryMap.get(key) ?? uniqueActivities[0] ?? 'GitLab activity';
    const projectKey = key.split('-')[0];
    const projectIssues = projectMap.get(projectKey) ?? [];
    projectIssues.push({
      key,
      summary,
      timeSpentSeconds: timeByIssue.get(key) ?? 0,
      activities: uniqueActivities,
    });
    projectMap.set(projectKey, projectIssues);
  }

  if (projectMap.size === 0 && unmatched.length === 0) {
    return 'Вчера: Нет активности в GitLab и worklog в Jira.\n\nСегодня:\n- Планирую задачи...';
  }

  let report = 'Вчера:\n';
  for (const [project, projectIssues] of projectMap.entries()) {
    report += `\n**Проект ${project}**:\n`;
    for (const item of projectIssues) {
      const time =
        item.timeSpentSeconds > 0 ? ` — Jira: ${formatHours(item.timeSpentSeconds)}h` : '';
      report += `- ${item.key}: ${item.summary}${time}\n`;
      const activityDetails = item.activities.filter((activity) => activity !== item.summary);
      const activityPreview =
        activityDetails.length > 5 ? activityDetails.slice(0, 2) : activityDetails;
      for (const activity of activityPreview) {
        report += `  - GitLab: ${activity}\n`;
      }
      const hiddenCount = activityDetails.length - activityPreview.length;
      if (hiddenCount > 0) {
        report += `  - GitLab: ещё ${hiddenCount} событий\n`;
      }
    }
  }

  const ambiguous = activityByIssue.get('AMBIGUOUS') ?? [];
  const ungroupedActivities = [...unmatched, ...ambiguous];
  if (ungroupedActivities.length > 0) {
    report += '\n**GitLab без однозначной задачи Jira**:\n';
    for (const title of new Set(ungroupedActivities.map((activity) => activity.title))) {
      report += `- ${title}\n`;
    }
  }

  report += '\nСегодня:\n';
  report += '- [Укажите задачи на сегодня]\n';

  return report;
}
