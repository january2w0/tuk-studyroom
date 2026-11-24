import { readSheet } from "read-excel-file/node";
import writeXlsxFile, { type Row } from "write-excel-file/node";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { XMLParser } from "fast-xml-parser";
import { InputError } from "../validation";
import type { BookingInput } from "./meeting-api";

export const attendanceHeaders = ["학부(학과)", "학번", "이름", "날짜", "시간", "사용공간"];
export const attendanceFileLimit = 512 * 1024;
export const attendanceMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const attendanceRequiredMessage = "참석자 명단을 입력해주세요.";

export type AttendanceEntry = { department: string; studentId: string; name: string };

export function parseAttendanceEntries(value: unknown, count: number, { allowIncomplete = false } = {}): AttendanceEntry[] {
  if (!Array.isArray(value) || value.length > 99)
    throw new InputError("참석자 명단은 최대 99행까지 입력할 수 있습니다.");
  if (!allowIncomplete && value.length !== count)
    throw new InputError(`참석자 명단을 참여 인원(${count}명)에 맞춰 입력해주세요.`);
  const studentIds = new Set<string>();
  return value.map((entry: unknown, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new InputError(`${index + 1}번째 참석자의 학과, 학번, 이름을 입력해주세요.`);
    const fields = entry as Record<string, unknown>;
    if (typeof fields.department !== "string" || typeof fields.studentId !== "string" || typeof fields.name !== "string")
      throw new InputError(`${index + 1}번째 참석자의 학과, 학번, 이름을 확인해주세요.`);
    const department = fields.department.trim();
    const studentId = fields.studentId.trim();
    const name = fields.name.trim();
    if (department.length > 80 || studentId.length > 20 || name.length > 80)
      throw new InputError(`${index + 1}번째 참석자 정보의 길이를 확인해주세요.`);
    if (!allowIncomplete && (!department || !name || !/^\d+$/.test(studentId)))
      throw new InputError(`${index + 1}번째 참석자의 학과, 학번, 이름을 확인해주세요. 학번은 숫자로 입력해주세요.`);
    if (!allowIncomplete && studentIds.has(studentId))
      throw new InputError("참석자 명단에 같은 학번이 두 번 입력되었습니다.");
    studentIds.add(studentId);
    return { department, studentId, name };
  });
}

export async function writeAttendanceWorkbook(
  entries: AttendanceEntry[],
  date: string,
  start: string,
  end: string,
  room: string,
) {
  const header: Row = attendanceHeaders.map((value) => ({ value, fontWeight: "bold" }));
  const rows = entries.map(({ department, studentId, name }) =>
    [department, studentId, name, date, `${start}~${end}`, room].map((value) => ({ value })),
  );
  return writeXlsxFile([header, ...rows], {
    sheet: "sheet1",
    columns: [{ width: 22 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 20 }, { width: 24 }],
  }).toBuffer();
}

const sheetParser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true,
  processEntities: false, parseTagValue: false,
  isArray: (name) => name === "row" || name === "c",
});

function checkWorksheet(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unexpected worksheet declaration");
  type Cell = { "@r"?: string; f?: unknown };
  type Row = { "@r"?: string; c?: Cell[] };
  const rows: Row[] = sheetParser.parse(xml).worksheet?.sheetData?.row ?? [];
  if (rows.length > 500 || rows.some((row) =>
    Number(row["@r"] ?? 0) > 500 || (row.c ?? []).some((cell) =>
      Object.hasOwn(cell, "f") || !/^[A-Z][1-9]\d{0,2}$/.test(cell["@r"] ?? ""),
    ),
  )) throw new Error("Unsupported worksheet cells");
}

async function inspectSpreadsheet(bytes: Buffer) {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true }, (error, file) => {
      if (error) reject(error);
      else resolve(file);
    });
  });
  try {
    if (zip.entryCount > 80) throw new Error("Too many workbook entries");
    await new Promise<void>((resolve, reject) => {
      let size = 0;
      let sheetCount = 0;
      zip.on("error", reject);
      zip.on("end", () => {
        if (sheetCount === 1) resolve();
        else reject(new Error("Expected a single worksheet"));
      });
      zip.on("entry", (entry: Entry) => {
        size += entry.uncompressedSize;
        if (size > 4 * 1024 * 1024 || /(?:vbaProject|xl\/externalLinks\/)/i.test(entry.fileName)) {
          reject(new Error("Unsupported workbook content"));
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          let sheetXml = "";
          const isSheet = /^xl\/worksheets\/[^/]+\.xml$/.test(entry.fileName);
          if (isSheet) {
            sheetCount++;
            stream.setEncoding("utf8");
            stream.on("data", (chunk: string) => { sheetXml += chunk; });
          } else stream.resume();
          stream.on("error", reject);
          stream.on("end", () => {
            try {
              if (isSheet) checkWorksheet(sheetXml);
              zip.readEntry();
            } catch (error) {
              reject(error);
            }
          });
        });
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

export async function validateAttendanceFile(file: File, input: BookingInput, roomNumber: string) {
  if (!/\.xlsx$/i.test(file.name) || file.size === 0 || file.size > attendanceFileLimit) {
    throw new InputError("참석자 명단은 512KB 이하의 .xlsx 파일을 첨부해주세요.");
  }
  let rows;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await inspectSpreadsheet(bytes);
    rows = await readSheet(bytes);
  } catch {
    throw new InputError("참석자 명단을 읽을 수 없습니다. 양식을 다시 내려받아 작성해주세요.");
  }
  const [header = [], ...entries] = rows;
  if (header.length !== attendanceHeaders.length ||
      !attendanceHeaders.every((name, index) => header[index] === name)) {
    throw new InputError("참석자 명단의 열 이름과 순서를 양식에 맞춰주세요.");
  }
  let count = 0;
  const studentIds = new Set<string>();
  for (const row of entries) {
    if (row.every((cell) => cell === null)) continue;
    const [department, id, name, date, time, room] = row;
    if (typeof department !== "string" || !department.trim() ||
        (typeof id !== "string" && typeof id !== "number") || !/^\d+$/.test(String(id)) ||
        typeof name !== "string" || !name.trim()) {
      throw new InputError("참석자마다 학부(학과), 학번, 이름을 입력해주세요.");
    }
    const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).trim();
    const dateParts = /^\s*(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})[.]?$/.exec(day);
    const normalizedDate = dateParts?.slice(1).map((part) => part.padStart(2, "0")).join("-");
    const times = String(time).split(/[-–—~∼]/).map((part) => part.trim().padStart(5, "0"));
    const listedRoom = /\d{3}-\d+/.exec(String(room))?.[0];
    if (normalizedDate !== input.date || times.join("-") !== `${input.start}-${input.end}` ||
        listedRoom !== roomNumber) {
      throw new InputError("명단의 날짜, 시간, 사용공간을 신청 일정과 일치시켜주세요.");
    }
    if (studentIds.has(String(id))) throw new InputError("참석자 명단에 같은 학번이 두 번 입력되었습니다.");
    studentIds.add(String(id));
    count++;
  }
  if (count !== input.attendees) {
    throw new InputError(`명단의 참석자 수를 신청 인원(${input.attendees}명)에 맞춰주세요.`);
  }
}
