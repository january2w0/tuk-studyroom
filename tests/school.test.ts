import { test } from "node:test";
import assert from "node:assert/strict";
import {
  datasetRequest,
  parseSchoolReply,
  SchoolError,
} from "../src/lib/school/xml";
import { createDecipheriv } from "node:crypto";
import { SchoolClient } from "../src/lib/school/client";
import {
  encryptSchoolState,
  decryptSchoolState,
  schoolIdentity,
} from "../src/lib/school/crypto";
import { parseCurlResponse } from "../src/lib/school/transport";

const reply = (datasets: Record<string, Record<string, string>[]>) =>
  datasetRequest({ ErrorCode: "0" }, datasets);
test("school transport accepts the observed malformed security header without losing cookies", async () => {
  const response = parseCurlResponse(
    Buffer.from(
      "HTTP/1.1 200 OK\r\nX-XSS-Protection: 1; mode=block\r\n X-Content-Type-Options: nosniff\r\nSet-Cookie: A=one; Path=/\r\nSet-Cookie: B=two; Path=/\r\nContent-Type: text/xml\r\n\r\n<Root/>",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<Root/>");
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.throws(() =>
    parseCurlResponse(
      Buffer.from("HTTP/1.1 200 OK\r\n Bad-Other: secret\r\n\r\n<Root/>"),
    ),
  );
});
test("Nexacro XML handles escaping, datasets and unauthenticated reply", () => {
  const xml = reply({
    DS_LOGINCONFIRM: [{ isLogin: "0", useLoginPage: "1" }],
    DS_SESSIONINFO: [{ msg: "fail" }],
    EXAMPLE: [{ purpose: "A & B <회의>", id: "001", notice: "필독&#32;내용&#10;다음" }],
  });
  const parsed = parseSchoolReply(xml);
  assert.equal(parsed.datasets.DS_LOGINCONFIRM[0].isLogin, "0");
  assert.equal(parsed.datasets.EXAMPLE[0].purpose, "A & B <회의>");
  assert.equal(parsed.datasets.EXAMPLE[0].id, "001");
  assert.equal(parsed.datasets.EXAMPLE[0].notice, "필독 내용\n다음");
  for (const invalid of [
    "<html>login</html>",
    '<!DOCTYPE Root [<!ENTITY secret SYSTEM "file:///secret">]><Root/>',
    datasetRequest({ ErrorCode: "-1" }),
    "<Root>",
  ])
    assert.throws(() => parseSchoolReply(invalid), SchoolError);
});
test("school session is encrypted, tamper checked and bound to user", () => {
  const before = process.env.SCHOOL_SESSION_KEY;
  process.env.SCHOOL_SESSION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const data = {
      password: "secret-test-password",
      cookies: ["session-private"],
    };
    const encrypted = encryptSchoolState(data, 10);
    assert(!encrypted.includes(data.password));
    assert.deepEqual(decryptSchoolState(encrypted, 10), data);
    assert.throws(() => decryptSchoolState(encrypted, 11));
    assert.throws(() => decryptSchoolState(encrypted.slice(0, -3) + "AAA", 10));
    assert.equal(schoolIdentity("student1").length, 64);
    assert.notEqual(schoolIdentity("student1"), schoolIdentity("student2"));
  } finally {
    if (before === undefined) delete process.env.SCHOOL_SESSION_KEY;
    else process.env.SCHOOL_SESSION_KEY = before;
  }
});
const portalPage = `<form id="loginForm"><input id="internalId"><input id="internalPw"></form><script>const keyHex="000102030405060708090a0b0c0d0e0f"; CryptoJS.mode.CBC; f.attr('action','./login_proc.jsp?returnurl=null');</script>`;
test("portal SSO encrypts credentials, keeps cookies isolated, and verifies the school session", async () => {
  const calls: { url: string; cookie: string; body: string }[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({url,cookie:new Headers(init?.headers).get("Cookie") || "",body:String(init?.body || "")});
    if (url === "https://portal.tukorea.ac.kr/user/login.face")
      return new Response(null,{status:302,headers:{location:"https://ksc.tukorea.ac.kr/sso/login_stand.jsp"}});
    if (url.includes("login_stand"))
      return new Response(portalPage,{headers:{"Set-Cookie":"SSO=preauth; Path=/; Secure; HttpOnly"}});
    if (url.includes("login_proc")) {
      assert.equal(new Headers(init?.headers).get("Cookie"),"SSO=preauth");
      const data = new URLSearchParams(String(init?.body));
      assert.equal(data.get("gubun"),"inter");
      for (const [field, expected] of [["internalId","test-student"],["internalPw","test-password"]]) {
        const bytes=Buffer.from(data.get(field)!,"base64url");
        const decipher=createDecipheriv("aes-128-cbc",Buffer.from("000102030405060708090a0b0c0d0e0f","hex"),bytes.subarray(0,16));
        const plain=Buffer.concat([decipher.update(bytes.subarray(16)),decipher.final()]).toString();
        assert(plain.startsWith(expected+"|"));
        assert(Math.abs(Date.now()-Number(plain.split("|")[1])) < 10000);
      }
      return new Response(null,{status:302,headers:{location:"https://portal.tukorea.ac.kr/portal/default/stu"}});
    }
    if (url.includes("/portal/default/stu"))
      return new Response(`<script>function unrelatedWebmail(){location.href='https://cloud.tukorea.ac.kr';}</script>`);
    if (url.includes("initPageWork"))
      return new Response(null,{status:302,headers:{location:"/nx/","Set-Cookie":"JSESSIONID=school-session; Path=/; Secure; HttpOnly"}});
    if (url.endsWith("/nx/")) return new Response("<html>School application</html>");
    if (url.includes("isLogin")) {
      assert.equal(new Headers(init?.headers).get("Cookie"),"JSESSIONID=school-session");
      return new Response(reply({DS_LOGINCONFIRM:[{isLogin:"1"}],DS_SESSIONINFO:[{msg:"success",userNm:"검증학생",persNo:"UNIT_STUDENT",userGbn:"01"}]}));
    }
    throw new Error("Unexpected test URL");
  };
  const client = new SchoolClient(undefined,fake);
  assert.equal((await client.login("test-student","test-password")).userNm,"검증학생");
  assert(calls.every(c=>!c.body.includes("test-password")));
  assert.equal(await client.jar.getCookieString("https://other.example/"),"");
  const restored=new SchoolClient(client.serialize(),fake);
  assert(await restored.check());
});
test("portal SSO rejects external credential redirects and additional authentication", async () => {
  let credentialPosts=0;
  const external: typeof fetch = async () => new Response(null,{status:302,headers:{location:"https://other.example/steal"}});
  await assert.rejects(()=>new SchoolClient(undefined,external).login("test","test"), (e:unknown)=>e instanceof SchoolError && e.code==="SSO_REQUIRED");
  const additional: typeof fetch = async (input,init) => {
    if (String(input).includes("/user/login.face")) return new Response(null,{status:302,headers:{location:"https://ksc.tukorea.ac.kr/sso/login_stand.jsp"}});
    if (init?.method === "POST") {credentialPosts++;return new Response(portalPage);}
    return new Response(portalPage);
  };
  await assert.rejects(()=>new SchoolClient(undefined,additional).login("test","test"), (e:unknown)=>e instanceof SchoolError && e.code==="AUTH_REQUIRED");
  assert.equal(credentialPosts,1);
  const redirect: typeof fetch = async ()=>new Response(null,{status:302,headers:{location:"https://other.example/"}});
  assert.equal(await new SchoolClient(undefined,redirect).check(), false);
});

test("session checks recognize expired authentication but preserve network failures", async () => {
  for (const status of [302, 401, 403]) {
    const client = new SchoolClient(undefined, async () => new Response(null, { status }));
    client.profile = { persNo: "STALE_PROFILE" };
    assert.equal(await client.check(), false);
    assert.deepEqual(client.profile, {});
  }
  const offline = new SchoolClient(undefined, async () => { throw new Error("offline"); });
  await assert.rejects(() => offline.check(), (error: unknown) =>
    error instanceof SchoolError && error.code === "NETWORK_ERROR");
  const unavailable = new SchoolClient(undefined, async () => new Response(null, { status: 503 }));
  await assert.rejects(() => unavailable.check(), (error: unknown) =>
    error instanceof SchoolError && error.code !== "AUTH_REQUIRED");
});
test("an existing portal SSO session restores school login without submitting credentials again", async () => {
  let posts=0;
  const fake:typeof fetch=async (input,init)=>{
    if(init?.method==='POST' && !String(input).includes('isLogin')) posts++;
    if(String(input).includes('/user/login.face')) return new Response(null,{status:302,headers:{location:'/portal/default/stu'}});
    if(String(input).includes('/portal/default/stu')) return new Response('<html>Student portal</html>');
    if(String(input).includes('initPageWork')) return new Response('<html>School initialized</html>');
    return new Response(reply({DS_LOGINCONFIRM:[{isLogin:'1'}],DS_SESSIONINFO:[{persNo:'UNIT_STUDENT',userGbn:'01'}]}));
  };
  assert.equal((await new SchoolClient(undefined,fake).login('test','test')).persNo,'UNIT_STUDENT');
  assert.equal(posts,0);
});
