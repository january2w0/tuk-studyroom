# 학교 인증·예약 연동 설계

## 지원 범위

학교 로그인으로 사용자별 앱 계정을 만들고, 학교의 쿠키를 서버에서 사용자별로 암호화해 보관한다. 학생은 제2생활관 207호 미팅룸, 공학관 E동 113호 SW스터디룸, TIP 3층 312호 창업동아리회의실의 가용 시간을 조회하고 본인 신청을 관리한다. 앱 관리자는 임시 저장 기록과 공간 구역별 설정을 관리한다.

## 인증 연결 모델 (SQL 변경 전에 작성)

USERS 1 : 0..1 SCHOOL_CONNECTIONS. 학교 계정 식별자는 서버 키 기반 해시로 구분한다. 쿠키·학교 아이디·선택적으로 보관하는 재로그인 정보는 사용자 ID를 추가 인증 데이터로 사용하는 AES-256-GCM으로 암호화한다. 다른 사용자의 암호문을 복사해도 복호화되지 않아야 한다.

- school_connections: user_id(PK/FK), identity_hash(UNIQUE), encrypted_state, valid_until, updated_at.
- 학교 비밀번호는 기본적으로 저장하지 않는다. ‘학교 세션 만료 시 자동 로그인’ 선택을 사용자가 명시적으로 켠 경우에만 암호화해 보관한다.
- 앱 로그인 유지와 학교 세션 유효성을 구별한다. 학교의 유효 세션을 우선 사용하고 만료 시 동의된 자동 로그인은 한 번만 시도한다. 실패하면 재입력을 요구하고 무한 재시도하지 않는다.
- 서버가 요구하는 SSO·추가 인증·접근 제한을 우회하지 않는다.
- 사용자별 동시 학교 요청을 직렬화해 서로 다른 로그인 쿠키가 덮어써지는 것을 막는다.

## 공개 클라이언트에서 확인한 인증 규격

2026-10-28에 학교의 실제 공개 스크립트와 비로그인 응답으로 확인했다.

- 과거 [Login.xfdl.js](https://dream.tukorea.ac.kr/nx/contents/comm/frame/Login.xfdl.js)에 직접 로그인 API가 남아 있으나, 실제 응답은 ErrorCode=-1 및 ‘포털을 통해 접속’ 요구였다. 현재 구현은 이 API를 호출하지 않는다.
- [공식 포털 로그인](https://portal.tukorea.ac.kr/user/login.face) → ksc.tukorea.ac.kr의 login_stand.jsp → 공개 로그인 화면과 동일한 타임스탬프/AES-CBC 필드 처리로 login_proc.jsp → 포털 SSO → dream의 initPageWork.do?loginGbn=sso → isLogin 검증 순서다. 추가 인증을 요구하면 중단한다.
- HTTPS 호스트를 학교 포털·인증·통합정보시스템으로 제한한다. 학교 리다이렉트가 경유하는 옛 ksc.kpu.ac.kr은 GET만 허용하고 자격 증명은 현재 인증 호스트에만 제출한다. 원격 JavaScript는 실행하지 않는다.
- `/com/SsoCtr/isLogin.do`: DS_LOGINCONFIRM.isLogin이 1인지 검사. 비로그인 실제 응답은 isLogin=0, useLoginPage=1, DS_SESSIONINFO.msg=fail.
- [libComm.xjs.js](https://dream.tukorea.ac.kr/nx/lib/libComm.xjs.js): REQFOUNDATAION=nexacro 헤더, menuId/pgmId 쿼리, Nexacro Dataset XML 요청.

## 실제 예약 규격

[학교 예약 화면](https://dream.tukorea.ac.kr/nx/contents/adm/inst/nsrs/nsrs0020.xfdl.js)과 [신청창](https://dream.tukorea.ac.kr/nx/contents/adm/inst/nsrs/nsrs0020_pop01.xfdl.js)의 공개 소스에서 다음 요청 규격을 확인했다. 실계정에서 확인한 범위는 아래 검증 항목에 기록했다.

- 메뉴 정보: MenuCtr/findMenuOne.do의 MGH0950에서 실제 pgmId를 취득한다.
- 시설/가능 시간: NsrsCtr/findSpaceReserInstList.do, DS_COND → DS_INST711.
- 지원하는 공간의 공통 신청서에서 학과·학번·이름을 입력할 수 있다. 첨부가 필수인 공간은 명단을 바로 표시하고, 나머지 공간에서는 선택해 추가한다. 입력을 검증하고 일정과 공간을 채운 학교 양식(.xlsx)을 만들어 FileCtr/fileDefaultUpload.do로 업로드한다. 예약 최초 저장에 attachNo를 포함하고 학교 상세에서 같은 번호가 확인되면 최종 신청을 진행한다. 입력한 명단은 임시 저장과 신청 기록에 암호화해 보관하고 예약자가 재신청할 때 불러온다. etcAprtNm은 학교의 필요기자재 입력란이다.
- 본인 예약 목록/상세: NsrsCtr/findInstUseAplyList.do, DS_COND.aplytDstshNo/instUseAplyNo → DS_INST731.
- 최초 저장: saveInstUseAplyList.do, DS_INST731 insert, 상태 010 → DS_MAXNO.instUseAplyNo.
- 신청 전 검사: 학교 상세의 총액(totAmt)이 0인지 확인하고, findDualCheck.do의 DS_DUAL.dualYn/limitYn으로 중복·하루 이용 제한을 확인한다.
- 최종 신청: 같은 save 엔드포인트, DS_INST731 update, reqGbn=Y. 학교 상세의 reserInstGbnYn에 따라 020(신청) 또는 070(접수) 사용. 020을 승인 완료로 표시하지 않는다.
- 신청 취소: 본인 상세와 취소 가능 상태를 다시 확인한 뒤 stGbn=010으로 update, 다시 조회해 확인한다.

### 예약 요청 기록 모델 (SQL 변경 전에 작성)

USERS 1 : 0..N SCHOOL_REQUESTS. user_id, request_key(사용자별 UNIQUE), fingerprint, external_id, operation(create/cancel), status, created_at, updated_at을 저장한다. 예약의 개인 연락처·참가자 명단은 별도 복제 저장하지 않는다. 같은 키로 재전송하면 학교에 다시 신청하지 않고 기존 처리 결과를 반환한다. 전송 후 응답 미확인은 unknown으로 보존하고 학교 상세에서 재확인한다.

## 현재 검증과 운영 제약

2026-10-28 로그인된 공식 GUI에서 미팅룸 1~5(정원 2/4/4/6/6)와 신청기한 30일을 확인했다. 미팅룸-4의 안내는 학기 중 평일 09:30~17:00 / 방학 중 09:30~14:30, TIP223호 카드 키 수령, 음식물 섭취 금지다. 개인정보 안내는 필수 성명·학번·소속·연락처·사용기간, 목적 교내시설 이용신청 처리, 보유 3년이다.

학교 응답이 앞에 공백이 붙은 헤더를 보내므로 일반 요청은 cURL(시스템 PATH에 필요)로 처리한다. 명단 파일 업로드는 학교의 지정된 업로드 주소에서만 Node HTTPS의 완화된 헤더 파싱을 사용한다. 두 경로 모두 TLS 인증서 검증, 접속 호스트 제한, 타임아웃을 적용한다.

앱에서 실계정 SSO 로그인과 미팅룸 5개·행사/이용자 옵션·본인 내역을 실제 조회했다. 사용자 동의가 켜진 연결에서 로컬 학교 쿠키를 비운 경우 재로그인과 암호화 세션 저장이 성공했다. 학교 쿠키만 비우고 포털 SSO 쿠키를 유지한 경우도 복구·미팅룸 조회가 성공했다. 이는 제어된 만료 상태 검사이며 실제 30일 경과 시험은 아니다.

실제 예약 신청·취소는 사용자가 나중에 하겠다고 요청해 수행하지 않았다. 생성/취소 파이프라인은 테스트 응답으로 검증했다. 학교 공휴일/방학 달력을 자동 취득하는 API는 확인하지 못해 방학 운영시간은 원문으로 안내한다.
