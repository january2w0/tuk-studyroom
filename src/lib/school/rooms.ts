import type { SchoolRow } from "./xml";

export const roomAreas = {
  dorm: { label: "제2생활관", number: "207", minAttendees: 1 },
  pbl: { label: "제2생활관 PBL강의실", number: "208", minAttendees: 1 },
  engineering: { label: "공학관 E동", number: "113", minAttendees: 3 },
  tip: { label: "TIP 3층", number: "312", minAttendees: 1 },
};

export type RoomArea = keyof typeof roomAreas;

export function schoolRoom(
  row: SchoolRow,
): { area: RoomArea; number: string } | undefined {
  const building = row.strctrNm?.trim();
  const name = (row.reserInstNmV || row.reserInstNm || "")
    .trim()
    .replace(/\s*\([^)]*\)$/, "");
  const space = (row.eduSpaceNmV || row.eduSpaceNm || "").trim();
  const number = row.roomNo?.trim();

  if (building?.includes("제2생활관")) {
    if (/^PBL\s*강의실$/i.test(name) && (!number || /^208(?:호)?$/.test(number))) {
      return { area: "pbl", number: roomAreas.pbl.number };
    }
    if (/미팅룸|그룹활동실/.test(`${name} ${space}`)) {
      return { area: "dorm", number: number || space };
    }
  }

  if (building === "공학관 E동") {
    const room =
      number ||
      (/^113-[12]$/.test(space) ? space : name.replace(/^SW스터디룸-([12])$/, "113-$1"));
    if (/^113-[12]$/.test(room)) return { area: "engineering", number: room };
  }

  if (building === "기술혁신파크") {
    const room =
      number ||
      (/^312-[123]$/.test(space) ? space : name.replace(/^창업동아리회의실\s*([123])$/, "312-$1"));
    if (/^312-[123]$/.test(room)) return { area: "tip", number: room };
  }
}

export function schoolRoomRestriction(row: SchoolRow, area: RoomArea) {
  return area === "engineering" && row.deptChk !== "Y"
    ? "학교에서 AI융합대학 재학생 자격을 확인하지 못했습니다."
    : "";
}

export function schoolRoomRequiresAttendanceFile(row: SchoolRow) {
  // The SW study rooms share the school's facility-specific usage rules.
  return row.reserInstBasiCd === "196895" || row.reserInstBasiCd === "196894" ||
    [row.atentCtntCtnt, row.addNotiCtnt, row.useRgltn].some((notice) =>
      notice && /(?:참석자\s*작성|참석자\s*명단|참가자\s*명단)[^\r\n]*양식[^\r\n]*(?:첨부|업로드)/.test(notice),
    );
}
