import { spawn } from "node:child_process";
import { request as httpsRequest } from "node:https";

function quote(value: string) {
  if (value.includes("\0"))
    throw new Error("Unsupported NUL in school request");
  return (
    '"' +
    value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t") +
    '"'
  );
}

export function parseCurlResponse(raw: Buffer): Response {
  let offset = 0;
  for (let count = 0; count < 5; count++) {
    const end = raw.indexOf("\r\n\r\n", offset);
    if (end < 0) throw new Error("Missing school response headers");
    const lines = raw.subarray(offset, end).toString("utf8").split("\r\n");
    const match = /^HTTP\/1\.[01] (\d{3})/.exec(lines.shift() ?? "");
    if (!match) throw new Error("Invalid school response status");
    const status = Number(match[1]);
    offset = end + 4;
    if (status < 200) continue;
    const headers = new Headers();
    for (const line of lines) {
      // The school emits this one malformed security header; it is not used for XML data.
      if (/^ X-Content-Type-Options:/i.test(line)) continue;
      const colon = line.indexOf(":");
      const name = line.slice(0, colon);
      if (colon < 1 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
        throw new Error("Invalid school response header");
      headers.append(name, line.slice(colon + 1).trim());
    }
    // curl has already removed HTTP chunk framing. Return the bytes, never an HTML proxy page.
    headers.delete("transfer-encoding");
    headers.delete("content-length");
    return new Response(new Uint8Array(raw.subarray(offset)), {
      status,
      headers,
    });
  }
  throw new Error("Too many interim responses");
}

// curl's standard TLS verification remains enabled. No credentials appear in argv or files.
export const schoolFetch: typeof fetch = async (url, init) => {
  if (
    typeof url !== "string" ||
    !["https://dream.tukorea.ac.kr", "https://portal.tukorea.ac.kr", "https://ksc.tukorea.ac.kr", ...(init?.method === "GET" ? ["https://ksc.kpu.ac.kr"] : [])].includes(new URL(url).origin)
  )
    throw new Error("Invalid school origin");
  if (init?.body instanceof FormData) {
    if (new URL(url).origin !== "https://dream.tukorea.ac.kr" ||
        new URL(url).pathname !== "/com/FileCtr/fileDefaultUpload.do" || init.method !== "POST") {
      throw new Error("Invalid school upload endpoint");
    }
    const upload = new Request(url, { ...init, method: "POST" });
    const body = Buffer.from(await upload.arrayBuffer());
    return new Promise<Response>((resolve, reject) => {
      const request = httpsRequest(url, {
        method: "POST",
        // The school server sends a response header with leading whitespace.
        insecureHTTPParser: true,
        signal: init.signal ?? undefined,
        headers: { ...Object.fromEntries(upload.headers), "Content-Length": body.length },
      }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_000_000) response.destroy(new Error("School upload response too large"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const headers = new Headers();
          for (const name of ["set-cookie", "content-type"]) {
            const values = response.headers[name];
            for (const value of Array.isArray(values) ? values : values ? [values] : []) {
              headers.append(name, value);
            }
          }
          const status = response.statusCode ?? 502;
          const content = [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
          resolve(new Response(content, { status, headers }));
        });
      });
      request.on("error", reject);
      request.end(body);
    });
  }
  const config = [
    "silent",
    "show-error",
    "http1.1",
    "include",
    'proto = "=https"',
    "max-time = 20",
    "connect-timeout = 10",
    'request = ' + quote(init?.method === "GET" ? "GET" : "POST"),
    "url = " + quote(url),
    'header = "Expect:"',
    'header = "Accept-Encoding: identity"',
  ];
  new Headers(init?.headers).forEach((value, name) =>
    config.push("header = " + quote(name + ": " + value)),
  );
  if (init?.body !== undefined && init.body !== null)
    config.push("data-binary = " + quote(String(init.body)));
  return new Promise<Response>((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "curl.exe" : "curl",
      ["--disable", "--config", "-"],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        signal: init?.signal ?? undefined,
      },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 6_000_000) {
        child.kill();
        reject(new Error("School response too large"));
      } else chunks.push(chunk);
    });
    // Discard diagnostics: never log private response headers or request credentials.
    child.stderr.resume();
    child.on("error", () =>
      reject(new Error("School HTTPS transport unavailable")),
    );
    child.stdin.on("error", () =>
      reject(new Error("School request interrupted")),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("School HTTPS request failed"));
        return;
      }
      try {
        resolve(parseCurlResponse(Buffer.concat(chunks)));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(config.join("\n") + "\n");
  });
};
