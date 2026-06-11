# Windows 작업 스케줄러에 일일 점검 작업 등록
# 사용: PowerShell 관리자 권한에서  .\register_task.ps1  실행
# 기본: 매일 오전 9시 + 오후 3시 (학교 공고는 보통 업무시간에 게시됨)
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute "$projectDir\run_daily.cmd" -WorkingDirectory $projectDir
$triggerMorning = New-ScheduledTaskTrigger -Daily -At 9am
$triggerAfternoon = New-ScheduledTaskTrigger -Daily -At 3pm
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "성남채용알림_일일점검" `
  -Action $action -Trigger $triggerMorning, $triggerAfternoon -Settings $settings -Force
Write-Output "등록 완료 — 매일 09:00, 15:00에 자동 실행됩니다."
Write-Output "확인: Get-ScheduledTask -TaskName 성남채용알림_일일점검"
