import { describe, it, expect } from 'vitest';
import { extractJiraKeys, determineJiraStatus } from '../src/utils/jiraParser';

describe('jiraParser', () => {
  it('extracts single issue correctly', () => {
    const keys = extractJiraKeys('feature/CORE-123-test');
    expect(keys).toEqual(['CORE-123']);
    expect(determineJiraStatus(keys)).toBe('matched');
  });

  it('extracts issue at start of string', () => {
    const keys = extractJiraKeys('CORE-123: fix');
    expect(keys).toEqual(['CORE-123']);
    expect(determineJiraStatus(keys)).toBe('matched');
  });

  it('returns empty for no match', () => {
    const keys = extractJiraKeys('hello');
    expect(keys).toEqual([]);
    expect(determineJiraStatus(keys)).toBe('unmatched');
  });

  it('handles multiple ambiguous issues', () => {
    const keys = extractJiraKeys('CORE-1 ADMIN-2');
    expect(keys).toEqual(['CORE-1', 'ADMIN-2']);
    expect(determineJiraStatus(keys)).toBe('ambiguous');
  });

  it('deduplicates identical keys', () => {
    const keys = extractJiraKeys('CORE-123 and CORE-123');
    expect(keys).toEqual(['CORE-123']);
    expect(determineJiraStatus(keys)).toBe('matched');
  });
});
