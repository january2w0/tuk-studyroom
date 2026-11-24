import { SchoolClient } from "../src/lib/school/client";
async function main() {
  const authenticated = await new SchoolClient().check();
  if (authenticated)
    throw new Error(
      "새 쿠키 저장소에서 예상하지 않은 인증 상태가 반환되었습니다.",
    );
  console.log(
    "학교 실제 서버의 비로그인 XML 응답 확인 완료. 인증·예약 쓰기 요청은 수행하지 않았습니다.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
