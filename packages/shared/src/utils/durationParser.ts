export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;

  const regex = /^(?:(\d+)h)?(?:(\d+)m)?$/;
  const match = duration.match(regex);

  if (!match || (!match[1] && !match[2])) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);

  return hours * 3600 + minutes * 60;
}

export function formatSecondsToDuration(seconds: number): string {
  if (seconds <= 0) return '0m';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  let result = '';
  if (hours > 0) result += `${hours}h`;
  if (minutes > 0) result += `${minutes}m`;

  return result;
}
