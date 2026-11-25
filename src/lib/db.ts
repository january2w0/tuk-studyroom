import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { attachDatabasePool } from "@vercel/functions";
import mysql, { type ExecuteValues, type PoolConnection, type QueryResult, type QueryValues } from "mysql2/promise";
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

const pool = globalDb.meetingPool ??= createPool();

async function getConnection() {
  const deadline = Date.now() + 10_000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await pool.getConnection();
    } catch (error) {
      const atUserLimit = error instanceof Error && "code" in error && (
        error.code === "ER_TOO_MANY_USER_CONNECTIONS" ||
        (error.code === "ER_USER_LIMIT_REACHED" && error.message.includes("max_user_connections"))
      );
      if (!atUserLimit || Date.now() >= deadline) throw error;
      await delay(Math.min(1000, 250 * (attempt + 1)) + Math.random() * 200);
    }
  }
}

async function withConnection<T>(run: (connection: PoolConnection) => Promise<T>) {
  const connection = await getConnection();
  try {
    return await run(connection);
  } finally {
    connection.release();
  }
}

export const db = {
  getConnection,
  execute<T extends QueryResult>(sql: string, values?: ExecuteValues) {
    return withConnection((connection) => connection.execute<T>(sql, values));
  },
  query<T extends QueryResult>(sql: string, values?: QueryValues) {
    return withConnection((connection) => connection.query<T>(sql, values));
  },
};
