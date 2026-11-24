const tlsCa = process.env.DB_TLS_CA;

export const databaseOptions = {
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3308),
  user: process.env.DB_USER ?? "meeting_app",
  password: process.env.MYSQL_PASSWORD,
  database: process.env.DB_NAME ?? "tuk_meeting_room",
  ssl: process.env.DB_TLS === "true"
    ? { ca: tlsCa?.replace(/\\n/g, "\n"), rejectUnauthorized: true, verifyIdentity: true }
    : undefined,
};
