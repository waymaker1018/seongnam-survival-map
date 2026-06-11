# -*- coding: utf-8 -*-
"""새 채용 공고 알림 발송 — 텔레그램 봇 + 이메일(SMTP).

monitor_seongnam_school_sites.mjs가 만든 data/school_notice_new.json을 읽어
새 글이 있으면 텔레그램 메시지와 메일을 보낸다. 표준 라이브러리만 사용.
설정 우선순위:
  1) 환경변수 (GitHub Actions Secrets용): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
     SMTP_USER, SMTP_APP_PASSWORD, MAIL_TO
  2) config/notify_config.json (로컬 실행용, example 참고)
"""
import json
import os
import smtplib
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from email.mime.text import MIMEText
from pathlib import Path

# Windows 콘솔(cp949)에서 한글·특수문자 출력 깨짐/크래시 방지
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "notify_config.json"
NEW_PATH = ROOT / "data" / "school_notice_new.json"
TRAINING_PATH = ROOT / "data" / "training_new.json"
SEOUL_PATH = ROOT / "data" / "seoul_notice_new.json"
LOG_DIR = ROOT / "logs"

TELEGRAM_MAX = 4096  # 텔레그램 메시지 길이 제한


def log(message: str) -> None:
    LOG_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {message}"
    print(line)
    log_file = LOG_DIR / f"notify_{datetime.now():%Y%m}.log"
    with log_file.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def format_items_text(items: list) -> str:
    lines = []
    for item in items:
        posted = (item.get("postedAt") or "")[:10] or "날짜미상"
        deadline = (item.get("deadline") or "")[:10]
        deadline_text = f" · 마감 {deadline}" if deadline else ""
        lines.append(f"■ [{item.get('schoolName', '?')}] {item.get('title', '')}")
        lines.append(f"  {posted}{deadline_text} · {item.get('boardLabel', '')}")
        lines.append(f"  {item.get('url', '')}")
        lines.append("")
    return "\n".join(lines).strip()


def send_telegram(config: dict, items: list, total: int) -> bool:
    token = config.get("botToken", "").strip()
    chat_id = str(config.get("chatId", "")).strip()
    if not token or "여기에" in token or not chat_id:
        log("텔레그램 설정이 비어 있어 건너뜀 (config/notify_config.json 확인)")
        return False

    header = f"🔔 성남 초등학교 채용 새 공고 {total}건\n\n"
    body = header + format_items_text(items)
    if total > len(items):
        body += f"\n\n…외 {total - len(items)}건은 생존맵 앱에서 확인하세요."

    # 4096자 제한 — 넘으면 분할 발송
    chunks = []
    while body:
        chunks.append(body[:TELEGRAM_MAX])
        body = body[TELEGRAM_MAX:]

    ok = True
    for chunk in chunks:
        data = urllib.parse.urlencode({
            "chat_id": chat_id,
            "text": chunk,
            "disable_web_page_preview": "true",
        }).encode("utf-8")
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage", data=data
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.load(response)
                if not result.get("ok"):
                    log(f"텔레그램 응답 오류: {result}")
                    ok = False
        except Exception as error:  # noqa: BLE001
            log(f"텔레그램 발송 실패: {error}")
            ok = False
    if ok:
        log(f"텔레그램 발송 완료 ({len(chunks)}개 메시지)")
    return ok


def send_email(config: dict, items: list, total: int) -> bool:
    user = config.get("user", "").strip()
    password = config.get("appPassword", "").strip()
    to_addr = config.get("to", "").strip() or user
    if not user or "여기에" in user or not password:
        log("이메일 설정이 비어 있어 건너뜀 (config/notify_config.json 확인)")
        return False

    subject = f"[성남 채용알림] 새 공고 {total}건 — {datetime.now():%m월 %d일}"
    body = format_items_text(items)
    if total > len(items):
        body += f"\n\n…외 {total - len(items)}건은 생존맵 앱에서 확인하세요."
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = user
    message["To"] = to_addr

    host = config.get("smtpHost", "smtp.gmail.com")
    port = int(config.get("smtpPort", 465))
    try:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=30) as server:
            server.login(user, password)
            server.sendmail(user, [to_addr], message.as_string())
        log(f"메일 발송 완료 → {to_addr}")
        return True
    except Exception as error:  # noqa: BLE001
        log(f"메일 발송 실패: {error}")
        return False


def build_config():
    """환경변수가 있으면 우선 사용, 없으면 config 파일, 둘 다 없으면 None."""
    env_token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    env_user = os.environ.get("SMTP_USER", "").strip()
    if env_token or env_user:
        return {
            "telegram": {
                "enabled": bool(env_token),
                "botToken": env_token,
                "chatId": os.environ.get("TELEGRAM_CHAT_ID", "").strip(),
            },
            "email": {
                "enabled": bool(env_user),
                "smtpHost": os.environ.get("SMTP_HOST", "smtp.gmail.com"),
                "smtpPort": int(os.environ.get("SMTP_PORT", "465")),
                "user": env_user,
                "appPassword": os.environ.get("SMTP_APP_PASSWORD", "").strip(),
                "to": os.environ.get("MAIL_TO", "").strip(),
            },
        }
    if CONFIG_PATH.exists():
        return load_json(CONFIG_PATH)
    return None


def collect_items() -> list:
    """성남 학교 + 서울 교육지원청 + 양성교육 공고를 합쳐 반환."""
    items = []
    if NEW_PATH.exists():
        items.extend(load_json(NEW_PATH).get("items", []))
    # 서울 11개 교육지원청 구인 게시판 (형식 동일)
    if SEOUL_PATH.exists():
        items.extend(load_json(SEOUL_PATH).get("items", []))
    # 양성교육 항목은 형식이 달라서 알림용 공통 형식으로 변환
    if TRAINING_PATH.exists():
        for t in load_json(TRAINING_PATH).get("items", []):
            items.append({
                "schoolName": t.get("source", "양성교육"),
                "boardLabel": "양성교육·전국채용",
                "title": t.get("title", ""),
                "url": t.get("url", ""),
                "postedAt": t.get("postedAt"),
                "deadline": t.get("deadline"),
            })
    return items


def main() -> int:
    if not NEW_PATH.exists() and not TRAINING_PATH.exists():
        log("새 공고 파일 없음 — 먼저 monitor를 실행하세요")
        return 1

    items = collect_items()
    if not items:
        log("새 공고 없음 — 알림 생략")
        return 0

    config = build_config()
    if config is None:
        log("설정 없음 — config/notify_config.json 작성 또는 환경변수 설정 필요")
        return 1
    total = len(items)
    items = items[:25]  # 첫 실행 등 대량 발생 시 알림 폭주 방지

    sent_telegram = sent_email = False
    if config.get("telegram", {}).get("enabled", True):
        sent_telegram = send_telegram(config.get("telegram", {}), items, total)
    if config.get("email", {}).get("enabled", True):
        sent_email = send_email(config.get("email", {}), items, total)

    log(f"완료 — 새 공고 {total}건, 텔레그램={'성공' if sent_telegram else '실패/생략'}, 메일={'성공' if sent_email else '실패/생략'}")
    return 0 if (sent_telegram or sent_email) else 1


if __name__ == "__main__":
    sys.exit(main())
