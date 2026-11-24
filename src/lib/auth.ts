import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { db } from "./db";
import { tokenHash } from "./password";

export type User = {
  id: number;
  username: string;
  display_name: string;
  role: "student" | "admin";
};
const COOKIE = "meeting_session";

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT u.id,u.username,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()",
    [tokenHash(token)],
  );
  return (rows[0] as User) ?? null;
}

export async function createSession(userId: number, remember: boolean) {
  const token = randomBytes(32).toString("hex");
  const maxAge = remember ? 30 * 86400 : 8 * 3600;
  await db.execute("DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP()");
  await db.execute(
    "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND))",
    [tokenHash(token), userId, maxAge],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token)
    await db.execute("DELETE FROM sessions WHERE token_hash=?", [
      tokenHash(token),
    ]);
  store.delete(COOKIE);
}
