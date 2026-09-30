import { describe, expect, it } from 'vitest';
import { resolveDateRange } from '../src/dateRange';

const now = new Date('2026-09-30T12:00:00.000Z');

describe('resolveDateRange', () => {
  it('uses yesterday by default', () => {
    const range = resolveDateRange({}, now);

    expect(range.fromDate.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(range.toDate.toISOString()).toBe('2026-09-29T23:59:59.999Z');
  });

  it('supports a half-year period ending yesterday', () => {
    const range = resolveDateRange({ period: 'half-year' }, now);

    expect(range.fromDate.toISOString()).toBe('2026-03-30T00:00:00.000Z');
    expect(range.toDate.toISOString()).toBe('2026-09-29T23:59:59.999Z');
  });

  it('keeps calendar periods valid at month boundaries', () => {
    const range = resolveDateRange({ period: 'month' }, new Date('2026-04-01T12:00:00.000Z'));

    expect(range.fromDate.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(range.toDate.toISOString()).toBe('2026-03-31T23:59:59.999Z');
  });

  it('uses inclusive boundaries for explicit dates', () => {
    const range = resolveDateRange({ from: '2026-09-01', to: '2026-09-30' }, now);

    expect(range.fromDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(range.toDate.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('rejects reversed ranges', () => {
    expect(() => resolveDateRange({ from: '2026-09-30', to: '2026-09-01' }, now)).toThrow(
      '--from must not be later than --to.',
    );
  });
});
