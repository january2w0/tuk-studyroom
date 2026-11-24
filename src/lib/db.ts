import "server-only";
import mysql from "mysql2/promise";
import { databaseOptions } from "./db-config";

const globalDb = globalThis as unknown as { meetingPool?: mysql.Pool };
const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT ?? 5);
if (!Number.isInteger(connectionLimit) || connectionLimit < 1) {
  throw new Error("DB_CONNECTION_LIMIT must be a positive integer.");
}
export const db =
  globalDb.meetingPool ??
  mysql.createPool({
    ...databaseOptions,
    connectionLimit,
    dateStrings: true,
    timezone: "+09:00",
  });
globalDb.meetingPool = db;
