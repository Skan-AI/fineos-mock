import process from "node:process";
import {
  DEFAULT_DB_PATH,
  resetDatabase,
  resetSeededDatabase,
} from "./infrastructure/database";
import { seedDatabase } from "./infrastructure/seed";
import { buildApp } from "./app";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.FINEOS_DB_PATH ?? DEFAULT_DB_PATH;
const WEB_ROOT = process.env.FINEOS_WEB_DIST;
const TEST_MODE = process.env.FINEOS_TEST_MODE === "1";

const assertProductionPassword = (): void => {
  if (process.env.NODE_ENV !== "production" || process.env.FINEOS_PASSWORD) return;
  throw new Error("FINEOS_PASSWORD must be set in production.");
};

const start = async (): Promise<void> => {
  assertProductionPassword();
  const db = resetDatabase(DB_PATH);
  seedDatabase(db);
  const resetTestData = TEST_MODE ? () => resetSeededDatabase(db) : undefined;
  const app = buildApp(db, { resetTestData, webRoot: WEB_ROOT, requireAuth: !TEST_MODE });
  await app.listen({ port: PORT, host: "0.0.0.0" });
};

void start();
