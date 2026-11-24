import { createHash } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assertSameOrigin,
  readJsonObject,
  InputError,
  seoulToday,
} from "@/lib/validation";
import { withSchoolAccount } from "@/lib/school/connection";
import {
  MeetingRoomApi,
  validateBooking,
  bookingStatus,
} from "@/lib/school/meeting-api";
import { SchoolError } from "@/lib/school/xml";
import { schoolRoom } from "@/lib/school/rooms";
import { parseBookingForm, saveBookingForm } from "@/lib/school/booking-records";
import { attendanceFileLimit, parseAttendanceEntries } from "@/lib/school/attendance";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const today = seoulToday();
    const recent = params.get("recent") === "1" && !params.has("date");
    const nearToday = (days: number) => new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
    const date = recent ? nearToday(-30) : params.get("date") || today;
    const toDate = recent ? nearToday(30) : date;
    const parsed = new Date(date + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new InputError("조회 날짜를 확인해주세요.");
    const result = await withSchoolAccount(user.id, async (client, connection) => {
      const api = new MeetingRoomApi(client),
        rows = await api.list(date, toDate);
      const [requests] = await connection.execute<RowDataPacket[]>(
        "SELECT id,external_id,operation,status FROM school_requests WHERE user_id=? ORDER BY id DESC LIMIT 100",
        [user.id],
      );
      for (const record of requests) {
        const row = rows.find((r) => r.instUseAplyNo === record.external_id);
        if (row) {
          record.status = bookingStatus(row, record.operation);
          await connection.execute(
            "UPDATE school_requests SET status=? WHERE id=? AND user_id=?",
            [record.status, record.id, user.id],
          );
        }
      }
      return {
        bookings: rows.map((row) => ({
          id: row.instUseAplyNo,
          name: row.reserInstNmV || row.reserInstNm,
          location: [row.strctrNm, schoolRoom(row)?.number].filter(Boolean).join(" "),
          date: row.frDt,
          start: row.frHmint,
          end: row.toHmint,
          title: row.eventNm,
          state: row.stGbn,
          stateName: row.stGbnNm || "",
          cancellable:
            row.stGbn === "020" ||
            (row.stGbn === "070" && row.reserInstGbnYn === "Y"),
        })),
        requests,
      };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

async function readBookingRequest(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return { body: await readJsonObject(request), attendance: undefined };
  }
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length < 1 || length > attendanceFileLimit + 16 * 1024)
    throw new InputError("참석자 명단은 512KB 이하의 파일을 첨부해주세요.");
  try {
    const form = await request.formData();
    const booking = form.get("booking");
    const attendance = form.get("attendance");
    if (typeof booking !== "string" || !(attendance instanceof File) || attendance.size > attendanceFileLimit)
      throw new Error("Invalid booking form");
    const body: unknown = JSON.parse(booking);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Invalid booking data");
    return { body: body as Record<string, unknown>, attendance };
  } catch {
    throw new InputError("예약 내용과 참석자 명단 파일을 확인해주세요.");
  }
}

export async function POST(request: Request) {
  let logId: number | undefined;
  try {
    assertSameOrigin(request);
    const user = await currentUser();
    if (!user)
      return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const { body, attendance } = await readBookingRequest(request);
    if (
      typeof body.requestKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.requestKey,
      )
    )
      throw new InputError("요청 식별자를 확인해주세요.");
    const requestKey = body.requestKey;
    const cancelling = body.operation === "cancel";
    const enteredAttendance = body.attendanceEntries !== undefined;
    if (cancelling && (attendance || enteredAttendance)) throw new InputError("취소 요청을 확인해주세요.");
    if (attendance && enteredAttendance) throw new InputError("참석자 명단 입력을 확인해주세요.");
    if (
      cancelling &&
      (typeof body.externalId !== "string" ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(body.externalId))
    )
      throw new InputError("학교 신청번호를 확인해주세요.");
    const input = cancelling ? null : validateBooking(body);
    const attendanceEntries = input && enteredAttendance
      ? parseAttendanceEntries(body.attendanceEntries, input.attendees)
      : undefined;
    const form = input && body.area !== undefined ? parseBookingForm(body) : null;
    const externalId = cancelling ? String(body.externalId) : null;
    const attachmentFingerprint = attendance
      ? createHash("sha256").update(Buffer.from(await attendance.arrayBuffer())).digest("hex")
      : undefined;
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify(
          cancelling
            ? { operation: "cancel", id: body.externalId }
            : { ...input, attendance: attachmentFingerprint, attendanceEntries },
        ),
      )
      .digest("hex");
    const result = await withSchoolAccount(user.id, async (client, connection) => {
      const [previous] = await connection.execute<RowDataPacket[]>(
        "SELECT id,fingerprint,external_id,status FROM school_requests WHERE user_id=? AND request_key=?",
        [user.id, requestKey],
      );
      if (previous.length) {
        if (previous[0].fingerprint !== fingerprint)
          throw new InputError(
            "같은 요청 식별자로 다른 신청을 보낼 수 없습니다.",
          );
        return {
          id: previous[0].external_id,
          status: previous[0].status,
          replayed: true,
        };
      }
      const onReady = async () => {
        await connection.beginTransaction();
        try {
          const [created] = await connection.execute<ResultSetHeader>(
            "INSERT INTO school_requests(user_id,request_key,fingerprint,operation,external_id) VALUES (?,?,?,?,?)",
            [user.id, requestKey, fingerprint, cancelling ? "cancel" : "create", externalId],
          );
          if (form) await saveBookingForm(user.id, { ...form, attendanceEntries }, created.insertId, connection);
          await connection.commit();
          logId = created.insertId;
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      };
      const requestLogId = () => {
        if (logId === undefined) throw new Error("School request record was not created");
        return logId;
      };
      const api = new MeetingRoomApi(client);
      if (cancelling) await onReady();
      const receipt = cancelling
        ? await api.cancel(String(body.externalId))
        : await api.submit(input!, async (id) => {
            await connection.execute(
              "UPDATE school_requests SET external_id=?,status='saved' WHERE id=? AND user_id=?",
              [id, requestLogId(), user.id],
            );
          }, { attendance, attendanceEntries, onReady });
      const status = bookingStatus(receipt, cancelling ? "cancel" : "create");
      await connection.execute(
        "UPDATE school_requests SET external_id=?,status=? WHERE id=? AND user_id=?",
        [receipt.instUseAplyNo, status, requestLogId(), user.id],
      );
      return {
        id: receipt.instUseAplyNo,
        status,
        state: receipt.stGbn,
        stateName: receipt.stGbnNm ?? "",
        replayed: false,
      };
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (logId) {
      try {
        await db.execute("UPDATE school_requests SET status=? WHERE id=?", [
        error instanceof InputError || (error instanceof SchoolError && error.code === "ATTENDANCE_UPLOAD")
          ? "failed"
          : error instanceof SchoolError && error.code === "SAVED_ONLY"
            ? "saved"
            : "unknown",
        logId,
      ]);
      } catch {
        // The durable sending record still prevents replay when MySQL is unavailable.
      }
    }
    return errorResponse(error);
  }
}
function errorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof SchoolError || error instanceof InputError
          ? error.message
          : "학교 요청 결과를 확인하지 못했습니다. 내역을 재조회한 뒤 진행해주세요.",
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
