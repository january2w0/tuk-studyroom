import "server-only";
import mysql from "mysql2/promise";

const globalDb = globalThis as unknown as { meetingPool?: mysql.Pool };
export const db =
  globalDb.meetingPool ??
  mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3308),
    user: process.env.DB_USER ?? "meeting_app",
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME ?? "tuk_meeting_room",
    connectionLimit: 5,
    dateStrings: true,
    timezone: "+09:00",
  });
globalDb.meetingPool = db;
