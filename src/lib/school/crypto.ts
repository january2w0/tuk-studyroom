import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

function key() {
  const value = process.env.SCHOOL_SESSION_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error("SCHOOL_SESSION_KEY에 32바이트 Base64 키를 설정해주세요.");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32)
    throw new Error("학교 세션 암호화 키가 올바르지 않습니다.");
  return bytes;
}
export function schoolIdentity(username: string) {
  return createHmac("sha256", key())
    .update("identity:" + username)
    .digest("hex");
}
export function encryptSchoolState(value: unknown, userId: number) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("school-user:" + userId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptSchoolState<T>(value: string, userId: number): T {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body)
    throw new Error("학교 세션 암호문이 올바르지 않습니다.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from("school-user:" + userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
