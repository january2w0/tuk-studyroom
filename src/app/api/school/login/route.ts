import { createSession } from "@/lib/auth";
import { assertSameOrigin, InputError, readJsonObject } from "@/lib/validation";
import { loginSchoolAccount } from "@/lib/school/connection";
import { schoolIdentity } from "@/lib/school/crypto";
import { SchoolError } from "@/lib/school/xml";

// shortcut: one Next.js process; move counters to a shared store before horizontal scaling.
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJsonObject(request);
    if (
      typeof input.username !== "string" ||
      !/^[A-Za-z0-9_-]{4,40}$/.test(input.username.trim()) ||
      typeof input.password !== "string" ||
      !input.password ||
      input.password.length > 256 ||
      typeof input.autoLogin !== "boolean"
    )
      throw new InputError("학교 아이디와 비밀번호를 확인해주세요.");
    const username = input.username.trim();
    const now = Date.now(),
      identity = schoolIdentity(username);
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key);
    const attempt = attempts.get(identity);
    if ((attempt?.count ?? 0) >= 5 || attempts.size >= 5000)
      return Response.json(
        { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    attempts.set(identity, {
      count: (attempt?.count ?? 0) + 1,
      until: attempt?.until ?? now + 900000,
    });
    const userId = await loginSchoolAccount(
      username,
      input.password,
      input.autoLogin,
    );
    await createSession(userId, input.remember === true);
    attempts.delete(identity);
    return Response.json({ ok: true });
  } catch (error) {
    const known = error instanceof InputError || error instanceof SchoolError;
    return Response.json(
      {
        error: known
          ? error.message
          : "학교 연결을 준비하지 못했습니다. 서버 설정과 DB 연결을 확인해주세요.",
        code: error instanceof SchoolError ? error.code : undefined,
      },
      {
        status:
          error instanceof InputError
            ? 400
            : error instanceof SchoolError && error.code === "AUTH_REQUIRED"
              ? 401
              : error instanceof SchoolError && error.code === "SSO_REQUIRED"
                ? 409
            : error instanceof SchoolError
              ? 502
              : 503,
      },
    );
  }
}
