import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Try to load from root of monorepo if running from somewhere else
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config(); // fallback to cwd

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/worklogs'),

  GITLAB_INSTANCES: z
    .string()
    .transform((str) => {
      try {
        return JSON.parse(str);
      } catch {
        return [];
      }
    })
    .pipe(
      z.array(
        z.object({
          url: z.string().url(),
          token: z.string(),
          projectIds: z.array(z.number()),
        }),
      ),
    )
    .optional()
    .default([]),

  GITLAB_AUTHOR_EMAILS: z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
    )
    .optional()
    .default([]),
  GITLAB_AUTHOR_NAMES: z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
    )
    .optional()
    .default([]),

  JIRA_URL: z.string().url().optional(),
  JIRA_EMAIL: z.string().email().optional(),
  JIRA_TOKEN: z.string().optional(),
  JIRA_AUTH_MODE: z.enum(['cloud', 'data-center']).default('cloud'),

  WORKDAY_HOURS: z.coerce.number().default(8),
  TIMEZONE: z.string().default('Asia/Bishkek'),
});

export const config = envSchema.parse(process.env);
