# 생존앱 — 성남 초등학교 채용공고 알림

성남시 초등학교 74곳 + 성남교육지원청 구인게시판을 매일 자동 점검해서
늘봄·방과후·디지털튜터 새 공고를 텔레그램·메일로 알려주는 로컬 앱.

## 빠른 시작

```powershell
npm run serve     # 지도 앱 → http://localhost:4173
npm run daily     # 크롤링 + 알림 수동 실행
```

자동 실행은 작업 스케줄러 `성남채용알림_일일점검` (매일 09:00, 15:00)에 등록되어 있음.

**알림을 받으려면 `config/notify_config.json` 설정 필요** — 자세한 내용은 [production_plan.md](production_plan.md) 참고.
