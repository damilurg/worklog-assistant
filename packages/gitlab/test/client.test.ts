import { describe, expect, it, vi } from 'vitest';
import { GitLabClient } from '../src';

function response(status: number, body: unknown = []): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GitLabClient retries', () => {
  it('exits immediately for non-retryable authentication errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    const sleep = vi.fn();
    const client = new GitLabClient('https://gitlab.example.com', 'token', {
      fetch: fetchMock,
      sleep,
    });

    await expect(client.getCommits('1')).rejects.toThrow('GitLab API error: 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a temporary failure and stops after success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new GitLabClient('https://gitlab.example.com', 'token', {
      fetch: fetchMock,
      sleep,
      random: () => 0,
    });

    await expect(client.getCommits('1')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });
});
