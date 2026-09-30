import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '@worklog-assistant/config';

// For query purposes
const queryClient = postgres(config.DATABASE_URL);
export const db = drizzle(queryClient, { schema });

export * from './schema';
