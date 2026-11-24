import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertSameOrigin, InputError, readJsonObject } from "@/lib/validation";
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    if (user?.role !== "admin")
      return Response.json(
        { error: "관리자만 변경할 수 있습니다." },
        { status: 403 },
      );
    const body = await readJsonObject(request);
    if (
      typeof body.id !== "number" ||
      !Number.isInteger(body.id) ||
      body.id < 1 ||
      typeof body.enabled !== "boolean"
    )
      throw new InputError("공간 정보를 확인해주세요.");
    const [result] = await db.execute<import("mysql2").ResultSetHeader>(
      "UPDATE rooms SET enabled=? WHERE id=?",
      [body.enabled, body.id],
    );
    if (!result.affectedRows)
      return Response.json(
        { error: "공간을 찾지 못했습니다." },
        { status: 404 },
      );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof InputError ? error.message : "변경하지 못했습니다.",
      },
      { status: error instanceof InputError ? 400 : 503 },
    );
  }
}
