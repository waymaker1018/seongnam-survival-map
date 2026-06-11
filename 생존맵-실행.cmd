@echo off
rem 더블클릭하면 서버를 켜고 브라우저로 생존맵을 엽니다.
rem 최소화된 검은 창(서버)을 닫으면 앱도 꺼집니다.
chcp 65001 > nul
cd /d "%~dp0"
start "성남 생존맵 서버" /min node scripts\serve.mjs
timeout /t 2 /nobreak > nul
start "" http://localhost:4173
