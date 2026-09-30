import { describe, it, expect, vi } from 'vitest';
import { generateCsvExport, generateExportData } from '../src/export';
import * as plannerIndex from '../src/index';

vi.mock('@worklog-assistant/db', () => {
  return {
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ key: 'CORE-123', remainingEstimateSeconds: 3600 }]),
    },
    jiraIssues: { key: 'key' },
  };
});

vi.mock('../src/index', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/index')>();
  return {
    ...mod,
    getDaySummary: vi.fn(),
  };
});

describe('Planner Export', () => {
  it('splits time with estimations', async () => {
    const mockMap = new Map();
    const occurredAt = new Date('2026-09-30T14:00:51Z');
    mockMap.set('CORE-123', [{ type: 'commit', title: 'A', occurredAt }]);
    mockMap.set('ADMIN-82', [{ type: 'commit', title: 'B', occurredAt }]);
    mockMap.set('AMBIGUOUS', [{ type: 'commit', title: 'C', occurredAt }]);

    vi.mocked(plannerIndex.getDaySummary).mockResolvedValue({
      issues: mockMap,
      unmatched: [],
    } as any);

    const from = new Date('2026-09-30T00:00:00Z');
    const to = new Date('2026-09-30T00:00:00Z');

    const result = await generateExportData(from, to);

    expect(result).toHaveLength(1);
    expect(result[0].issues).toHaveLength(2);
    // CORE-123 was capped at its estimate (3600), the rest goes to ADMIN-82
    const core123 = result[0].issues.find((i: any) => i.key === 'CORE-123');
    const admin82 = result[0].issues.find((i: any) => i.key === 'ADMIN-82');

    expect(core123.suggestedSeconds).toBe(3600);
    expect(admin82.suggestedSeconds).toBe(25200); // 28800 - 3600
  });

  it('generates Jira-compatible CSV rows', () => {
    const csv = generateCsvExport([
      {
        date: '2026-09-30',
        targetSeconds: 28800,
        issues: [
          {
            key: 'CORE-123',
            summary: 'Parser improvements',
            suggestedSeconds: 5400,
            remainingEstimateSeconds: null,
            activities: [
              {
                type: 'commit',
                title: 'Fix parser, add tests',
                occurredAt: '2026-09-30T14:00:51.000Z',
              },
            ],
          },
        ],
      },
    ]);

    expect(csv).toContain('Ticket No,Start Date,Timespent,Comment');
    expect(csv).toContain(
      'CORE-123,30-Sep-2026 20:00:51,1h 30m,"Parser improvements; Fix parser, add tests"',
    );
  });
});
