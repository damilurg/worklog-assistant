export type SyncPeriod = 'yesterday' | 'week' | 'month' | 'half-year' | 'year';

export interface DateRangeOptions {
  from?: string;
  to?: string;
  period?: SyncPeriod;
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Expected YYYY-MM-DD.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date "${value}".`);
  }

  return date;
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
}

function subtractMonths(date: Date, months: number): void {
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
}

export function resolveDateRange(
  options: DateRangeOptions,
  now = new Date(),
): {
  fromDate: Date;
  toDate: Date;
} {
  const yesterday = startOfDay(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  if (options.from || options.to) {
    const fromDate = options.from
      ? startOfDay(parseDate(options.from))
      : startOfDay(parseDate(options.to!));
    const toDate = options.to ? endOfDay(parseDate(options.to)) : endOfDay(yesterday);

    if (fromDate > toDate) throw new Error('--from must not be later than --to.');
    return { fromDate, toDate };
  }

  const period = options.period ?? 'yesterday';
  const fromDate = startOfDay(yesterday);
  const toDate = endOfDay(yesterday);

  switch (period) {
    case 'yesterday':
      break;
    case 'week':
      fromDate.setUTCDate(fromDate.getUTCDate() - 6);
      break;
    case 'month':
      subtractMonths(fromDate, 1);
      fromDate.setUTCDate(fromDate.getUTCDate() + 1);
      break;
    case 'half-year':
      subtractMonths(fromDate, 6);
      fromDate.setUTCDate(fromDate.getUTCDate() + 1);
      break;
    case 'year':
      subtractMonths(fromDate, 12);
      fromDate.setUTCDate(fromDate.getUTCDate() + 1);
      break;
    default:
      throw new Error(`Unsupported period: ${period satisfies never}`);
  }

  return { fromDate, toDate };
}
