import { CookieJar, type SerializedCookieJar } from "tough-cookie";
import { load } from "cheerio";
import { schoolFetch } from "./transport";
import { loginPortal } from "./portal";
import {
  datasetRequest,
  parseSchoolReply,
  SchoolError,
  type SchoolRow,
} from "./xml";
export const SCHOOL_ORIGIN = "https://dream.tukorea.ac.kr";

function uploadReceipt(text: string) {
  const source = /^<(?:html|body|pre|textarea)\b|^<!doctype html/i.test(text)
    ? load(text)("body").text().trim()
    : text;
  if (!source.startsWith("SSV:")) {
    const reply = parseSchoolReply(source);
    return Object.values(reply.datasets).flat().find((row) => row.attachNo);
  }
  const rows = source.split("\x1e");
  if (!rows.includes("ErrorCode=0")) return;
  const columns = rows.findIndex((row) => row.startsWith("_RowType_\x1f"));
  if (columns === -1) return;
  const header = rows[columns].split("\x1f").map((field) => field.split(":")[0]);
  const values = rows[columns + 1]?.split("\x1f") ?? [];
  return {
    attachNo: values[header.indexOf("attachNo")],
    logicFileNm: values[header.indexOf("logicFileNm")],
  };
}

export class SchoolClient {
  profile: SchoolRow = {};
  readonly jar: CookieJar;
  constructor(
    saved?: SerializedCookieJar,
    private fetcher: typeof fetch = schoolFetch,
  ) {
    this.jar = saved ? CookieJar.deserializeSync(saved) : new CookieJar();
  }
  async request(
    path: string,
    parameters: SchoolRow = {},
    datasets: Record<string, SchoolRow[]> = {},
    rowTypes: Record<string, "insert" | "update" | "delete"> = {},
  ) {
    // Only source-verified, same-origin school endpoints may be called by this server.
    const allowed = new Set([
      "/com/SsoCtr/isLogin.do",
      "/uni/sreg/MastCtr/findStudInfoListPop.do",
      "/com/MenuCtr/findMenuOne.do",
      "/com/CodeCtr/findCodeComboList.do",
      ...[
        "findSpaceReserInstList",
        "findInstUseAplyList",
        "findDualCheck",
        "saveInstUseAplyList",
      ].map((name) => `/adm/inst/NsrsCtr/${name}.do`),
    ]);
    if (!allowed.has(path.split("?")[0]) || /[\r\n#]/.test(path))
      throw new SchoolError("지원하지 않는 학교 요청입니다.");
    const url = SCHOOL_ORIGIN + path;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
        headers: {
          "Content-Type": "text/xml; charset=UTF-8",
          REQFOUNDATAION: "nexacro",
          Origin: SCHOOL_ORIGIN,
          Referer: SCHOOL_ORIGIN + "/nx/",
          Cookie: await this.jar.getCookieString(url),
        },
        body: datasetRequest(
          { requestTimeStr: String(Date.now()), ...parameters },
          datasets,
          rowTypes,
        ),
      });
    } catch {
      throw new SchoolError(
        "학교 서버 응답을 확인하지 못했습니다.",
        "NETWORK_ERROR",
      );
    }
    for (const cookie of response.headers.getSetCookie())
      await this.jar.setCookie(cookie, url);
    if (
      (response.status >= 300 && response.status < 400) ||
      response.status === 401 ||
      response.status === 403
    )
      throw new SchoolError("학교 로그인이 필요합니다.", "AUTH_REQUIRED");
    if (!response.ok)
      throw new SchoolError("학교 서버가 요청을 처리하지 못했습니다.");
    return parseSchoolReply(await response.text());
  }
  async uploadAttendance(file: File, programId: string) {
    const params = new URLSearchParams({
      attachNo: "",
      tablNm: "ADM.inst731",
      menuId: "MGH0950",
      pgmId: programId,
      fileSize: "undefined",
      loginSrvYn: "1",
    });
    const url = `${SCHOOL_ORIGIN}/com/FileCtr/fileDefaultUpload.do?${params}`;
    const body = new FormData();
    body.append("upfile0", file);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
        headers: {
          Origin: SCHOOL_ORIGIN,
          Referer: SCHOOL_ORIGIN + "/nx/",
          Cookie: await this.jar.getCookieString(url),
        },
        body,
      });
      for (const cookie of response.headers.getSetCookie()) await this.jar.setCookie(cookie, url);
      if ((response.status >= 300 && response.status < 400) || response.status === 401 || response.status === 403) {
        throw new SchoolError("학교 로그인이 필요합니다.", "AUTH_REQUIRED");
      }
      if (!response.ok) throw new Error("Invalid upload response status");
      const receipt = uploadReceipt((await response.text()).trim());
      if (!receipt?.attachNo || !/^[\w-]{1,80}$/.test(receipt.attachNo)) {
        throw new Error("Missing upload receipt");
      }
      return { attachNo: receipt.attachNo, attachNm: receipt.logicFileNm || file.name };
    } catch (error) {
      if (error instanceof SchoolError && error.code === "AUTH_REQUIRED") throw error;
      throw new SchoolError("학교에 참석자 명단을 첨부하지 못했습니다.", "ATTENDANCE_UPLOAD");
    }
  }
  async check() {
    this.profile = {};
    try {
      const result = await this.request(
        "/com/SsoCtr/isLogin.do?menuId=kpu&pgmId=kpu",
      );
      this.profile = result.datasets.DS_SESSIONINFO?.[0] ?? {};
      return result.datasets.DS_LOGINCONFIRM?.[0]?.isLogin === "1";
    } catch (error) {
      // Expired sessions may redirect instead of returning DS_LOGINCONFIRM=0.
      if (error instanceof SchoolError && error.code === "AUTH_REQUIRED") return false;
      throw error;
    }
  }
  async login(username: string, password: string) {
    try {
      await loginPortal(this.jar, this.fetcher, username, password);
    } catch (error) {
      if (error instanceof SchoolError) throw error;
      throw new SchoolError("학교 포털 응답을 확인하지 못했습니다.", "NETWORK_ERROR");
    }
    if (!(await this.check()))
      throw new SchoolError(
        "학교 로그인 세션을 확인하지 못했습니다.",
        "AUTH_REQUIRED",
      );
    if (this.profile.firstLoginYn === "0")
      throw new SchoolError("학교 사이트에서 최초 로그인 설정을 완료한 뒤 다시 연결해주세요.", "AUTH_REQUIRED");
    return this.profile;
  }
  serialize() {
    const saved = this.jar.serializeSync();
    if (!saved) throw new SchoolError("학교 세션을 보관하지 못했습니다.");
    return saved;
  }
}
