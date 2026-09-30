import { JiraClient } from '@worklog-assistant/jira';
import { config } from '@worklog-assistant/config';
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
  const client = new JiraClient();
  const jql = `"worklogAuthor" = currentUser() AND "worklogDate" = "${dateStr}"`;
  const jiraIssueData = await client.searchIssues(jql);
  const jiraIssueMap = new Map(jiraIssueData.map((issue) => [issue.key, issue]));
  const allKeys = new Set([
    ...Array.from(activityByIssue.keys()).filter((key) => key !== 'AMBIGUOUS'),
    ...jiraIssueMap.keys(),
  ]);
  const projectMap = new Map<string, StandupItem[]>();

  for (const key of allKeys) {
    const issue = jiraIssueMap.get(key);
    const activities = activityByIssue.get(key) ?? [];
    let timeSpentSeconds = 0;

    if (issue) {
      const worklogs = await client.getIssueWorklogs(key);
      timeSpentSeconds = worklogs
        .filter((worklog) => {
          const isUser =
            worklog.author.emailAddress === config.JIRA_EMAIL ||
            worklog.author.accountId === config.JIRA_EMAIL;
          return isUser && worklog.started.startsWith(dateStr);
        })
        .reduce((total, worklog) => total + worklog.timeSpentSeconds, 0);
    }

    const uniqueActivities = [...new Set(activities.map((activity) => activity.title))];
    const summary = issue?.fields.summary ?? uniqueActivities[0] ?? 'GitLab activity';
    const projectKey = key.split('-')[0];
    const projectIssues = projectMap.get(projectKey) ?? [];
    projectIssues.push({ key, summary, timeSpentSeconds, activities: uniqueActivities });
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
      for (const activity of item.activities) {
        if (activity !== item.summary) {
          report += `  - GitLab: ${activity}\n`;
        }
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
