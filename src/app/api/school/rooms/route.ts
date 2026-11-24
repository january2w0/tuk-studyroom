import { currentUser } from "@/lib/auth";
import { validatePeriod } from "@/lib/school/meeting-api";
import { lookupSchoolRooms } from "@/lib/school/room-lookup";
import { SchoolError } from "@/lib/school/xml";
import { InputError } from "@/lib/validation";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json(
      { error: "학교 계정으로 로그인해주세요." },
      { status: 401 },
    );
  try {
    const period = validatePeriod(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const result = await lookupSchoolRooms(user.id, period);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof InputError || error instanceof SchoolError
            ? error.message
            : "학교 공간 조회를 완료하지 못했습니다.",
        code: error instanceof SchoolError ? error.code : undefined,
      },
      {
        status:
          error instanceof InputError
            ? 400
            : error instanceof SchoolError && error.code === "AUTH_REQUIRED"
              ? 401
              : error instanceof SchoolError && error.code === "BUSY"
                ? 409
                : 502,
      },
    );
  }
}
