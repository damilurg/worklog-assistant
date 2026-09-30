import { Command } from 'commander';
import { syncGitLab } from '@worklog-assistant/gitlab';
import { syncJira } from '@worklog-assistant/jira';
import {
  getActivities,
  getDaySummary,
  generateExportData,
  generateCsvExport,
  generateStandupReport,
} from '@worklog-assistant/planner';
import { resolveDateRange, SyncPeriod } from './dateRange';

interface RangeOptions {
  from?: string;
  to?: string;
  period?: SyncPeriod;
}

function formatRange(fromDate: Date, toDate: Date): string {
  return `${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}`;
}

const program = new Command();

program.name('wl').description('GitLab to Jira Worklog Assistant').version('1.0.0');

program
  .command('gitlab')
  .description('GitLab commands')
  .command('sync')
  .description('Sync GitLab activity')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--period <period>', 'yesterday, week, month, half-year, or year', 'yesterday')
  .action(async (options: RangeOptions) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);
      console.log(`Starting GitLab sync from ${formatRange(fromDate, toDate)}`);
      await syncGitLab(fromDate, toDate);
      console.log('Done!');
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('activity')
  .description('View activity')
  .option('--from <date>', 'Start date')
  .option('--to <date>', 'End date')
  .option('--project <id>', 'Project ID filter')
  .option('--issue <key>', 'Jira Issue filter')
  .option('--unmatched', 'Only unmatched activities')
  .action(async (options) => {
    try {
      const activities = await getActivities({
        fromDate: options.from ? new Date(options.from) : undefined,
        toDate: options.to ? new Date(options.to) : undefined,
        projectId: options.project,
        issueKey: options.issue,
        unmatched: options.unmatched,
      });
      for (const a of activities) {
        console.log(
          `${a.occurredAt.toISOString().split('T')[1].slice(0, 5)} [${a.type}] ${a.title} (Issues: ${a.detectedIssueKeys.join(', ') || 'None'})`,
        );
      }
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('day <date>')
  .description('View day summary (YYYY-MM-DD)')
  .action(async (date) => {
    try {
      const { issues, unmatched } = await getDaySummary(date);

      console.log(`\n${date}\n`);

      for (const [key, acts] of issues.entries()) {
        console.log(`${key}`);
        for (const a of acts) {
          console.log(`  ${a.occurredAt.toISOString().split('T')[1].slice(0, 5)} ${a.title}`);
        }
        console.log('');
      }

      if (unmatched.length > 0) {
        console.log(`Unmatched`);
        for (const a of unmatched) {
          console.log(`  ${a.occurredAt.toISOString().split('T')[1].slice(0, 5)} ${a.title}`);
        }
      }

      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('jira')
  .description('Jira commands')
  .command('sync')
  .description('Sync Jira worklogs')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--period <period>', 'yesterday, week, month, half-year, or year', 'yesterday')
  .action(async (options: RangeOptions) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);
      console.log(`Starting Jira sync from ${formatRange(fromDate, toDate)}`);
      await syncJira(fromDate, toDate);
      console.log('Done!');
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Sync both GitLab activity and Jira worklogs')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--period <period>', 'yesterday, week, month, half-year, or year', 'yesterday')
  .action(async (options: RangeOptions) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);
      console.log(`Starting GitLab and Jira sync from ${formatRange(fromDate, toDate)}`);
      await syncGitLab(fromDate, toDate);
      await syncJira(fromDate, toDate);
      console.log('Done!');
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export data for Jira Assistant')
  .option('--from <date>', 'Start date')
  .option('--to <date>', 'End date')
  .option('--period <period>', 'yesterday, week, month, half-year, or year', 'yesterday')
  .option('--format <format>', 'Export format: csv or json', 'csv')
  .action(async (options: RangeOptions & { format: string }) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);
      const data = await generateExportData(fromDate, toDate);

      if (options.format === 'csv') {
        process.stdout.write(generateCsvExport(data));
      } else if (options.format === 'json') {
        console.log(JSON.stringify(data, null, 2));
      } else {
        throw new Error(`Unsupported export format: ${options.format}`);
      }

      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate a standup report for a given date')
  .option('-d, --date <date>', 'Date in YYYY-MM-DD format (default: yesterday)')
  .action(async (options) => {
    try {
      let targetDate = options.date;
      if (!targetDate) {
        const d = new Date();
        d.setDate(d.getDate() - 1); // Yesterday
        targetDate = d.toISOString().split('T')[0];
      }
      console.log('Generating report for ' + targetDate + '...');
      const report = await generateStandupReport(targetDate);
      console.log(report);
      process.exit(0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Report failed:', message);
      process.exit(1);
    }
  });

program.parse(process.argv);
