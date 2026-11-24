export class InputError extends Error {}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InputError("올바른 JSON 객체를 보내주세요.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new InputError("올바른 JSON 객체를 보내주세요.");
  return body as Record<string, unknown>;
}

export function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function assertSameOrigin(request: Request) {
  const allowed = process.env.APP_ORIGIN
    ? [new URL(process.env.APP_ORIGIN).origin]
    : ["http://localhost:3100", "http://127.0.0.1:3100"];
  if (!allowed.includes(request.headers.get("origin") ?? ""))
    throw new InputError("허용되지 않은 요청입니다.");
}
