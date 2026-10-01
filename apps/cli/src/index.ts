import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
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
import { syncIncrementally } from './incrementalSync';
import { config } from '@worklog-assistant/config';

interface RangeOptions {
  from?: string;
  to?: string;
  period?: SyncPeriod;
  force?: boolean;
}

function formatRange(fromDate: Date, toDate: Date): string {
  return `${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}`;
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause;
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return `${error.message} (${String(cause.code)})`;
  }

  return error.message;
}

async function syncJiraBestEffort(fromDate: Date, toDate: Date, force = false): Promise<boolean> {
  try {
    await syncIncrementally('jira', { fromDate, toDate }, syncJira, force);
    return true;
  } catch (error) {
    console.warn(
      `[Jira] Sync failed; continuing with stored data. The range was not marked as synchronized: ${errorDetails(error)}`,
    );
    return false;
  }
}

async function syncGitLabBestEffort(fromDate: Date, toDate: Date, force = false): Promise<boolean> {
  try {
    await syncIncrementally('gitlab', { fromDate, toDate }, syncGitLab, force);
    return true;
  } catch (error) {
    console.warn(
      `[GitLab] Sync failed; continuing with stored data. The range was not marked as synchronized: ${errorDetails(error)}`,
    );
    return false;
  }
}

async function syncSourcesBestEffort(fromDate: Date, toDate: Date, force = false) {
  const gitLabSynced = await syncGitLabBestEffort(fromDate, toDate, force);
  const jiraSynced = await syncJiraBestEffort(fromDate, toDate, force);
  return { gitLabSynced, jiraSynced };
}

function todayInConfiguredTimezone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
  .option('--force', 'Ignore synchronization coverage and fetch the range again')
  .action(async (options: RangeOptions) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);
      console.log(`Starting GitLab sync from ${formatRange(fromDate, toDate)}`);
      await syncIncrementally('gitlab', { fromDate, toDate }, syncGitLab, options.force);
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
  .option('--force', 'Ignore synchronization coverage and fetch the range again')
  .action(async (options: RangeOptions) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);
      console.log(`Starting Jira sync from ${formatRange(fromDate, toDate)}`);
      await syncIncrementally('jira', { fromDate, toDate }, syncJira, options.force);
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
  .option('--force', 'Ignore synchronization coverage and fetch the range again')
  .action(async (options: RangeOptions) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);
      console.log(`Starting GitLab and Jira sync from ${formatRange(fromDate, toDate)}`);
      const { gitLabSynced, jiraSynced } = await syncSourcesBestEffort(
        fromDate,
        toDate,
        options.force,
      );
      console.log(gitLabSynced && jiraSynced ? 'Done!' : 'Done with source warnings.');
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
  .option('--output <path>', 'Write export to a file instead of stdout')
  .option('--sync', 'Sync GitLab and Jira before exporting')
  .option('--force', 'Ignore synchronization coverage and fetch the range again')
  .action(async (options: RangeOptions & { format: string; output?: string; sync?: boolean }) => {
    try {
      const { fromDate, toDate } = resolveDateRange(options);

      if (options.sync) {
        console.error(`Syncing GitLab and Jira from ${formatRange(fromDate, toDate)}`);
        await syncSourcesBestEffort(fromDate, toDate, options.force);
      }

      const data = await generateExportData(fromDate, toDate);
      let output: string;

      if (options.format === 'csv') {
        output = generateCsvExport(data);
      } else if (options.format === 'json') {
        output = `${JSON.stringify(data, null, 2)}\n`;
      } else {
        throw new Error(`Unsupported export format: ${options.format}`);
      }

      if (options.output) {
        await writeFile(options.output, output, 'utf8');
        console.error(`Export written to ${options.output}`);
      } else {
        process.stdout.write(output);
      }

      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command('finish')
  .description('Sync today and prepare upload files and/or a stand-up')
  .option('-d, --date <date>', 'Work date in YYYY-MM-DD format (default: today)')
  .option('--only <target>', 'all, report, or standup', 'all')
  .option('--force', 'Ignore synchronization coverage and fetch the date again')
  .action(async (options: { date?: string; only: string; force?: boolean }) => {
    try {
      if (!['all', 'report', 'standup'].includes(options.only)) {
        throw new Error('--only must be all, report, or standup.');
      }

      const targetDate = options.date ?? todayInConfiguredTimezone();
      const { fromDate, toDate } = resolveDateRange({ from: targetDate, to: targetDate });
      console.log(`Finishing workday ${targetDate}: syncing GitLab and Jira...`);
      await syncSourcesBestEffort(fromDate, toDate, options.force);

      if (options.only === 'all' || options.only === 'report') {
        const data = await generateExportData(fromDate, toDate);
        await Promise.all([
          writeFile('worklogs.csv', generateCsvExport(data), 'utf8'),
          writeFile('worklogs.json', `${JSON.stringify(data, null, 2)}\n`, 'utf8'),
        ]);
        console.log('Worklogs written to worklogs.csv and worklogs.json');
      }

      if (options.only === 'all' || options.only === 'standup') {
        const report = await generateStandupReport(targetDate);
        await writeFile('standup.md', `${report.trimEnd()}\n`, 'utf8');
        console.log(`\n${report}`);
        console.log('Stand-up written to standup.md');
      }

      process.exit(0);
    } catch (error) {
      console.error('Finish workflow failed:', errorDetails(error));
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
