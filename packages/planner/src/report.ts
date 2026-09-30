import { JiraClient } from '@worklog-assistant/jira';
import { config } from '@worklog-assistant/config';

export async function generateStandupReport(dateStr: string): Promise<string> {
  const client = new JiraClient();

  // Find issues the user logged time on for this date
  const jql = '"worklogAuthor" = currentUser() AND "worklogDate" = "' + dateStr + '"';
  const issues = await client.searchIssues(jql);

  if (issues.length === 0) {
    return 'Вчера: Нет загруженных ворклогов.\n\nСегодня:\n- Планирую задачи...';
  }

  // Map issues to project names (extracted from key prefix, e.g., CORE-123 -> CORE)
  const projectMap = new Map<
    string,
    { key: string; summary: string; timeSpentSeconds: number }[]
  >();

  for (const issue of issues) {
    const worklogs = await client.getIssueWorklogs(issue.key);

    // Filter worklogs for this user and this date
    const userWorklogs = worklogs.filter((w) => {
      const isUser =
        w.author.emailAddress === config.JIRA_EMAIL || w.author.accountId === config.JIRA_EMAIL;
      const isDate = w.started.startsWith(dateStr);
      return isUser && isDate;
    });

    let totalSeconds = 0;
    for (const w of userWorklogs) {
      totalSeconds += w.timeSpentSeconds;
    }

    if (totalSeconds > 0) {
      const projectKey = issue.key.split('-')[0];
      if (!projectMap.has(projectKey)) {
        projectMap.set(projectKey, []);
      }
      projectMap.get(projectKey)!.push({
        key: issue.key,
        summary: issue.fields.summary,
        timeSpentSeconds: totalSeconds,
      });
    }
  }

  let report = 'Вчера:\n';
  for (const [project, projectIssues] of projectMap.entries()) {
    report += `\n**Проект ${project}**:\n`;
    for (const i of projectIssues) {
      const hours = (i.timeSpentSeconds / 3600).toFixed(1).replace('.0', '');
      report += `- ${i.key}: ${i.summary} (${hours}h)\n`;
    }
  }

  report += '\nСегодня:\n';
  report += '- [Укажите задачи на сегодня]\n';

  return report;
}
