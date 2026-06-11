# 생존앱 — 성남 초등학교 채용공고 알림 시스템

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
  │     · 키워드 매칭: 늘봄·방과후·강사·디지털튜터·코딩·AI·SW 등 33종
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
