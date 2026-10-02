import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  out: './drizzle',
  schema: [
    './src/auth/infrastructure/persistence/drizzle/generated/auth.schema.ts',
    './src/**/infrastructure/persistence/drizzle/schema/*.schema.ts',
  ],
  ...(databaseUrl
    ? {
        dbCredentials: {
          url: databaseUrl,
        },
      }
    : {}),
});
