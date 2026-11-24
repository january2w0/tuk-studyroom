import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "./db";
import { parseDraftFilters } from "./draft-search";
import type { Room, SavedDraft } from "./types";
import type { BookingDetails } from "./school/booking-records";
import { decryptSchoolState } from "./school/crypto";

export async function loadAdminWorkspace(params: Record<string, string | string[] | undefined>) {
  const rooms = db.execute<(Room & RowDataPacket)[]>(
    "SELECT id,name,location,enabled FROM rooms WHERE school_area IS NOT NULL ORDER BY id",
  );
  let filters = { q: "", date: "" };
  let searchError = "";
  try {
    const { q, date } = parseDraftFilters({ q: params.q, date: params.date });
    filters = { q, date };
  } catch {
    searchError = "검색 조건이 올바르지 않습니다. 날짜와 검색어를 확인해주세요.";
  }
  return {
    rooms: (await rooms)[0],
    drafts: searchError ? [] : await searchSavedDrafts(filters),
    filters,
    searchError,
  };
}

type SavedRow = RowDataPacket & {
  id: number;
  user_id: number;
  display_name: string;
  use_date: string;
  start_time: string;
  end_time: string;
  attendee_count: number;
  encrypted_form: string;
};

async function searchSavedDrafts({ q, date }: { q: string; date: string }) {
  const drafts: SavedDraft[] = [];
  const keyword = q.toLowerCase();
  let beforeId: number | undefined;
  // Apply the SQL date filter first, then match keywords in the encrypted details.
  while (drafts.length < 100) {
    const conditions = ["f.request_id IS NULL"];
    const values: (string | number)[] = [];
    if (date) {
      conditions.push("f.use_date = ?");
      values.push(date);
    }
    if (beforeId !== undefined) {
      conditions.push("f.id < ?");
      values.push(beforeId);
    }
    const [rows] = await db.execute<SavedRow[]>(
      `SELECT f.id, f.user_id, u.display_name, f.use_date, f.start_time, f.end_time, f.attendee_count, f.encrypted_form
       FROM school_booking_records f JOIN users u ON u.id=f.user_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY f.id DESC LIMIT 100`,
      values,
    );
    for (const row of rows) {
      const { roomName, eventName, purpose } = decryptSchoolState<BookingDetails>(row.encrypted_form, row.user_id);
      if (keyword && ![roomName, eventName, purpose].some((value) => value.toLowerCase().includes(keyword))) continue;
      drafts.push({
        id: row.id, roomName, eventName, purpose, date: row.use_date,
        start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5),
        attendees: row.attendee_count, displayName: row.display_name,
      });
      if (drafts.length === 100) break;
    }
    if (rows.length < 100) break;
    beforeId = rows[rows.length - 1].id;
  }
  return drafts;
}
