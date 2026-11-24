import { XMLParser, XMLValidator } from "fast-xml-parser";

export class SchoolError extends Error {
  constructor(
    message: string,
    public code = "SCHOOL_ERROR",
  ) {
    super(message);
  }
}
export type SchoolRow = Record<string, string>;
export type SchoolReply = {
  parameters: SchoolRow;
  datasets: Record<string, SchoolRow[]>;
};
export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
export function datasetRequest(
  parameters: SchoolRow = {},
  datasets: Record<string, SchoolRow[]> = {},
  rowTypes: Record<string, "insert" | "update" | "delete"> = {},
) {
  const params = Object.entries(parameters)
    .map(
      ([key, value]) =>
        `<Parameter id="${escapeXml(key)}">${escapeXml(value)}</Parameter>`,
    )
    .join("");
  const data = Object.entries(datasets)
    .map(([name, rows]) => {
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      return `<Dataset id="${escapeXml(name)}"><ColumnInfo>${columns.map((col) => `<Column id="${escapeXml(col)}" type="STRING" size="256"/>`).join("")}</ColumnInfo><Rows>${rows
        .map(
          (row) =>
            `<Row${rowTypes[name] ? ` type="${rowTypes[name]}"` : ""}>${Object.entries(
              row,
            )
              .map(
                ([col, value]) =>
                  `<Col id="${escapeXml(col)}">${escapeXml(value)}</Col>`,
              )
              .join("")}</Row>`,
        )
        .join("")}</Rows></Dataset>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Root xmlns="http://www.nexacro.com/platform/dataset"><Parameters>${params}</Parameters>${data}</Root>`;
}
export function parseSchoolReply(xml: string): SchoolReply {
  if (
    xml.length > 5_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new SchoolError("학교 응답 형식을 확인할 수 없습니다.");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false,
    trimValues: false,
    isArray: (tag) => ["Parameter", "Dataset", "Row", "Col"].includes(tag),
  });
  const root = parser.parse(xml).Root;
  if (!root || typeof root !== "object")
    throw new SchoolError("학교 응답을 확인할 수 없습니다.", "AUTH_REQUIRED");
  const parameters: SchoolRow = Object.create(null),
    datasets: Record<string, SchoolRow[]> = Object.create(null);
  // Nexacro's server leaves whitespace references escaped once inside XML text.
  const text = (node: Record<string, unknown>) => String(node["#text"] ?? "")
    .replace(/&#(9|10|13|32);/g, (_, code) => String.fromCharCode(Number(code)));
  for (const p of root.Parameters?.Parameter ?? [])
    if (typeof p["@id"] === "string") parameters[p["@id"]] = text(p);
  if (
    parameters.ErrorCode === undefined ||
    !/^\d+$/.test(parameters.ErrorCode) ||
    Number(parameters.ErrorCode) !== 0
  ) {
    if (parameters.ErrorCode === "-600")
      throw new SchoolError("학교 로그인이 만료되었습니다. 학교 계정으로 다시 연결해주세요.", "AUTH_REQUIRED");
    if (parameters.ErrorMsg?.includes("포털"))
      throw new SchoolError("학교 포털 인증이 필요합니다. 학교 계정으로 다시 연결해주세요.", "SSO_REQUIRED");
    const error = new SchoolError(
      "학교에서 요청을 처리하지 못했습니다.",
      /^-?\d{1,9}$/.test(parameters.ErrorCode ?? "")
        ? "SCHOOL_REPLY_" + parameters.ErrorCode
        : "SCHOOL_INVALID_REPLY",
    );
    throw error;
  }
  for (const dataset of root.Dataset ?? []) {
    if (typeof dataset["@id"] !== "string") continue;
    datasets[dataset["@id"]] = (dataset.Rows?.Row ?? []).map(
      (row: { Col?: Record<string, unknown>[] }) => {
        const data: SchoolRow = Object.create(null);
        for (const col of row.Col ?? [])
          if (typeof col["@id"] === "string") data[col["@id"]] = text(col);
        return data;
      },
    );
  }
  return { parameters, datasets };
}
