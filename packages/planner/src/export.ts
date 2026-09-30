import { getDaySummary } from './index';
import { db, jiraIssues } from '@worklog-assistant/db';
import { inArray } from 'drizzle-orm';

interface ExportIssue {
  key: string;
  suggestedSeconds: number;
  remainingEstimateSeconds: number | null;
  activities: Array<{ type: string; title: string }>;
}

export async function generateExportData(fromDate: Date, toDate: Date) {
  const dates: string[] = [];
  const current = new Date(fromDate);
  while (current <= toDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  const exportData = [];

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
        })),
      });
    }

    if (dayExport.issues.length > 0) {
      exportData.push(dayExport);
    }
  }

  return exportData;
}
