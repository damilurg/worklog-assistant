import { describe, it, expect } from 'vitest';
import { parseDurationToSeconds, formatSecondsToDuration } from '../src/utils/durationParser';

describe('durationParser', () => {
  describe('parseDurationToSeconds', () => {
    it('parses minutes correctly', () => {
      expect(parseDurationToSeconds('30m')).toBe(1800);
    });

    it('parses hours correctly', () => {
      expect(parseDurationToSeconds('1h')).toBe(3600);
    });

    it('parses hours and minutes correctly', () => {
      expect(parseDurationToSeconds('1h30m')).toBe(5400);
      expect(parseDurationToSeconds('4h15m')).toBe(15300);
    });

    it('throws on invalid format', () => {
      expect(() => parseDurationToSeconds('1d')).toThrow();
      expect(() => parseDurationToSeconds('hello')).toThrow();
    });
  });

  describe('formatSecondsToDuration', () => {
    it('formats minutes', () => {
      expect(formatSecondsToDuration(1800)).toBe('30m');
    });

    it('formats hours', () => {
      expect(formatSecondsToDuration(3600)).toBe('1h');
    });

    it('formats hours and minutes', () => {
      expect(formatSecondsToDuration(5400)).toBe('1h30m');
      expect(formatSecondsToDuration(15300)).toBe('4h15m');
    });

    it('formats 0 seconds', () => {
      expect(formatSecondsToDuration(0)).toBe('0m');
    });
  });
});
