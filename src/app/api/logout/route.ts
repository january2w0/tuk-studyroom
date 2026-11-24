import { endSession } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  }
  await endSession();
  return Response.json({ ok: true });
}
