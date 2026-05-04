import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Pick the env file based on NODE_ENV so Prisma CLI invocations from E2E
// contexts (`NODE_ENV=test`, usually wrapped with `dotenvx run --env-file
// .env.test`) don't get their DATABASE_URL clobbered by `.env.local`.
// Fallback: `.env.local` for normal dev.
const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env.local";
config({ path: envFile, override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
