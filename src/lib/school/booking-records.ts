import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { db } from "../db";
import { InputError } from "../validation";
import { decryptSchoolState, encryptSchoolState } from "./crypto";
import { validatePeriod, type BookingInput } from "./meeting-api";
import { roomAreas, schoolRoom, type RoomArea } from "./rooms";
import type { SchoolRow } from "./xml";
import type { AttendanceEntry } from "./attendance";

export type BookingForm = Omit<BookingInput, "consent"> & {
  area: RoomArea;
  roomName: string;
  attendanceEntries?: AttendanceEntry[];
};
export type BookingDetails = Omit<BookingForm, "date" | "start" | "end" | "attendees" | "roomCode">;
export type BookingRecord = BookingForm & { id: number; status: string; externalId: string | null };

type BookingRow = RowDataPacket & {
  id: number;
  room_code: string;
  use_date: string;
  start_time: string;
  end_time: string;
  attendee_count: number;
  encrypted_form: string;
  status: string;
  external_id: string | null;
};

export function schoolBookingForm(row: SchoolRow): BookingForm | null {
  const room = schoolRoom(row);
  const time = (value: string) => value.replace(/^(\d{2})(\d{2})$/, "$1:$2");
  const start = time(row.frHmint || "");
  const end = time(row.toHmint || "");
  const slot = /^(?:[01]\d|2[0-3]):(?:00|30)$/;
  if (!room || !/^\d{1,20}$/.test(row.reserInstBasiCd) || !slot.test(start) || !slot.test(end) || end <= start) return null;
  return {
    area: room.area, roomCode: row.reserInstBasiCd, roomName: `${row.strctrNm} ${room.number}`.trim(),
    date: row.frDt, start, end, eventName: row.eventNm || "", purpose: row.eventCtnt || "",
    attendees: Number(row.rcntTtCnt) || 0, equipment: row.etcAprtNm || "", phone: row.aplytHandpNo || "",
    eventCode: row.eventGbn || "", userCode: row.instUserGbn || "",
  };
}

export function parseBookingForm(body: Record<string, unknown>): BookingForm {
  const period = validatePeriod(body);
  const { area, roomCode } = body;
  if (typeof area !== "string" || !Object.hasOwn(roomAreas, area) ||
      typeof roomCode !== "string" || !/^\d{1,20}$/.test(roomCode)) {
    throw new InputError("예약 공간을 다시 선택해주세요.");
  }
  function field(key: string, max = 200) {
    const value = body[key] ?? "";
    if (typeof value !== "string" || value.length > max) throw new InputError("예약 내용을 확인해주세요.");
    return value.trim();
  }
  const attendees = body.attendees;
  if (typeof attendees !== "number" || !Number.isInteger(attendees) || attendees < 0 || attendees > 99) {
    throw new InputError("참여 인원을 확인해주세요.");
  }
  return {
    ...period, area: area as RoomArea, roomCode, roomName: field("roomName"), attendees,
    eventName: field("eventName", 100), purpose: field("purpose"), equipment: field("equipment"),
    phone: field("phone", 14), eventCode: field("eventCode"), userCode: field("userCode"),
  };
}

export async function saveBookingForm(userId: number, form: BookingForm, requestId: number | null = null, connection: PoolConnection | typeof db = db) {
  const { date, start, end, attendees, roomCode, ...details } = form;
  const encryptedForm = encryptSchoolState(details, userId);
  if (encryptedForm.length > 65_535) throw new InputError("저장할 내용이 너무 깁니다. 참석자 정보를 확인해주세요.");
  await connection.execute(
    `INSERT INTO school_booking_records
     (user_id, room_code, request_id, use_date, start_time, end_time, attendee_count, encrypted_form)
     VALUES (?,?,?,?,?,?,?,?)`,
    [userId, roomCode, requestId, date, start, end, attendees, encryptedForm],
  );
}

export async function bookingRecords(userId: number, filter: { id?: number; roomCode?: string } = {}): Promise<BookingRecord[]> {
  const { id, roomCode } = filter;
  const condition = id !== undefined ? "AND f.id=?" : roomCode !== undefined ? "AND f.room_code=?" : "";
  const [rows] = await db.execute<BookingRow[]>(
    `SELECT f.id, f.room_code, f.use_date, f.start_time, f.end_time, f.attendee_count, f.encrypted_form, r.external_id,
       CASE WHEN f.request_id IS NULL THEN 'draft'
            WHEN EXISTS (SELECT 1 FROM school_requests c
              WHERE c.user_id=f.user_id AND c.external_id=r.external_id
                AND c.operation='cancel' AND c.status='cancelled' AND c.id>r.id) THEN 'cancelled'
            ELSE r.status END AS status
     FROM school_booking_records f LEFT JOIN school_requests r ON r.id=f.request_id AND r.user_id=f.user_id
     WHERE f.user_id=? ${condition}
     ORDER BY f.id DESC LIMIT ${condition ? 1 : 100}`,
    id !== undefined ? [userId, id] : roomCode !== undefined ? [userId, roomCode] : [userId],
  );
  return rows.map((row) => ({
    ...decryptSchoolState<BookingDetails>(row.encrypted_form, userId),
    roomCode: row.room_code,
    date: row.use_date, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5),
    attendees: row.attendee_count,
    id: row.id, status: row.status, externalId: row.external_id,
  }));
}
