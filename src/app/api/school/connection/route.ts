import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertSameOrigin } from "@/lib/validation";
import { withSchoolAccount } from "@/lib/school/connection";
import { SchoolError } from "@/lib/school/xml";

export async function GET() {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    await withSchoolAccount(user.id, async () => true);
    return Response.json(
      { connected: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        connected: false,
        error:
          error instanceof SchoolError
            ? error.message
            : "학교 연결을 확인하지 못했습니다.",
      },
      {
        status:
          error instanceof SchoolError && error.code === "AUTH_REQUIRED"
            ? 401
            : 502,
      },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  }
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await db.execute("DELETE FROM school_connections WHERE user_id=?", [user.id]);
  return Response.json({ ok: true });
}
