import { describe, expect, it } from 'vitest';
import { buildStandupHeadings } from '../src/report';

describe('buildStandupHeadings', () => {
  it('labels a current-day report with today and tomorrow dates', () => {
    expect(buildStandupHeadings('2026-10-01', '2026-10-01')).toEqual({
      completed: 'Сегодня (01.10.2026)',
      planned: 'Завтра (02.10.2026)',
    });
  });

  it('labels a previous-day report with yesterday and today dates', () => {
    expect(buildStandupHeadings('2026-09-30', '2026-10-01')).toEqual({
      completed: 'Вчера (30.09.2026)',
      planned: 'Сегодня (01.10.2026)',
    });
  });

  it('uses explicit dates for a historical report', () => {
    expect(buildStandupHeadings('2026-03-15', '2026-10-01')).toEqual({
      completed: 'За 15.03.2026',
      planned: 'Следующий день (16.03.2026)',
    });
  });
});
