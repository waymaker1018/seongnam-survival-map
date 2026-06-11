@echo off
rem 성남 채용공고 일일 점검 — 크롤링 후 새 공고 있으면 텔레그램·메일 알림
chcp 65001 > nul
cd /d "%~dp0"
echo [%date% %time%] 일일 점검 시작 >> logs\daily.log
node scripts\monitor_seongnam_school_sites.mjs --lookback-days=14 >> logs\daily.log 2>&1
python scripts\notify.py >> logs\daily.log 2>&1
echo [%date% %time%] 일일 점검 종료 >> logs\daily.log
