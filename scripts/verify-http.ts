import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { hashPassword } from "../src/lib/password";
import { decryptSchoolState, encryptSchoolState } from "../src/lib/school/crypto";
import { readSheet } from "read-excel-file/node";

async function main() {
  const origin = "http://127.0.0.1:3100";
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3308),
    user: process.env.DB_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
  });
  const users: number[] = [],
    cookies: string[] = [];
  const name = `qa_${Date.now()}`,
    password = "Temporary-Local-QA-Only!";
  async function request(
    path: string,
    method = "GET",
    data?: unknown,
    cookie = "",
    requestOrigin = origin,
  ) {
    return fetch(origin + path, {
      method,
      redirect: "manual",
      headers: {
        origin: requestOrigin,
        "Content-Type": "application/json",
        cookie,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  }
  async function login(username: string, secret: string, remember = true) {
    const response = await request("/api/login", "POST", {
      username,
      password: secret,
      remember,
    });
    assert.equal(response.status, 200, await response.text());
    const header = response.headers.get("set-cookie")!;
    assert.match(header, /HttpOnly/i);
    assert.match(header, /SameSite=lax/i);
    assert.match(header, new RegExp(`Max-Age=${remember ? 2592000 : 28800}`));
    const cookie = header.split(";")[0];
    cookies.push(cookie);
    return cookie;
  }
  async function adminDrafts(query: string, cookie: string) {
    const res = await request(
      "/?view=drafts&" + query,
      "GET",
      undefined,
      cookie,
    );
    assert.equal(res.status, 200);
    return res.text();
  }
  async function history(cookie: string) {
    const res = await request("/school?view=history", "GET", undefined, cookie);
    assert.equal(res.status, 200);
    return res.text();
  }
  try {
    const [version] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT VERSION() AS version",
    );
    assert.match(version[0].version, /^8\.0\./);
    console.log(`MySQL ${version[0].version}`);
    assert.equal((await request("/")).status, 307);
    assert.equal(
      (await request("/api/rooms", "PATCH", { id: 1, enabled: false })).status,
      403,
    );
    for (let i = 0; i < 2; i++) {
      const [result] = await conn.execute<mysql.ResultSetHeader>(
        "INSERT INTO users(username,display_name,password_hash,role) VALUES (?,?,?,?)",
        [name + i, "검증 계정", await hashPassword(password), "student"],
      );
      users.push(result.insertId);
    }
    const student = await login(name + "0", password),
      other = await login(name + "1", password, false),
      admin = await login("admin", process.env.ADMIN_PASSWORD!);
    const landing = await request("/", "GET", undefined, student);
    assert.equal(landing.status, 307);
    assert.equal(landing.headers.get("location"), "/school");
    const legacy = await request(
      "/?view=drafts&q=legacy&status=prepared",
      "GET",
      undefined,
      student,
    );
    assert.equal(legacy.status, 307);
    assert.equal(legacy.headers.get("location"), "/school?view=history");
    assert.equal((await request("/", "GET", undefined, admin)).status, 200);
    for (const [path, method, cookie] of [
      ["/api/login", "POST", ""],
      ["/api/school/drafts", "POST", student],
      ["/api/rooms", "PATCH", admin],
    ]) {
      assert.equal(
        (await request(path, method, null, cookie)).status,
        400,
        `${path} null input`,
      );
      const malformed = await fetch(origin + path, {
        method,
        headers: { origin, "Content-Type": "application/json", cookie },
        body: "{broken",
      });
      assert.equal(malformed.status, 400, `${path} malformed input`);
    }
    assert.equal(
      (
        await request(
          "/api/rooms",
          "PATCH",
          { id: 1, enabled: false },
          student,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/api/school/drafts",
          "POST",
          {},
          student,
          "https://other.example",
        )
      ).status,
      400,
    );
    const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const day2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const templateParams = new URLSearchParams({ date: day, start: "10:00", end: "11:00", room: "공학관 E동 113-1", count: "3" });
    const template = await request(`/api/school/attendance-template?${templateParams}`, "GET", undefined, student);
    assert.equal(template.status, 200);
    assert.match(template.headers.get("content-disposition") ?? "", /attachment/);
    const rows = await readSheet(await template.arrayBuffer());
    assert.deepEqual(rows[0], ["학부(학과)", "학번", "이름", "날짜", "시간", "사용공간"]);
    assert.equal(rows.length, 4);
    for (const row of rows.slice(1))
      assert.deepEqual(row.slice(3), [day, "10:00~11:00", "공학관 E동 113-1"]);
    const invalidAttachment = new FormData();
    invalidAttachment.set("booking", "{}");
    invalidAttachment.set("attendance", new File(["x"], "attendance.xlsx"));
    const invalidSubmission = await fetch(origin + "/api/school/bookings", {
      method: "POST", headers: { origin, cookie: student }, body: invalidAttachment,
    });
    assert.equal(invalidSubmission.status, 400);
    assert.match(await invalidSubmission.text(), /요청 식별자/);
    const [areas] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT school_area FROM rooms WHERE school_area IS NOT NULL AND enabled=TRUE ORDER BY id LIMIT 1",
    );
    assert.ok(areas.length, "The test needs one school area with temporary saving enabled.");
    const saved = {
      area: areas[0].school_area,
      roomCode: "9999999999",
      roomName: "검증전용공간",
      eventName: name + "_temporary",
      date: day,
      start: "18:00",
      end: "19:00",
      attendees: 1,
      purpose: name + "_current_purpose",
      equipment: name + "_private_equipment",
      phone: "010-0000-0000",
    };
    const person = { department: "테스트학과", studentId: "001234", name: name + "_private_attendee" };
    const inlineBooking = await request("/api/school/bookings", "POST", {
      ...saved,
      attendees: 2,
      requestKey: randomUUID(),
      eventCode: "QA_EVENT",
      userCode: "QA_STUDENT",
      consent: true,
      attendanceEntries: [person, person],
    }, student);
    assert.equal(inlineBooking.status, 400);
    assert.match((await inlineBooking.json()).error, /같은 학번/);
    const draftAttendance = [person, { department: "테스트학과", studentId: "", name: "" }, { department: "", studentId: "", name: "" }];
    assert.equal((await request("/api/school/drafts", "POST", { ...saved, attendanceEntries: draftAttendance }, student)).status, 201);
    const [stored] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT use_date,start_time,end_time,attendee_count,encrypted_form FROM school_booking_records WHERE user_id=?",
      [users[0]],
    );
    assert.equal(stored.length, 1);
    const { date, start, end, attendees, roomCode, ...details } = saved;
    assert.equal(stored[0].use_date, date);
    assert.equal(stored[0].start_time, start + ":00");
    assert.equal(stored[0].end_time, end + ":00");
    assert.equal(stored[0].attendee_count, attendees);
    assert.doesNotMatch(stored[0].encrypted_form, new RegExp(person.name));
    assert.deepEqual(decryptSchoolState(stored[0].encrypted_form, users[0]), {
      ...details, eventCode: "", userCode: "", attendanceEntries: draftAttendance,
    });
    const reopened = await request("/api/school/drafts?roomCode=" + roomCode, "GET", undefined, student);
    assert.equal(reopened.status, 200);
    const { record } = await reopened.json();
    assert.deepEqual([record.date, record.start, record.end, record.attendees, record.roomCode], [date, start, end, attendees, roomCode]);
    assert.deepEqual(record.attendanceEntries, draftAttendance);
    const differentOwner = await request("/api/school/drafts?roomCode=" + roomCode, "GET", undefined, other);
    assert.deepEqual(await differentOwner.json(), { record: null });
    assert.match(await history(student), new RegExp(saved.eventName));
    assert.doesNotMatch(await history(student), new RegExp(person.name));
    assert.doesNotMatch(await history(other), new RegExp(saved.eventName));

    // The saved-form page can be exercised without looking up school availability.
    await conn.execute(
      "INSERT INTO school_connections(user_id,identity_hash,encrypted_state,valid_until) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))",
      [users[0], randomBytes(32).toString("hex"), encryptSchoolState({}, users[0])],
    );
    const reusePath = "/school?reuse=" + record.id;
    const reusePage = await request(reusePath, "GET", undefined, student);
    assert.equal(reusePage.status, 200);
    assert.match(await reusePage.text(), new RegExp(person.name));
    assert.doesNotMatch(await (await request(reusePath, "GET", undefined, other)).text(), new RegExp(person.name));

    // Newer records with a different date must not crowd out the matching reservation.
    const filler = Array.from({ length: 100 }, (_, i) => [
      users[0], roomCode, day2, start, end, attendees,
      encryptSchoolState({ ...details, eventName: name + "_filler_" + i, purpose: "" }, users[0]),
    ]);
    await conn.execute(
      `INSERT INTO school_booking_records(user_id,room_code,use_date,start_time,end_time,attendee_count,encrypted_form)
       VALUES ${filler.map(() => "(?,?,?,?,?,?,?)").join(",")}`,
      filler.flat(),
    );
    assert.doesNotMatch(await adminDrafts("", admin), new RegExp(saved.eventName));
    const adminResult = await adminDrafts("q=" + encodeURIComponent(saved.purpose) + "&date=" + day, admin);
    assert.match(adminResult, new RegExp(saved.eventName));
    assert.doesNotMatch(adminResult, new RegExp(saved.equipment));
    assert.doesNotMatch(adminResult, new RegExp(person.name));
    assert.doesNotMatch(adminResult, new RegExp(person.studentId));
    assert.doesNotMatch(adminResult, /010-0000-0000/);
    assert.doesNotMatch(await adminDrafts("date=" + day2, admin), new RegExp(saved.eventName));
    assert.match(await adminDrafts("date=2026-02-30", admin), /검색 조건이 올바르지 않습니다/);
    assert.equal((await request("/api/drafts", "POST", {}, student)).status, 404);
    assert.equal(
      (await request("/api/logout", "POST", {}, student)).status,
      200,
    );
    assert.equal(
      (await request("/api/school/drafts", "POST", saved, student)).status,
      401,
    );
    await conn.execute(
      "UPDATE sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE user_id=?",
      [users[1]],
    );
    assert.equal((await request("/", "GET", undefined, other)).status, 307);
    console.log(
      "Passed: HTTP/MySQL temporary saves, filtered search, student/admin and ownership isolation, malformed inputs, CSRF, password/session expiry/logout, and retired route.",
    );
  } finally {
    for (const cookie of cookies)
      await request("/api/logout", "POST", {}, cookie).catch(() => {});
    for (const id of users) await conn.execute("DELETE FROM users WHERE id=?", [id]);
    await conn.end();
  }
}
main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
