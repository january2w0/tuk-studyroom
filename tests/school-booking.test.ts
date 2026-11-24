import { test } from "node:test";
import assert from "node:assert/strict";
import { SchoolClient } from "../src/lib/school/client";
import { datasetRequest, SchoolError, type SchoolRow } from "../src/lib/school/xml";
import {
  MeetingRoomApi,
  bookingStatus,
  validateBooking,
  validateFacilityPeriod,
} from "../src/lib/school/meeting-api";
import { seoulToday } from "../src/lib/validation";
import { readSheet } from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { attendanceHeaders, attendanceMime, parseAttendanceEntries } from "../src/lib/school/attendance";

const profile = {
  persNo: "UNIT_STUDENT",
  userGbn: "01",
  userNm: "검증학생",
  deptNm: "검증학과",
  campusCd: "01",
};
const input = {
  date: seoulToday(),
  start: "10:00",
  end: "11:00",
  roomCode: "196582",
  purpose: "단위 검증",
  eventName: "검증회의",
  equipment: "노트북",
  phone: "010-1234-5678",
  eventCode: "UNIT_EVENT",
  userCode: "UNIT_USER",
  attendees: 2,
  consent: true,
};
function fixture(
  options: {
    dual?: boolean;
    pending?: boolean;
    foreignOwner?: boolean;
    fee?: string;
    timeout?: boolean;
    facility?: SchoolRow;
    otherRooms?: SchoolRow[];
    missingSavedAttachment?: boolean;
    uploadError?: boolean;
  } = {},
) {
  let state = "010";
  const writes: string[] = [];
  const uploads: File[] = [];
  let attachment = "";
  const row = () => ({
    instUseAplyNo: "UNIT_REQUEST",
    strctrNm: "제2생활관",
    reserInstNm: "미팅룸-4",
    reserInstBasiCd: "196582",
    aplytDstshNo: options.foreignOwner ? "OTHER_STUDENT" : profile.persNo,
    stGbn: state,
    reserInstGbnYn: options.pending ? "N" : "Y",
    totAmt: options.fee ?? "0",
    attachNo: options.missingSavedAttachment ? "" : attachment,
    ...options.facility,
  });
  const reply = (datasets: Record<string, Record<string, string>[]>) =>
    new Response(datasetRequest({ ErrorCode: "0" }, datasets));
  const fake: typeof fetch = async (url, init) => {
    const path = String(url),
      body = String(init?.body);
    if (path.includes("findMenuOne"))
      return reply({ DS_MENUONEINFO: [{ pgmId: "UNIT_PROGRAM" }] });
    if (path.includes("findStudInfoListPop")) {
      assert.match(body, /<Col id="stuno">UNIT_STUDENT<\/Col>/);
      return reply({ DS_SREG111M01: [{ stuno: profile.persNo, deptCd: "UNIT_DEPT" }] });
    }
    if (path.includes("findCodeComboList"))
      return reply({
        DS_EVENT_GBN: [{ code: "UNIT_EVENT", fullNm: "검증행사" }],
        DS_INST_USER_GBN: [{ code: "UNIT_USER", fullNm: "검증이용자" }],
      });
    if (path.includes("findSpaceReserInstList")) {
      assert.match(body, /<Col id="deptCd">UNIT_DEPT<\/Col>/);
      return reply({
        DS_INST711: [
          { acceptRcnt: "6", aplyPosbMaxTm: "2", ...row() },
          ...(options.otherRooms ?? []),
        ],
      });
    }
    if (path.includes("findInstUseAplyList"))
      return reply({ DS_INST731: [row()] });
    if (path.includes("fileDefaultUpload")) {
      assert.equal(new URL(path).searchParams.get("tablNm"), "ADM.inst731");
      assert.equal(new URL(path).searchParams.get("pgmId"), "UNIT_PROGRAM");
      assert.ok(init?.body instanceof FormData);
      const file = init.body.get("upfile0");
      assert.ok(file instanceof File);
      uploads.push(file);
      return options.uploadError
        ? new Response("error", { status: 500 })
        : new Response("SSV:utf-8\x1eErrorCode=0\x1eDataset:DS_FILE\x1e_RowType_\x1fattachNo:STRING(80)\x1flogicFileNm:STRING(100)\x1eN\x1fUNIT_ATTACHMENT\x1fattendance.xlsx\x1e");
    }
    if (path.includes("findDualCheck"))
      return reply({
        DS_DUAL: [{ dualYn: options.dual ? "Y" : "N", limitYn: "N" }],
      });
    if (path.includes("saveInstUseAplyList")) {
      writes.push(body);
      if (body.includes('type="insert"')) {
        attachment = /<Col id="attachNo">([^<]+)<\/Col>/.exec(body)?.[1] ?? "";
        return reply({ DS_MAXNO: [{ instUseAplyNo: "UNIT_REQUEST" }] });
      }
      if (options.timeout) throw new Error("simulated timeout");
      state = body.includes('<Col id="stGbn">010</Col>')
        ? "010"
        : options.pending
          ? "020"
          : "070";
      return reply({});
    }
    throw new Error("Unexpected fixture path");
  };
  const client = new SchoolClient(undefined, fake);
  client.profile = profile;
  return { api: new MeetingRoomApi(client), writes, uploads };
}
test("booking follows insert, server ID, duplicate check, update and read-back", async () => {
  const f = fixture();
  let saved = "";
  const receipt = await f.api.submit(input, async (id) => {
    saved = id;
    assert.equal(f.writes.length, 1);
  });
  assert.equal(saved, "UNIT_REQUEST");
  assert.equal(bookingStatus(receipt), "confirmed");
  assert.equal(f.writes.length, 2);
  assert.equal(f.uploads.length, 0);
  assert.match(f.writes[0], /type="insert"/);
  assert.match(f.writes[0], /<Col id="etcAprtNm">노트북<\/Col>/);
  assert.match(f.writes[1], /type="update"/);
  assert.equal(bookingStatus(await f.api.cancel(saved), "cancel"), "cancelled");
  assert.equal(f.writes.length, 3);
});
test("approval pending is not reported as confirmed", async () => {
  const receipt = await fixture({ pending: true }).api.submit(
    input,
    async () => {},
  );
  assert.equal(bookingStatus(receipt), "submitted");
});
test("expanded rooms reuse school lookup, submission and booking history", async () => {
  const rooms: SchoolRow[] = [
    { strctrNm: "공학관 E동", reserInstNm: "SW스터디룸-1(113-1)", roomNo: "113-1", deptChk: "Y" },
    { strctrNm: "기술혁신파크", reserInstNm: "창업동아리회의실2(312-2)", roomNo: "312-2", acceptRcnt: "" },
    { strctrNm: "제2생활관", reserInstNm: "PBL강의실", roomNo: "208", acceptRcnt: "40" },
  ];
  const lookup = fixture({
    otherRooms: [
      ...rooms,
      { strctrNm: "기술혁신파크", reserInstNm: "GX_Room", roomNo: "602" },
      { strctrNm: "다른 건물", roomNo: "113-1" },
      { strctrNm: "공학관 E동", roomNo: "113-12" },
      { strctrNm: "제2생활관", reserInstNm: "PBL강의실", roomNo: "209" },
      { strctrNm: "제2생활관", reserInstNm: "이러닝스튜디오", roomNo: "209" },
    ],
  });
  const results = await lookup.api.rooms(input);
  assert.deepEqual(results.map(({ area }) => area), ["dorm", "engineering", "tip", "pbl"]);
  for (const { roomNo, ...facility } of rooms) {
    const f = fixture({ facility, pending: true });
    const saved = await f.api.submit({ ...input, attendees: 3 }, async () => {});
    assert.equal(bookingStatus(saved), "submitted");
    assert.equal((await f.api.rooms(input))[0].number, roomNo);
    assert.equal((await f.api.list(input.date))[0].reserInstNm, facility.reserInstNm);
    assert.equal(bookingStatus(await f.api.cancel(saved.instUseAplyNo), "cancel"), "cancelled");
  }
});
test("E building checks the school department flag and minimum size before saving", async () => {
  const facility = { strctrNm: "공학관 E동", roomNo: "113-2", reserInstNm: "SW스터디룸-2" };
  const restricted = fixture({ facility: { ...facility, deptChk: "N" } });
  await assert.rejects(() => restricted.api.submit(input, async () => {}), /AI융합대학/);
  assert.equal(restricted.writes.length, 0);
  const eligible = fixture({ facility: { ...facility, deptChk: "Y" } });
  await assert.rejects(() => eligible.api.submit(input, async () => {}), /3명부터/);
  assert.equal(eligible.writes.length, 0);
});

test("SW study room requires and validates the attendance workbook before sending anything", async () => {
  const facility = { strctrNm: "공학관 E동", roomNo: "113-1", reserInstNm: "SW스터디룸-1", reserInstBasiCd: "196895", deptChk: "Y" };
  const booking = { ...input, roomCode: facility.reserInstBasiCd, attendees: 3 };
  const entries = Array.from({ length: 3 }, (_, i) => [
    "테스트학과", String(1000 + i), `검증학생${i}`, booking.date, "10:00~11:00", "공학관 E동 113-1",
  ]);
  async function workbook(rows: string[][]) {
    const buffer = await writeXlsxFile(rows.map((row) => row.map((value) => ({ value })))).toBuffer();
    return new File([new Uint8Array(buffer)], "attendance.xlsx", { type: attendanceMime });
  }
  const correct = await workbook([attendanceHeaders, ...entries]);
  const incorrectTime = entries.map((row) => row.map((value, column) => column === 4 ? "11:00-12:00" : value));
  const cases = [
    { file: undefined, message: /참석자 명단을 입력/ },
    { file: await workbook([["학과", "학번", "이름"], ...entries]), message: /열 이름/ },
    { file: await workbook([attendanceHeaders, ...entries.slice(0, 2)]), message: /참석자 수/ },
    { file: await workbook([attendanceHeaders, ...incorrectTime]), message: /일정을|일정과/ },
    { file: new File(["not a spreadsheet"], "attendance.xlsx"), message: /읽을 수 없습니다/ },
  ];
  for (const { file, message } of cases) {
    const f = fixture({ facility });
    await assert.rejects(() => f.api.submit(booking, async () => assert.fail(), {
      attendance: file,
      onReady: async () => assert.fail("Invalid attendance should fail before recording a request"),
    }), message);
    assert.equal(f.uploads.length, 0);
    assert.equal(f.writes.length, 0);
  }
  const success = fixture({ facility });
  await success.api.submit(booking, async () => {}, { attendance: correct });
  assert.deepEqual(success.uploads.map((file) => file.name), ["attendance.xlsx"]);
  assert.equal(success.writes.length, 2);
  assert.match(success.writes[0], /<Col id="attachNo">UNIT_ATTACHMENT<\/Col>/);
  assert.match(success.writes[1], /<Col id="attachNo">UNIT_ATTACHMENT<\/Col>/);

  const rejected = fixture({ facility, uploadError: true });
  await assert.rejects(() => rejected.api.submit(booking, async () => assert.fail(), { attendance: correct }), /첨부하지 못했습니다/);
  assert.equal(rejected.writes.length, 0);
  const missing = fixture({ facility, missingSavedAttachment: true });
  await assert.rejects(() => missing.api.submit(booking, async () => {}, { attendance: correct }), /연결되지 않았습니다/);
  assert.equal(missing.writes.length, 1);
});

test("inline attendance is validated and uploaded in the school workbook format", async () => {
  const entries = [
    { department: "검증학과 ", studentId: "000001", name: " 첫째" },
    { department: "검증학과", studentId: "000002", name: "둘째" },
    { department: "검증학과", studentId: "000003", name: "셋째" },
  ];
  assert.throws(() => parseAttendanceEntries(entries.slice(1), 3), /참여 인원/);
  assert.throws(() => parseAttendanceEntries([entries[0], entries[0], entries[2]], 3), /같은 학번/);

  const attendanceEntries = parseAttendanceEntries(entries, 3);
  const facilities: SchoolRow[] = [
    { strctrNm: "공학관 E동", roomNo: "113-1", reserInstNm: "SW스터디룸-1", reserInstBasiCd: "196895", deptChk: "Y" },
    { strctrNm: "기술혁신파크", roomNo: "312-3", reserInstNm: "창업동아리회의실3", reserInstBasiCd: "196996" },
  ];
  for (const facility of facilities) {
    const booking = { ...input, roomCode: facility.reserInstBasiCd, attendees: 3 };
    const f = fixture({ facility });
    await f.api.submit(booking, async () => {}, { attendanceEntries });
    assert.equal(f.uploads.length, 1);
    assert.deepEqual(await readSheet(await f.uploads[0].arrayBuffer()), [
      attendanceHeaders,
      ...attendanceEntries.map(({ department, studentId, name }) => [
        department, studentId, name, booking.date, "10:00~11:00", `${facility.strctrNm} ${facility.roomNo}`,
      ]),
    ]);
    assert.match(f.writes.at(-1) ?? "", /<Col id="attachNo">UNIT_ATTACHMENT<\/Col>/);
  }
});
test("duplicate and paid bookings stop before final submission", async () => {
  for (const options of [{ dual: true }, { fee: "1000" }]) {
    const f = fixture(options);
    await assert.rejects(
      () => f.api.submit(input, async () => {}),
      (e: unknown) => e instanceof SchoolError && e.code === "SAVED_ONLY",
    );
    assert.equal(f.writes.length, 1);
  }
});
test("a foreign owner cannot be cancelled and an ambiguous write is never retried", async () => {
  const foreign = fixture({ foreignOwner: true });
  await assert.rejects(() => foreign.api.cancel("UNIT_REQUEST"));
  assert.equal(foreign.writes.length, 0);
  const timeout = fixture({ timeout: true });
  await assert.rejects(
    () => timeout.api.submit(input, async () => {}),
    (e: unknown) => e instanceof SchoolError && e.code === "NETWORK_ERROR",
  );
  assert.equal(timeout.writes.length, 2);
});
test("booking validation requires explicit consent and valid contact", () => {
  assert.equal(validateBooking(input).roomCode, "196582");
  for (const patch of [
    { consent: false },
    { phone: "bad" },
    { attendees: 0 },
    { roomCode: "other-building" },
    { equipment: "x".repeat(201) },
  ])
    assert.throws(() => validateBooking({ ...input, ...patch }));
});
test("facility notice and reservation window reject invalid dates before writes", () => {
  const future = new Date(Date.parse(seoulToday()) + 32 * 86400000).toISOString().slice(0, 10);
  assert.throws(() => validateFacilityPeriod({ aplyTermDcnt: "30" }, { ...input, date: future }));
  let weekend = new Date(seoulToday() + "T00:00:00Z");
  while (weekend.getUTCDay() !== 6) weekend = new Date(weekend.getTime() + 86400000);
  assert.throws(() => validateFacilityPeriod({ atentCtntCtnt: "학기 중 평일 9:30~17:00" }, { ...input, date: weekend.toISOString().slice(0, 10) }));
  assert.throws(() => validateFacilityPeriod({ atentCtntCtnt: "9:30~17:00" }, { ...input, end: "18:00" }));
});
