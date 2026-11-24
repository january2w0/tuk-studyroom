import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, tokenHash } from "../src/lib/password";
import {
  assertSameOrigin,
  readJsonObject,
} from "../src/lib/validation";
import { parseDraftFilters } from "../src/lib/draft-search";
test("salted password hashes reject incorrect and malformed values", async () => {
  const hash = await hashPassword("local-test-password");
  assert.notEqual(hash, await hashPassword("local-test-password"));
  assert.equal(await verifyPassword("local-test-password", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("anything", "invalid"), false);
  assert.equal(tokenHash("session-token").length, 64);
});
test("JSON input must be a valid object", async () => {
  for (const body of ["null", "[]", "1", "{broken"]) {
    await assert.rejects(() =>
      readJsonObject(
        new Request("http://localhost:3100", { method: "POST", body }),
      ),
    );
  }
  assert.deepEqual(
    await readJsonObject(
      new Request("http://localhost:3100", {
        method: "POST",
        body: '{"id":1}',
      }),
    ),
    { id: 1 },
  );
});
test("search validates dates while keeping keywords as plain text", () => {
  assert.deepEqual(
    parseDraftFilters({ q: " 회의 ", date: "2026-10-28" }),
    { q: "회의", date: "2026-10-28" },
  );
  assert.equal(parseDraftFilters({ q: "%' OR 1=1 --" }).q, "%' OR 1=1 --");
  for (const params of [
    { date: "2026-02-30" },
    { date: "bad" },
    { q: "a".repeat(201) },
  ])
    assert.throws(() => parseDraftFilters(params));
});
test("mutations reject foreign and missing origins", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://localhost:3100/api/school/drafts", {
        headers: { origin: "http://localhost:3100" },
      }),
    ),
  );
  assert.throws(() =>
    assertSameOrigin(
      new Request("http://localhost:3100/api/school/drafts", {
        headers: { origin: "https://other.example" },
      }),
    ),
  );
  assert.throws(() =>
    assertSameOrigin(new Request("http://localhost:3100/api/school/drafts")),
  );
});
