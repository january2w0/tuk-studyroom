import "server-only";
import { withSchoolAccount } from "./connection";
import { MeetingRoomApi, type Period } from "./meeting-api";
import { schoolRoomRequiresAttendanceFile, schoolRoomRestriction } from "./rooms";

export async function lookupSchoolRooms(userId: number, period: Period) {
  return withSchoolAccount(userId, async (client) => {
    const api = new MeetingRoomApi(client);
    const rooms = await api.rooms(period);
    const options = await api.options();
    return {
      rooms: rooms.map(({ row, area, number }) => ({
        code: row.reserInstBasiCd,
        name: row.reserInstNmV || row.reserInstNm,
        area,
        number,
        location: [row.strctrNm, number].filter(Boolean).join(" "),
        restriction: schoolRoomRestriction(row, area),
        attendanceFileRequired: schoolRoomRequiresAttendanceFile(row),
        capacity: row.acceptRcnt,
        notice: [row.atentCtntCtnt, row.addNotiCtnt].filter(Boolean).join("\n"),
        terms: row.useRgltn ?? "",
      })),
      options: {
        events: options.events.map((row) => ({ code: row.code, name: row.fullNm })),
        users: options.users.map((row) => ({ code: row.code, name: row.fullNm })),
        name: options.name,
        department: options.department,
      },
    };
  }, 3);
}

export type RoomLookup = Awaited<ReturnType<typeof lookupSchoolRooms>>;
