import { getDaySummary } from './index';
import { db, jiraIssues } from '@worklog-assistant/db';
import { config } from '@worklog-assistant/config';
import { inArray } from 'drizzle-orm';

export interface ExportIssue {
  key: string;
  suggestedSeconds: number;
  remainingEstimateSeconds: number | null;
  activities: Array<{ type: string; title: string; occurredAt: string }>;
}

export interface ExportDay {
  date: string;
  targetSeconds: number;
  issues: ExportIssue[];
}

export async function generateExportData(fromDate: Date, toDate: Date) {
  const dates: string[] = [];
  const current = new Date(fromDate);
  while (current <= toDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  const exportData: ExportDay[] = [];

  for (const dateStr of dates) {
    const { issues } = await getDaySummary(dateStr);

    if (issues.size === 0) continue;

    const dayExport = {
      date: dateStr,
      targetSeconds: 28800,
      issues: [] as ExportIssue[],
    };

    // Get estimates for these issues
    const keys = Array.from(issues.keys()).filter((k) => k !== 'AMBIGUOUS');
    const issueData =
      keys.length > 0
        ? await db.select().from(jiraIssues).where(inArray(jiraIssues.key, keys))
        : [];
    const estimateMap = new Map<string, number>();
    issueData.forEach((i) => {
      if (i.remainingEstimateSeconds !== null && i.remainingEstimateSeconds !== undefined) {
        estimateMap.set(i.key, i.remainingEstimateSeconds);
      }
    });

    let timeRemaining = 28800;

    // First pass: Calculate suggested time capped by estimation
    const allocations = new Map<string, number>();
    const unlimitedKeys = [];

    for (const key of keys) {
      const estimate = estimateMap.get(key);
      if (estimate !== undefined && estimate > 0) {
        const fairShare = Math.floor(timeRemaining / keys.length); // naive fair share
        const allocation = Math.min(fairShare, estimate);
        allocations.set(key, allocation);
        timeRemaining -= allocation;
      } else {
        unlimitedKeys.push(key);
      }
    }

    // Second pass: distribute remaining time
    if (timeRemaining > 0 && unlimitedKeys.length > 0) {
      const perIssue = Math.floor(timeRemaining / unlimitedKeys.length);
      for (const key of unlimitedKeys) {
        allocations.set(key, perIssue);
      }
    } else if (timeRemaining > 0 && keys.length > 0) {
      // if all had estimates but we still have time left, just divide it evenly to exceed estimates
      const extra = Math.floor(timeRemaining / keys.length);
      for (const key of keys) {
        allocations.set(key, (allocations.get(key) || 0) + extra);
      }
    }

    for (const [key, activities] of issues.entries()) {
      if (key === 'AMBIGUOUS') continue;

      dayExport.issues.push({
        key,
        suggestedSeconds: allocations.get(key) || 0,
        remainingEstimateSeconds: estimateMap.get(key) || null,
        activities: activities.map((a) => ({
          type: a.type,
          title: a.title,
          occurredAt: a.occurredAt.toISOString(),
        })),
      });
    }

    if (dayExport.issues.length > 0) {
      exportData.push(dayExport);
    }
  }

  return exportData;
}

function formatCsvDate(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[Number(part('month')) - 1];

  return `${part('day')}-${month}-${part('year')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const values: string[] = [];

  if (hours > 0) values.push(`${hours}h`);
  if (minutes > 0 || values.length === 0) values.push(`${minutes}m`);

  return values.join(' ');
}

function escapeCsv(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function generateCsvExport(days: ExportDay[]): string {
  const rows = ['Ticket No,Start Date,Timespent,Comment'];

  for (const day of days) {
    for (const issue of day.issues) {
      const uniqueActivities = [...new Set(issue.activities.map((activity) => activity.title))];
      const firstActivity = issue.activities[0]?.occurredAt ?? `${day.date}T09:00:00.000Z`;
      const comment = uniqueActivities.join('; ') || `Work on ${issue.key}`;

      rows.push(
        [
          issue.key,
          formatCsvDate(firstActivity, config.TIMEZONE),
          formatDuration(issue.suggestedSeconds),
          comment,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }
  }

  return `${rows.join('\n')}\n`;
}
