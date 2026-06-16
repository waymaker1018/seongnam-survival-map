# 생존앱 — 성남·서울 초등학교 채용공고 알림 시스템

> 작성: 2026-06-11 · 기반: C:\GPT\seongnam-after-school-map (Codex 구버전) 재활용

## 목표

성남시 모든 초등학교(74개교)의 채용 공고를 **매일 자동으로 점검**하고,
늘봄·방과후학교 강사·디지털튜터 관련 새 공고가 뜨면 **텔레그램과 메일로 즉시 알림**.
지도에서 **구 → 동 → 학교** 순서로 탐색하는 위치 기반 인터페이스 제공.

## 시스템 구성

```
[매일 09:00 / 15:00 — Windows 작업 스케줄러]
        │
        ▼
run_daily.cmd
  ├─ ① monitor_seongnam_school_sites.mjs
  │     · 74개 학교 홈페이지 게시판 스캔 (공지사항·채용·방과후·늘봄 등)
  │     · 성남교육지원청 구인 게시판 스캔 (초등 관련만 필터)
  │     · 분야 키워드 매칭: 늘봄·방과후·강사·디지털튜터·코딩·AI·SW 등 33종
  │     · ★ 채용 필터(isRecruitment): "채용/모집/공모/선발/외부강사/개인위탁" 신호어 필수
  │       + 비채용 제외("투명사회협약·정산·공개수업·만족도·수강신청·참관·수강생" 등)
  │       → 운영·안내성 공지 노이즈 제거 (예: 122건 → 채용 40건)
  │     · 중복 제거 + 이미 본 공고 제외 (school_notice_state.json)
  │     → data/school_notice_new.json (새 공고만)
  │
  └─ ② notify.py
        · 텔레그램 봇 발송 (최대 25건 + 요약)
        · Gmail SMTP 메일 발송
        → logs/notify_YYYYMM.log
```

## 지도 앱 실행

```powershell
cd C:\claude\projects\생존앱_성남채용알림_20260611
npm run serve        # → http://localhost:4173
```

- 초기 화면: 성남시 3개 구 마커 (학교 수 표시)
- 구 클릭 → 동별 마커 / 동 클릭 → 학교 마커 / 학교 클릭 → 상세 패널
- 상세 패널: 주소·전화·홈페이지·네이버/카카오맵 링크 + 최근 공고 + 모집 이력(2024~2026)
- 상단 검색창: 학교명/동 이름으로 바로 이동
- ⭐ 즐겨찾기: 상세 패널 "☆ 즐겨찾기" 버튼으로 학교 저장 → 상단 "⭐ 즐겨찾기" 섹션에 모아 보기(새 공고 있는 곳 우선·배지). 카드 클릭 시 해당 학교로 이동, 별 클릭 시 해제. `localStorage`(키 `survivalmap.favorites`)에 저장돼 새로고침·재방문에도 유지되며 성남·서울 공용. 지도 학교 마커에도 ★ 표시
- ⏰ 마감일 D-day: 모든 공고에 `D-3`·`D-day`·`마감` 배지(임박순 색상: D-3↓ 빨강·D-7↓ 주황·그 외 파랑·마감 회색). 공고 목록은 **마감 임박순 정렬**(유효 마감 → 마감일 없음 → 마감 지남 맨 뒤, 마감 지난 건 흐리게). app.js `ddayInfo()`/`ddayBadge()`/`compareByDeadline()`
- 🏷️ 공고 직무 필터: 하단 공고 섹션에 분류 칩(전체/디지털/돌봄·방과후/예술·체육/기타)+건수. 제목 키워드로 분류(`jobCategory()`, 디지털 우선 매칭). 코딩 강사는 "디지털" 칩으로 본인 분야만 추려보기

## 데이터 파일

| 파일 | 내용 | 갱신 |
|------|------|------|
| `data/schools.json` | 74개교 기본정보 + 좌표 + 동 | 수동 (연 1회 권장) |
| `data/geocode_cache.json` | 지오코딩 캐시 | 자동 |
| `data/recruitments.json` | 모집 이력 1,286건 (2024~2026) | `npm run fetch:data` |
| `data/school_notice_hits.json` | 최근 매칭 공고 전체 | 매일 자동 |
| `data/school_notice_new.json` | 직전 실행에서 새로 발견된 공고 | 매일 자동 |
| `data/school_notice_state.json` | 이미 알림 보낸 공고 ID | 매일 자동 |

## ⚙️ 남은 설정 (사용자 직접 — 약 10분)

### 1. 텔레그램 봇 만들기
1. 텔레그램에서 **@BotFather** 검색 → `/newbot` → 이름 입력 → **봇 토큰** 복사
2. 만든 봇과 대화 시작 (`/start` 한 번 보내기)
3. 브라우저에서 `https://api.telegram.org/bot<토큰>/getUpdates` 열기 → `"chat":{"id":123456789` 의 숫자가 **chatId**

### 2. Gmail 앱 비밀번호
1. Google 계정 → 보안 → **2단계 인증** 켜기
2. [앱 비밀번호](https://myaccount.google.com/apppasswords) 생성 → 16자리 복사

### 3. 설정 파일 작성
```powershell
cd C:\claude\projects\생존앱_성남채용알림_20260611\config
copy notify_config.example.json notify_config.json
notepad notify_config.json    # 토큰·chatId·메일주소·앱비밀번호 입력
```

### 4. 테스트
```powershell
cd C:\claude\projects\생존앱_성남채용알림_20260611
npm run daily    # 크롤링 + 알림 한 번에 실행
```

## 서울시 버전 (2026-06-12 추가)

- **웹**: `/seoul/` 경로 — 상단 성남↔서울 전환 버튼. 같은 app.js를 지역 설정(REGION_CONFIG)으로 재사용
- **학교 데이터** (`data/seoul_schools.json`): **578개교** (25개 구, 동 보유 574) — OSM Overpass(이름·좌표) + NEIS 개방포털 학교명 개별조회(주소·전화·홈페이지) + Nominatim 역지오코딩(동) 조합. 재구축: `node scripts/fetch_seoul_schools_v2.mjs` (캐시 이어가기 지원)
  - 서울 전체 초등학교는 약 600개 — OSM에 없는 20여 곳은 미수록. 보완하려면 빌드 캐시 삭제 후 재구축보다 누락 학교만 수동 추가 권장
- **구 경계선**: `data/boundaries_seongnam.json`(3구)·`boundaries_seoul.json`(25구) GeoJSON — 지도에 파란 경계 표시, 경계 클릭으로 구 진입
  - ⚠️ NEIS는 키 없이 **호출당 5행 제한** + `accept` 헤더 보내면 500 오류. 학교명 개별조회로 우회함
- **채용 크롤러** (`scripts/monitor_seoul_jobs.mjs`): 서울 11개 교육지원청 구인 게시판(`{청}.sen.go.kr/FUS/JO/JOL11.do`) — 기관명·학교급·분야·직종·마감일 구조화 표. 초등+키워드 필터, 마감 지난 공고 제외
  - 11개 청 코드: dbedu 동부 / sbedu 서부 / nbedu 남부 / bbedu 북부 / jbedu 중부 / gdspedu 강동송파 / gsycedu 강서양천 / gnscedu 강남서초 / dgedu 동작관악 / sdgjedu 성동광진 / sbgbedu 성북강북
  - 성남과 달리 학교 홈페이지 개별 크롤링은 하지 않음 — 서울은 지원청 게시판이 중앙화되어 있고, work.sen.go.kr(일자리포털)은 JS 앱이라 직접 크롤링 불가
- **알림**: notify.py가 성남+서울+양성교육을 합쳐 발송 (서울 건은 "서울 ○○ 구인" 라벨)

## 양성교육·전국 디지털튜터 모니터링 (2026-06-11 추가)

놓치면 안 되는 국가 무료 교육 2종을 별도 크롤러(`scripts/monitor_training_programs.mjs`)로 감시:

| 소스 | 내용 | 비고 |
|------|------|------|
| 디지털튜터 포털 채용 (dt.kosac.re.kr) | 전국 디지털튜터 채용 집계 | **경기·서울만 필터**, 접수기간 포함 |
| 디지털튜터 포털 공지 | 양성과정·사업 공고 | 교육부·창의재단 공식 |
| 교육부 공고 (moe.go.kr) 1~5페이지 | 디지털튜터 양성과정·AI 강사 양성·디지털새싹 키워드 | 해외 IP 간헐 차단 → 재시도 4회, 실패해도 다음 실행(하루 2회)에서 만회 |

- 결과: `data/training_hits.json` (전체) / `training_new.json` (신규) / `training_state.json` (중복방지)
- 알림(notify.py)과 웹 지도 하단 "양성교육 · 전국 디지털튜터" 섹션에 자동 포함
- 디지털새싹·창의재단 본사이트는 JS 앱이라 직접 크롤링 불가 — 교육부 공고가 해당 사업 공고를 커버

## 웹 배포 현황 (2026-06-11)

✅ **웹 주소: https://waymaker1018.github.io/seongnam-survival-map/** — 지인 공유용 (검색엔진 비노출)
- GitHub 저장소: https://github.com/waymaker1018/seongnam-survival-map (계정: waymaker1018, 공개)
- **GitHub Actions가 매일 KST 09:00·15:00 클라우드에서 크롤링** — 내 PC가 꺼져 있어도 지도 데이터 자동 갱신
- 클라우드 알림을 켜려면 저장소 Settings → Secrets에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (메일은 `SMTP_USER`, `SMTP_APP_PASSWORD`, `MAIL_TO`) 등록
- 지인들과 알림 공유: 텔레그램 그룹 만들고 봇 초대 → 그룹 chatId를 Secret에 등록
- 개인정보: 자택 주소(은행동 2246) 전 파일에서 제거 완료 후 공개함

## 자동 실행 현황 (로컬 — 보조)

✅ Windows 작업 스케줄러에 **`성남채용알림_일일점검`** 등록 완료 — 매일 **09:00, 15:00** 실행.
클라우드(GitHub Actions)가 주 채널이므로 로컬은 보조용. 클라우드 알림 설정 후에는 중복 방지를 위해 로컬 쪽 알림 설정(config/notify_config.json)은 비워두거나 작업을 해제할 것.

```powershell
Get-ScheduledTask -TaskName 성남채용알림_일일점검          # 상태 확인
Start-ScheduledTask -TaskName 성남채용알림_일일점검         # 즉시 실행
Unregister-ScheduledTask -TaskName 성남채용알림_일일점검    # 해제
```

## 유지보수 노트

- **2026-06 CMS 개편 대응**: 경기도교육청 통합홈페이지가 글 링크를 `selectNttInfo.do?nttSn=` 직접 링크에서 `<a data-id class="nttInfoBtn">` JS 방식으로 변경. 파서가 양쪽 모두 지원하므로 추후 또 바뀌면 `scripts/debug_board.mjs` 실행으로 마크업 진단.
- **구인게시판 날짜 컬럼**: 마감일 → 등록일 순서. 날짜 2개면 마지막이 등록일.
- **대원초등학교 좌표**: OSM에 없어 상대원동 중심 근사값 (`geoApprox: true`).
- 알림이 갑자기 끊기면: `logs/daily.log`와 `logs/notify_*.log` 확인.

## 1세대(Codex판) 대비 개선점

| 항목 | 구버전 (C:\GPT) | 현재 |
|------|---------------|------|
| 지도 | 추상 카드 그리드 | 실제 지도 (Leaflet+OSM), 구→동→학교 드릴다운 |
| 좌표/동 | 없음 | 74개교 전체 확보 |
| 알림 | 없음 (JSON 저장만) | 텔레그램 + 메일 |
| 자동화 | 수동 실행 | 작업 스케줄러 매일 2회 |
| 파서 | 2026-06 개편 후 작동 불능 (0건) | 신구 마크업 모두 지원 (156건 수집 확인) |
| 교육청 게시판 노이즈 | — | 유치원·중·고 공고 자동 제외 |
