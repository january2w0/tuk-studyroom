import "server-only";
import { randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import type { SerializedCookieJar } from "tough-cookie";
import { db } from "../db";
import { hashPassword } from "../password";
import { SchoolClient } from "./client";
import {
  decryptSchoolState,
  encryptSchoolState,
  schoolIdentity,
} from "./crypto";
import { SchoolError } from "./xml";

type SavedSchoolState = {
  username: string;
  cookies: SerializedCookieJar;
  password?: string;
};
export async function loginSchoolAccount(
  username: string,
  password: string,
  autoLogin: boolean,
) {
  const client = new SchoolClient();
  const info = await client.login(username, password);
  if (!info.persNo || info.userGbn !== "01")
    throw new SchoolError("학생 학교 계정으로 로그인해주세요.", "AUTH_REQUIRED");
  const identity = schoolIdentity(info.persNo);
  const appUsername = "school_" + identity;
  const displayName = (info.userNm || "학생").slice(0, 80);
  // School passwords are never reused as this application's password hash.
  const randomPassword = await hashPassword(randomBytes(32).toString("hex"));
  await db.execute(
    "INSERT INTO users(username,display_name,password_hash,role) VALUES (?,?,?,'student') ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)",
    [appUsername, displayName, randomPassword],
  );
  const [users] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM users WHERE username=?",
    [appUsername],
  );
  const userId = Number(users[0].id);
  const state: SavedSchoolState = {
    username,
    cookies: client.serialize(),
    ...(autoLogin ? { password } : {}),
  };
  await db.execute(
    "INSERT INTO school_connections(user_id,identity_hash,encrypted_state,valid_until) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY)) ON DUPLICATE KEY UPDATE encrypted_state=VALUES(encrypted_state),valid_until=VALUES(valid_until)",
    [userId, identity, encryptSchoolState(state, userId)],
  );
  return userId;
}

export async function withSchoolAccount<T>(
  userId: number,
  action: (client: SchoolClient, connection: PoolConnection) => Promise<T>,
  lockWaitSeconds = 0,
): Promise<T> {
  const connection = await db.getConnection();
  const lock = "tuk-meeting-school-" + userId;
  let locked = false;
  try {
    const [locks] = await connection.execute<RowDataPacket[]>(
      "SELECT GET_LOCK(?,?) AS acquired",
      [lock, lockWaitSeconds],
    );
    locked = locks[0]?.acquired === 1;
    if (!locked)
      throw new SchoolError(
        "다른 학교 요청이 아직 끝나지 않았습니다. 잠시 후 다시 시도해주세요.",
        "BUSY",
      );
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT encrypted_state FROM school_connections WHERE user_id=? AND valid_until>UTC_TIMESTAMP()",
      [userId],
    );
    if (!rows.length)
      throw new SchoolError(
        "학교 계정으로 다시 로그인해주세요.",
        "AUTH_REQUIRED",
      );
    const state = decryptSchoolState<SavedSchoolState>(
      rows[0].encrypted_state,
      userId,
    );
    const client = new SchoolClient(state.cookies);
    try {
      if (!(await client.check())) {
        if (!state.password)
          throw new SchoolError(
            "학교 세션이 만료되었습니다. 학교 계정으로 다시 로그인해주세요.",
            "AUTH_REQUIRED",
          );
        try {
          await client.login(state.username, state.password);
        } catch (error) {
          delete state.password;
          throw error;
        }
      }
      return await action(client, connection);
    } finally {
      state.cookies = client.serialize();
      await connection.execute(
        "UPDATE school_connections SET encrypted_state=? WHERE user_id=?",
        [encryptSchoolState(state, userId), userId],
      );
    }
  } finally {
    try {
      if (locked) await connection.execute("SELECT RELEASE_LOCK(?)", [lock]);
    } finally {
      connection.release();
    }
  }
}

export async function schoolConnectionStatus(userId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT encrypted_state,valid_until>UTC_TIMESTAMP() AS valid FROM school_connections WHERE user_id=?",
    [userId],
  );
  if (!rows.length || !rows[0].valid)
    return { connected: false, autoLogin: false };
  const state = decryptSchoolState<SavedSchoolState>(
    rows[0].encrypted_state,
    userId,
  );
  return { connected: true, autoLogin: !!state.password };
}
