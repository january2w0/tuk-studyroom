import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import mysql from "mysql2/promise";
import { databaseOptions } from "./db-config";

const globalDb = globalThis as unknown as { meetingPool?: mysql.Pool };
const onVercel = process.env.VERCEL === "1";
const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT ?? (onVercel ? 1 : 5));
if (!Number.isInteger(connectionLimit) || connectionLimit < 1) {
  throw new Error("DB_CONNECTION_LIMIT must be a positive integer.");
}
function createPool() {
  const pool = mysql.createPool({
    ...databaseOptions,
    connectionLimit,
    ...(onVercel && { maxIdle: 0 }),
    dateStrings: true,
    timezone: "+09:00",
  });
  if (onVercel) {
    // mysql2 sweeps excess idle connections every second. Keep the instance
    // awake for that sweep even when its last HTTP response has already ended.
    attachDatabasePool({ on: pool.on.bind(pool), config: { idleTimeout: 1500 } });
  }
  return pool;
}

export const db = globalDb.meetingPool ??= createPool();
