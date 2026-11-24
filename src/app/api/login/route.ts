import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { assertSameOrigin, InputError, readJsonObject } from "@/lib/validation";

// shortcut: single-process login throttling; use a shared store before multi-instance deployment.
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    if (
      typeof body.username !== "string" ||
      typeof body.password !== "string" ||
      !body.username.trim() ||
      !body.password ||
      body.username.length > 80 ||
      body.password.length > 256
    )
      throw new InputError("아이디와 비밀번호를 확인해주세요.");
    const key = body.username.trim().toLowerCase();
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    const attempt = attempts.get(key);
    if ((attempt?.count ?? 0) >= 10 || attempts.size > 5000)
      return Response.json(
        { error: "잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    attempts.set(key, {
      count: (attempt?.count ?? 0) + 1,
      until: attempt?.until ?? now + 600000,
    });
    const [users] = await db.execute<RowDataPacket[]>(
      "SELECT id,password_hash FROM users WHERE username=?",
      [key],
    );
    if (
      !users[0] ||
      !(await verifyPassword(body.password, users[0].password_hash))
    )
      return Response.json(
        { error: "아이디 또는 비밀번호가 일치하지 않습니다." },
        { status: 401 },
      );
    await createSession(users[0].id, body.remember === true);
    attempts.delete(key);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof InputError
            ? error.message
            : "로그인할 수 없습니다. DB 연결 상태를 확인해주세요.",
      },
      { status: error instanceof InputError ? 400 : 503 },
    );
  }
}
