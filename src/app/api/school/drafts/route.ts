import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { bookingRecords, parseBookingForm, saveBookingForm } from "@/lib/school/booking-records";
import { parseAttendanceEntries } from "@/lib/school/attendance";
import { assertSameOrigin, InputError, readJsonObject } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const roomCode = new URL(request.url).searchParams.get("roomCode") ?? "";
  if (!/^\d{1,20}$/.test(roomCode)) return Response.json({ error: "예약 공간을 확인해주세요." }, { status: 400 });
  try {
    const [record] = await bookingRecords(user.id, { roomCode });
    return Response.json({ record: record ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "저장한 예약을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await readJsonObject(request);
    const form = parseBookingForm(body);
    const attendanceEntries = body.attendanceEntries === undefined
      ? undefined : parseAttendanceEntries(body.attendanceEntries, form.attendees, { allowIncomplete: true });
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [areas] = await connection.execute<RowDataPacket[]>(
        "SELECT enabled FROM rooms WHERE school_area=? FOR UPDATE", [form.area],
      );
      if (!areas[0]?.enabled) throw new InputError("이 공간은 현재 임시 저장이 중지되어 있습니다.");
      await saveBookingForm(user.id, { ...form, attendanceEntries }, null, connection);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return Response.json({ saved: true }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof InputError ? error.message : "예약을 임시 저장하지 못했습니다." },
      { status: error instanceof InputError ? 400 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[1-9]\d{0,9}$/.test(id)) throw new InputError("임시 저장 항목을 확인해주세요.");

    const [result] = await db.execute<ResultSetHeader>(
      "DELETE FROM school_booking_records WHERE id=? AND user_id=? AND request_id IS NULL",
      [Number(id), user.id],
    );
    if (!result.affectedRows) return Response.json({ error: "삭제할 임시 저장 항목을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof InputError ? error.message : "임시 저장한 신청서를 삭제하지 못했습니다." },
      { status: error instanceof InputError ? 400 : 500 },
    );
  }
}
