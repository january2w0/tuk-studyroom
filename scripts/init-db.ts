import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { hashPassword } from "../src/lib/password";
import { decryptSchoolState, encryptSchoolState } from "../src/lib/school/crypto";
import type { BookingForm } from "../src/lib/school/booking-records";

async function migrateBookingSchedule(conn: mysql.Connection) {
  const [columns] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='school_booking_records' AND COLUMN_NAME='use_date'",
  );
  if (columns[0]?.IS_NULLABLE === "NO") return;
  if (!columns.length) {
    await conn.query(`ALTER TABLE school_booking_records
      ADD COLUMN use_date DATE NULL AFTER request_id,
      ADD COLUMN start_time TIME NULL AFTER use_date,
      ADD COLUMN end_time TIME NULL AFTER start_time,
      ADD COLUMN attendee_count TINYINT UNSIGNED NULL AFTER end_time,
      ADD INDEX booking_date (use_date, request_id, id),
      ADD CONSTRAINT booking_time_range CHECK (start_time >= '00:00:00' AND end_time < '24:00:00' AND end_time > start_time),
      ADD CONSTRAINT booking_attendee_count CHECK (attendee_count <= 99)`);
  }

  // Each batch can be safely retried after a failed setup.
  for (;;) {
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        "SELECT id,user_id,room_code,encrypted_form FROM school_booking_records WHERE use_date IS NULL ORDER BY id LIMIT 100 FOR UPDATE",
      );
      for (const row of rows) {
        try {
          const { date, start, end, attendees, roomCode, ...details } =
            decryptSchoolState<BookingForm>(row.encrypted_form, row.user_id);
          if (typeof date !== "string" || typeof start !== "string" || typeof end !== "string" ||
              !Number.isInteger(attendees) || roomCode !== row.room_code) {
            throw new Error("기존 예약의 일정 또는 공간 정보가 올바르지 않습니다.");
          }
          await conn.execute(
            `UPDATE school_booking_records
             SET use_date=?, start_time=?, end_time=?, attendee_count=?, encrypted_form=? WHERE id=?`,
            [date, start, end, attendees, encryptSchoolState(details, row.user_id), row.id],
          );
        } catch (error) {
          throw new Error(`예약 기록 ${row.id}의 일정을 이전하지 못했습니다.`, { cause: error });
        }
      }
      await conn.commit();
      if (rows.length < 100) break;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  }

  await conn.query(`ALTER TABLE school_booking_records
    MODIFY COLUMN use_date DATE NOT NULL,
    MODIFY COLUMN start_time TIME NOT NULL,
    MODIFY COLUMN end_time TIME NOT NULL,
    MODIFY COLUMN attendee_count TINYINT UNSIGNED NOT NULL`);
}

async function main() {
  if (!process.env.STUDENT_PASSWORD || !process.env.ADMIN_PASSWORD)
    throw new Error("앱 전용 초기 암호를 설정해주세요.");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3308),
    user: process.env.DB_USER ?? "meeting_app",
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME ?? "tuk_meeting_room",
    multipleStatements: true,
  });
  try {
    await conn.query(await readFile("sql/schema.sql", "utf8"));
    await migrateBookingSchedule(conn);
    const [areaColumns] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rooms' AND COLUMN_NAME='school_area'",
    );
    if (!areaColumns.length)
      await conn.query("ALTER TABLE rooms ADD COLUMN school_area VARCHAR(24) UNIQUE AFTER location");
    await conn.query(
      `INSERT IGNORE INTO rooms(name,location,school_area) VALUES
        ('제2생활관','207호','dorm'),('공학관 E동','113호','engineering'),('TIP 3층','312호','tip')`,
    );
    for (const [username, displayName, password, role] of [
      ["student", "학생", process.env.STUDENT_PASSWORD, "student"],
      ["admin", "관리자", process.env.ADMIN_PASSWORD, "admin"],
    ]) {
      await conn.execute(
        "INSERT IGNORE INTO users (username,display_name,password_hash,role) VALUES (?,?,?,?)",
        [username, displayName, await hashPassword(password!), role],
      );
    }
    console.log(
      "스키마와 앱 전용 계정을 준비했습니다. 기존 계정은 변경하지 않았습니다.",
    );
  } finally {
    await conn.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
