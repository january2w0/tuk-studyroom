import { attendanceMime, writeAttendanceWorkbook } from "@/lib/school/attendance";
import { validatePeriod } from "@/lib/school/meeting-api";
import { InputError } from "@/lib/validation";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let workbook;
  if (params.has("date")) {
    try {
      const { date, start, end } = validatePeriod(Object.fromEntries(params));
      const room = params.get("room") ?? "";
      const count = Number(params.get("count") ?? "3");
      if (room.length > 80 || !/\d{3}-\d+$/.test(room) ||
          !Number.isInteger(count) || count < 1 || count > 99) throw new InputError();
      const entries = Array.from({ length: count }, () => ({ department: "", studentId: "", name: "" }));
      workbook = await writeAttendanceWorkbook(entries, date, start, end, room);
    } catch (error) {
      if (error instanceof InputError)
        return Response.json({ error: "신청 일정과 인원을 확인해주세요." }, { status: 400 });
      throw error;
    }
  } else {
    workbook = await writeAttendanceWorkbook([], "", "", "", "");
  }
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": attendanceMime,
      "Content-Disposition": `attachment; filename="attendance.xlsx"; filename*=UTF-8''${encodeURIComponent("참석자 명단.xlsx")}`,
    },
  });
}
