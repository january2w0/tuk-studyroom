import { SchoolClient } from "./client";
import { SchoolError, type SchoolRow } from "./xml";
import { InputError, seoulToday } from "../validation";
import { roomAreas, schoolRoom, schoolRoomRequiresAttendanceFile, schoolRoomRestriction } from "./rooms";
import {
  attendanceMime, attendanceRequiredMessage, validateAttendanceFile,
  writeAttendanceWorkbook, type AttendanceEntry,
} from "./attendance";

export type Period = { date: string; start: string; end: string };
export type BookingInput = Period & {
  roomCode: string;
  purpose: string;
  eventName: string;
  attendees: number;
  equipment: string;
  phone: string;
  eventCode: string;
  userCode: string;
  consent: boolean;
};
export function validatePeriod(input: Record<string, unknown>): Period {
  const { date, start, end } = input;
  if (
    typeof date !== "string" ||
    typeof start !== "string" ||
    typeof end !== "string"
  )
    throw new InputError("날짜와 시간을 선택해주세요.");
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date < seoulToday()
  )
    throw new InputError("오늘 이후의 올바른 날짜를 선택해주세요.");
  const time = /^(?:[01]\d|2[0-3]):(?:00|30)$/;
  if (!time.test(start) || !time.test(end) || end <= start)
    throw new InputError("시작·종료 시간을 확인해주세요.");
  return { date, start, end };
}
export function validateBooking(input: Record<string, unknown>): BookingInput {
  const period = validatePeriod(input);
  for (const field of [
    "roomCode",
    "purpose",
    "eventName",
    "phone",
    "eventCode",
    "userCode",
  ])
    if (
      typeof input[field] !== "string" ||
      !input[field].trim() ||
      input[field].length > 200
    )
      throw new InputError("신청 내용과 연락처를 확인해주세요.");
  const equipment = input.equipment ?? "";
  if (typeof equipment !== "string" || equipment.length > 200)
    throw new InputError("필요기자재를 200자 이내로 입력해주세요.");
  if (
    !/^\d{1,20}$/.test(String(input.roomCode)) ||
    typeof input.attendees !== "number" ||
    !Number.isInteger(input.attendees) ||
    input.attendees < 1 ||
    input.attendees > 99 ||
    input.consent !== true
  )
    throw new InputError("참여 인원과 학교 개인정보 동의를 확인해주세요.");
  if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(String(input.phone)))
    throw new InputError("휴대폰 번호 형식을 확인해주세요.");
  return {
    ...period,
    roomCode: String(input.roomCode),
    purpose: String(input.purpose).trim(),
    eventName: String(input.eventName).trim(),
    equipment: equipment.trim(),
    phone: String(input.phone),
    eventCode: String(input.eventCode),
    userCode: String(input.userCode),
    attendees: input.attendees,
    consent: true,
  };
}
export function bookingStatus(row: SchoolRow, operation = "create") {
  if (row.stGbn === "070") return "confirmed";
  if (row.stGbn === "020") return "submitted";
  if (row.stGbn === "010")
    return operation === "cancel" ? "cancelled" : "saved";
  return "unknown";
}
export function validateFacilityPeriod(facility: SchoolRow, input: Period) {
  const daysAhead = (Date.parse(input.date) - Date.parse(seoulToday())) / 86400000;
  const window = Number(facility.aplyTermDcnt || "30");
  if (daysAhead > Math.min(30, window))
    throw new InputError("이 공간은 신청 가능 기간 이내의 날짜만 예약할 수 있습니다.");
  if (facility.priorAplyDcnt && daysAhead < Number(facility.priorAplyDcnt))
    throw new InputError("학교의 사전 신청 기간을 확인해주세요.");
  const notice = facility.atentCtntCtnt || "";
  const weekday = new Date(input.date + "T00:00:00Z").getUTCDay();
  if (notice.includes("평일") && (weekday === 0 || weekday === 6))
    throw new InputError("학교 유의사항에 따라 평일에만 신청할 수 있습니다.");
  if (
    (facility.admAccpDeptNm === "기획운영팀" || /9:30\s*~\s*17:00/.test(notice)) &&
    (input.start < "09:30" || input.end > "17:00")
  )
    throw new InputError("학교 공간 운영시간은 학기 중 평일 09:30~17:00입니다. 방학 중에는 14:30까지 이용할 수 있습니다.");
}
export class MeetingRoomApi {
  private programId = "";
  constructor(private client: SchoolClient) {}
  private async context() {
    const profile = this.client.profile;
    if (!profile.persNo || profile.userGbn !== "01")
      throw new SchoolError(
        "학교 학생 신분과 본인 정보를 확인할 수 없습니다.",
        "AUTH_REQUIRED",
      );
    if (!this.programId) {
      const menu = await this.client.request(
        "/com/MenuCtr/findMenuOne.do?menuId=kpu&pgmId=kpu",
        { strMenuId: "MGH0950" },
      );
      const info = menu.datasets.DS_MENUONEINFO?.[0];
      if (!info?.pgmId || !/^[A-Za-z0-9_-]+$/.test(info.pgmId))
        throw new SchoolError(
          "학교의 공간 예약 메뉴 권한을 확인하지 못했습니다.",
        );
      this.programId = info.pgmId;
    }
    return profile;
  }
  private async request(
    name: string,
    condition: SchoolRow,
    dataset = "DS_COND",
    rowType?: "insert" | "update",
  ) {
    await this.context();
    return this.client.request(
      `/adm/inst/NsrsCtr/${name}.do?menuId=MGH0950&pgmId=${this.programId}`,
      {},
      { [dataset]: [condition] },
      rowType ? { [dataset]: rowType } : {},
    );
  }
  async options() {
    const profile = await this.context();
    const reply = await this.client.request(
      `/com/CodeCtr/findCodeComboList.do?menuId=MGH0950&pgmId=${this.programId}`,
      {
        rpstCd: "GH024|GH065",
        useYn: "1|1",
        textMode: "N|N",
        dataSet: "DS_EVENT_GBN|DS_INST_USER_GBN",
      },
    );
    return {
      events: reply.datasets.DS_EVENT_GBN ?? [],
      users: reply.datasets.DS_INST_USER_GBN ?? [],
      name: profile.userNm ?? "",
      department: profile.deptNm ?? "",
    };
  }
  async rooms(period: Period) {
    const p = await this.context();
    // Use the same student affiliation lookup as the school's booking page.
    const reply = await this.client.request(
      `/uni/sreg/MastCtr/findStudInfoListPop.do?menuId=MGH0950&pgmId=${this.programId}`,
      {},
      { DS_COND: [{ stuno: p.persNo }] },
    ).catch((error: unknown) => {
      if (!(error instanceof SchoolError)) throw error;
      return undefined;
    });
    const students = reply?.datasets.DS_SREG111M01;
    const student =
      students?.length === 1 && students[0].stuno === p.persNo
        ? students[0]
        : undefined;
    const result = await this.request("findSpaceReserInstList", {
      sttsGbn: "01",
      persNo: p.persNo,
      persNm: p.userNm ?? "",
      campGbn: p.campusCd ?? "",
      deptCd: student?.deptCd || p.deptCd || "",
      deptNm: student?.hgNm || p.deptNm || "",
      stdAplyYn: "1",
      grpCd: "01",
      orderBy: "3",
      aplyObj: "1",
      bussGbn: "030",
      stDt: period.date.replaceAll("-", ""),
      edDt: period.date.replaceAll("-", ""),
      stTime: period.start.replace(":", ""),
      edTime: period.end.replace(":", ""),
      existsYn: "1",
    });
    return (result.datasets.DS_INST711 ?? []).flatMap((row) => {
      const room = schoolRoom(row);
      return room ? [{ row, ...room }] : [];
    });
  }
  async list(date: string, toDate = date) {
    const p = await this.context();
    const reply = await this.request("findInstUseAplyList", {
      aplytDstshNo: p.persNo,
      frDt: date.replaceAll("-", ""),
      toDt: toDate.replaceAll("-", ""),
    });
    return (reply.datasets.DS_INST731 ?? []).filter(
      (row) => row.aplytDstshNo === p.persNo && schoolRoom(row),
    );
  }
  async detail(id: string) {
    const p = await this.context();
    const reply = await this.request("findInstUseAplyList", {
      instUseAplyNo: id,
      aplytDstshNo: p.persNo,
    });
    const row = reply.datasets.DS_INST731?.find(
      (r) => r.instUseAplyNo === id && r.aplytDstshNo === p.persNo,
    );
    if (!row || !schoolRoom(row))
      throw new SchoolError("본인의 공간 신청을 찾지 못했습니다.");
    return row;
  }
  async submit(
    input: BookingInput,
    onSaved: (id: string) => Promise<void>,
    { attendance, attendanceEntries, onReady }: {
      attendance?: File;
      attendanceEntries?: AttendanceEntry[];
      onReady?: () => Promise<void>;
    } = {},
  ) {
    const p = await this.context();
    const room = (await this.rooms(input)).find(
      ({ row }) => row.reserInstBasiCd === input.roomCode,
    );
    if (!room)
      throw new SchoolError(
        "해당 시간에 신청할 수 있는 공간이 아닙니다. 다시 조회해주세요.",
      );
    const { row: facility, area, number } = room;
    const restriction = schoolRoomRestriction(facility, area);
    if (restriction) throw new InputError(restriction);
    const minAttendees = roomAreas[area].minAttendees;
    if (input.attendees < minAttendees)
      throw new InputError(`이 공간은 ${minAttendees}명부터 신청할 수 있습니다.`);
    validateFacilityPeriod(facility, input);
    const options = await this.options();
    if (
      !options.events.some((r) => r.code === input.eventCode) ||
      !options.users.some((r) => r.code === input.userCode)
    )
      throw new InputError("행사·이용자 구분을 다시 선택해주세요.");
    const capacity = Number(facility.acceptRcnt);
    if (capacity > 0 && input.attendees > capacity)
      throw new InputError("학교 시설 정원을 초과했습니다.");
    const minutes = (time: string) =>
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const duration = minutes(input.end) - minutes(input.start);
    if (
      Number(facility.aplyPosbMaxTm) > 0 &&
      duration > Number(facility.aplyPosbMaxTm) * 60
    )
      throw new InputError("학교의 최대 이용 시간을 초과했습니다.");
    if (schoolRoomRequiresAttendanceFile(facility) && !attendance && !attendanceEntries)
      throw new InputError(attendanceRequiredMessage);
    if (attendance) await validateAttendanceFile(attendance, input, number);
    let workbook = attendance;
    if (attendanceEntries) {
      const bytes = await writeAttendanceWorkbook(
        attendanceEntries, input.date, input.start, input.end, `${facility.strctrNm} ${number}`,
      );
      workbook = new File([new Uint8Array(bytes)], "attendance.xlsx", { type: attendanceMime });
    }
    await onReady?.();
    const attachment = workbook ? await this.client.uploadAttendance(workbook, this.programId) : undefined;
    const record: SchoolRow = {
      ...attachment,
      reserInstBasiCd: input.roomCode,
      reserInstGbn: facility.reserInstGbn ?? "",
      reserInstNm: facility.reserInstNmV || facility.reserInstNm || "",
      strctrNm: facility.strctrNm,
      eduSpaceNm: facility.eduSpaceNmV || facility.eduSpaceNm || "",
      admAccpDeptNm: facility.admAccpDeptNm ?? "",
      aplytDstshNo: p.persNo,
      aplytDstshNm: p.userNm ?? "",
      aplytDstshDeptNm: facility.aplytDstshDeptNm || p.deptNm || "",
      aplytGbn: facility.aplytGbn || "01",
      aplytHandpNo: input.phone,
      aplytTelno: input.phone,
      aplytEmail: facility.aplytEmail ?? "",
      deptNm: p.deptNm ?? "",
      userNm: p.userNm ?? "",
      aplyDt: seoulToday().replaceAll("-", ""),
      frDt: input.date.replaceAll("-", ""),
      toDt: input.date.replaceAll("-", ""),
      frHmint: input.start.replace(":", ""),
      toHmint: input.end.replace(":", ""),
      eventNm: input.eventName,
      eventCtnt: input.purpose,
      etcAprtNm: input.equipment,
      rcntTtCnt: String(input.attendees),
      eventGbn: input.eventCode,
      instUserGbn: input.userCode,
      outsidPsnYn: "0",
      consntYn: "1",
      useRgltnConsntYn: "1",
      stGbn: "010",
      atentCtntCtnt: facility.atentCtntCtnt ?? "",
      addNotiCtnt: facility.addNotiCtnt ?? "",
      useRgltn: facility.useRgltn ?? "",
    };
    const saved = await this.request(
      "saveInstUseAplyList",
      record,
      "DS_INST731",
      "insert",
    );
    const id = saved.datasets.DS_MAXNO?.[0]?.instUseAplyNo;
    if (!id)
      throw new SchoolError(
        "학교 저장 결과의 신청번호를 확인하지 못했습니다. 내역을 재확인해주세요.",
        "UNKNOWN_RESULT",
      );
    await onSaved(id);
    const detail = await this.detail(id);
    if (attachment && detail.attachNo !== attachment.attachNo)
      throw new SchoolError("학교 예약에 참석자 명단이 연결되지 않았습니다. 학교 내역에서 첨부 상태를 확인해주세요.", "SAVED_ONLY");
    if (detail.impbYn === "Y" || detail.schaffImpbYn === "Y")
      throw new SchoolError("학교에서 이미 예약된 시간으로 확인했습니다.", "SAVED_ONLY");
    if (detail.totAmt === undefined || !/^0(?:\.0+)?$/.test(detail.totAmt))
      throw new SchoolError(
        "학교의 무료 이용 여부를 확인하지 못해 최종 신청을 중단했습니다. 학교 사이트에서 저장된 내역을 확인해주세요.",
        "SAVED_ONLY",
      );
    const update = {
      ...detail,
      stGbn: detail.reserInstGbnYn === "Y" ? "070" : "020",
      reqGbn: "Y",
    };
    const check = await this.request(
      "findDualCheck",
      update,
      "DS_INST731",
      "update",
    );
    const dual = check.datasets.DS_DUAL?.[0];
    if (
      !dual ||
      !["Y", "N"].includes(dual.dualYn) ||
      !["Y", "N"].includes(dual.limitYn)
    )
      throw new SchoolError(
        "학교의 중복·이용 제한 결과를 확인하지 못했습니다.",
        "SAVED_ONLY",
      );
    if (dual.dualYn === "Y" || dual.limitYn === "Y")
      throw new SchoolError(
        dual.dualYn === "Y"
          ? "이미 예약된 시간입니다."
          : "학교의 1일 이용 한도를 초과했습니다.",
        "SAVED_ONLY",
      );
    await this.request("saveInstUseAplyList", update, "DS_INST731", "update");
    const receipt = await this.detail(id);
    if (attachment && receipt.attachNo !== attachment.attachNo)
      throw new SchoolError("최종 신청의 첨부 상태를 확인하지 못했습니다. 학교 내역을 확인해주세요.", "UNKNOWN_RESULT");
    return receipt;
  }
  async cancel(id: string) {
    const detail = await this.detail(id);
    if (detail.stGbn === "010") return detail;
    if (
      detail.stGbn !== "020" &&
      !(detail.stGbn === "070" && detail.reserInstGbnYn === "Y")
    )
      throw new SchoolError("학교에서 신청 취소가 가능한 상태가 아닙니다.");
    await this.request(
      "saveInstUseAplyList",
      { ...detail, stGbn: "010" },
      "DS_INST731",
      "update",
    );
    return this.detail(id);
  }
}
