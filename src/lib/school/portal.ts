import { createCipheriv, randomBytes } from "node:crypto";
import { load } from "cheerio";
import type { CookieJar } from "tough-cookie";
import { SchoolError } from "./xml";

const origins = new Set([
  "https://portal.tukorea.ac.kr",
  "https://ksc.tukorea.ac.kr",
  "https://ksc.kpu.ac.kr",
  "https://dream.tukorea.ac.kr",
]);
function trustedUrl(value: string, base: string) {
  const url = new URL(value, base);
  if (!origins.has(url.origin) || url.username || url.password) {
    const error = new SchoolError("학교 인증 연결 주소를 확인하지 못했습니다.", "SSO_REQUIRED");
    throw error;
  }
  return url.href;
}

export function encryptPortalField(value: string, timestamp: number, keyHex: string, iv = randomBytes(16)) {
  if (!/^[a-f0-9]{32}$/i.test(keyHex) || iv.length !== 16)
    throw new SchoolError("학교 로그인 암호화 형식이 변경되었습니다.", "SSO_REQUIRED");
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(keyHex, "hex"), iv);
  return Buffer.concat([iv, cipher.update(value + "|" + timestamp, "utf8"), cipher.final()]).toString("base64url");
}

// Follow only the school's normal redirects and explicitly submitted HTML forms; never execute remote JS.
export async function loginPortal(jar: CookieJar, fetcher: typeof fetch, username: string, password: string) {
  async function navigate(initial: string, initialBody?: URLSearchParams, referer?: string) {
    let url = trustedUrl(initial, initial), body = initialBody;
    for (let hop = 0; hop < 15; hop++) {
      if (body && new URL(url).origin === "https://ksc.kpu.ac.kr")
        throw new SchoolError("학교의 현재 인증 도메인으로 연결하지 못했습니다.", "SSO_REQUIRED");
      const response = await fetcher(url, {
        method: body ? "POST" : "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
        headers: {
          Cookie: await jar.getCookieString(url),
          ...(referer ? { Referer: referer } : {}),
          ...(body ? { Origin: new URL(url).origin, "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        ...(body ? { body: body.toString() } : {}),
      });
      for (const cookie of response.headers.getSetCookie()) await jar.setCookie(cookie, url);
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const next = trustedUrl(location, url);
        if ([307, 308].includes(response.status) && body && new URL(next).origin !== new URL(url).origin)
          throw new SchoolError("학교 인증에서 추가 확인이 필요합니다.", "SSO_REQUIRED");
        if (![307, 308].includes(response.status)) body = undefined;
        referer = url; url = next; continue;
      }
      if (!response.ok) throw new SchoolError("학교 포털에 연결하지 못했습니다.", "PORTAL_HTTP_ERROR");
      const html = await response.text();
      if (html.length > 5_000_000) throw new SchoolError("학교 인증 응답 크기를 확인해주세요.");
      const $ = load(html);
      if (new URL(url).origin === "https://portal.tukorea.ac.kr" && new URL(url).pathname.startsWith("/portal/"))
        return { url, html };
      const scripts = $("script:not([src])").map((_, el) => $(el).text()).get().join("\n");
      // The login page contains unrelated handlers; stop before interpreting any of them.
      if ($("#internalId").length && $("#internalPw").length) return { url, html };
      const forms = $("form").toArray();
      const autoForm = forms.find((el) => {
        const id = $(el).attr("id"), name = $(el).attr("name");
        return [id, name].filter(Boolean).some((v) => scripts.includes(v + ".submit(") || scripts.includes(`getElementById("${v}").submit(`) || scripts.includes(`getElementById('${v}').submit(`)) ||
          (forms.length === 1 && /document\.forms\s*\[\s*0\s*\]\.submit\s*\(/.test(scripts));
      });
      if (autoForm) {
        const form = $(autoForm), next = trustedUrl(form.attr("action") || url, url);
        const values = new URLSearchParams();
        form.find("input[name]").each((_, el) => {
          if (($(el).attr("type") || "").toLowerCase() !== "hidden")
            throw new SchoolError("학교에서 추가 인증을 요구합니다.", "SSO_REQUIRED");
          values.append($(el).attr("name")!, $(el).attr("value") || "");
        });
        if ((form.attr("method") || "get").toLowerCase() !== "post")
          throw new SchoolError("학교 인증 전달 형식이 변경되었습니다.", "SSO_REQUIRED");
        referer = url; url = next; body = values; continue;
      }
      const redirect = /(?:location\.href\s*=\s*|location\.replace\s*\(\s*)['"]([^'"\r\n]+)['"]/.exec(scripts);
      if (redirect) { referer = url; url = trustedUrl(redirect[1], url); body = undefined; continue; }
      return { url, html };
    }
    throw new SchoolError("학교 인증 연결이 반복되어 중단했습니다.", "SSO_REQUIRED");
  }

  const page = await navigate("https://portal.tukorea.ac.kr/user/login.face");
  if (new URL(page.url).origin === "https://portal.tukorea.ac.kr" && new URL(page.url).pathname.startsWith("/portal/")) {
    await navigate("https://dream.tukorea.ac.kr/com/SsoCtr/initPageWork.do?loginGbn=sso");
    return;
  }
  const $ = load(page.html);
  const script = $("script:not([src])").map((_, el) => $(el).text()).get().join("\n");
  const key = /const\s+keyHex\s*=\s*["']([a-f0-9]{32})["']/i.exec(script)?.[1];
  const action = /f\.attr\(\s*['"]action['"]\s*,\s*['"](\.\/login_proc\.jsp\?returnurl=null)['"]/.exec(script)?.[1];
  if (!key || !action || new URL(page.url).origin !== "https://ksc.tukorea.ac.kr" || !script.includes("CryptoJS.mode.CBC") || !$("#internalId").length)
    throw new SchoolError("학교 포털 로그인 형식을 확인하지 못했습니다.", "SSO_REQUIRED");
  const timestamp = Date.now();
  const form = new URLSearchParams({
    internalId: encryptPortalField(username, timestamp, key),
    internalPw: encryptPortalField(password, timestamp, key),
    externalId: "", externalPw: "", gubun: "inter",
  });
  const result = await navigate(trustedUrl(action, page.url), form, page.url);
  if (load(result.html)("#internalId").length)
    throw new SchoolError("학교 포털 로그인에 실패했습니다. 계정 상태 또는 추가 인증 안내를 확인해주세요.", "AUTH_REQUIRED");
  await navigate("https://dream.tukorea.ac.kr/com/SsoCtr/initPageWork.do?loginGbn=sso");
}
