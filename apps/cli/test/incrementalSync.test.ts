import { describe, expect, it } from 'vitest';
import { buildMissingRanges } from '../src/incrementalSync';

describe('buildMissingRanges', () => {
  it('returns only contiguous missing intervals', () => {
    const ranges = buildMissingRanges(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-07T23:59:59.999Z'),
      new Set(['2026-09-02', '2026-09-05']),
    );

    expect(
      ranges.map((range) => [
        range.fromDate.toISOString().slice(0, 10),
        range.toDate.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['2026-09-01', '2026-09-01'],
      ['2026-09-03', '2026-09-04'],
      ['2026-09-06', '2026-09-07'],
    ]);
  });

  it('returns no ranges when every date is covered', () => {
    const ranges = buildMissingRanges(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-02T23:59:59.999Z'),
      new Set(['2026-09-01', '2026-09-02']),
    );

    expect(ranges).toEqual([]);
  });
});
