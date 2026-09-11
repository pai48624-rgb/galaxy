# -*- coding: utf-8 -*-
"""
로또 스틸의 법칙 - Flask 앱 진입점
====================================
templates/(home, generate, check, my, stats, privacy, offline).html 이 기대하는
API를 db.py / algorithm.py / personalization.py 로 연결합니다.

정적 자산(로고·아이콘·core.js·자체 호스팅한 tailwind/chart.js/jsQR.js)은 배포된
운영 서버(211.233.221.181:8001)에서 그대로 받아와 static/ 아래 두었습니다.

로컬 실행: python lotto_app.py  (http://127.0.0.1:5050)
※ 기존 app.py(AI 성단 지도)와 포트가 겹치지 않도록 5050번을 사용합니다.
"""
import json
import os
import re
from datetime import datetime

from flask import Flask, jsonify, render_template, request, send_from_directory

import algorithm
import db
import personalization

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_START = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# 카카오 JS SDK 앱 키. 카카오 JS 키는 클라이언트 코드에 노출되는 것이 정상(공개) 키이므로
# 하드코딩된 기본값도 안전하지만, 운영자가 자기 키로 바꾸고 싶으면 환경변수로 덮어쓸 수 있다.
KAKAO_JS_KEY = os.environ.get("KAKAO_JS_KEY", "f6460fe0ba7c221d8cc30d2e7766a09e")
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "pai486@nate.com")
PRIVACY_UPDATED = os.environ.get("PRIVACY_UPDATED", "2026-09-10")


def static_v(path):
    """정적 자산 URL에 파일 수정시각(mtime) 쿼리를 붙여 캐시버스팅한다."""
    full_path = os.path.join(app.static_folder, path)
    try:
        v = int(os.path.getmtime(full_path))
    except OSError:
        v = 0
    return f"/static/{path}?v={v}"


app.jinja_env.globals["static_v"] = static_v


@app.context_processor
def inject_globals():
    return {
        "server_start": SERVER_START,
        "kakao_js_key": KAKAO_JS_KEY,
        "contact_email": CONTACT_EMAIL,
        "privacy_updated": PRIVACY_UPDATED,
    }


def to_balls(numbers):
    return [{"number": n, "color": algorithm.ball_color(n)} for n in numbers]


STRATEGY_LABELS = {
    "random": "완전 무작위",
    "hot": "자주 나온 번호 가중",
    "overdue": "오래 안나온 번호 가중",
    "hybrid": "하이브리드",
}


# ---------------------------------------------------------------------------
# 페이지
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template(
        "home.html",
        mbti_types=personalization.MBTI_TYPES,
        mbti_keyword=personalization.MBTI_KEYWORD,
        blood_types=personalization.BLOOD_TYPES,
        blood_keyword=personalization.BLOOD_KEYWORD,
    )


@app.route("/generate")
def generate_page():
    return render_template("generate.html")


@app.route("/check")
def check_page():
    return render_template("check.html")


@app.route("/my")
def my_page():
    return render_template("my.html")


@app.route("/stats")
def stats_page():
    return render_template("stats.html")


@app.route("/privacy")
def privacy_page():
    return render_template("privacy.html")


@app.route("/offline")
def offline_page():
    return render_template("offline.html")


@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory(BASE_DIR, "manifest.webmanifest", mimetype="application/manifest+json")


@app.route("/sw.js")
def service_worker():
    # 서비스워커는 제어 범위(scope)가 등록된 URL 경로 기준이라, /static/ 밑이 아니라
    # 루트(/sw.js)에서 서빙해야 사이트 전체를 제어할 수 있다.
    return send_from_directory(BASE_DIR, "sw.js", mimetype="application/javascript")


# ---------------------------------------------------------------------------
# API: 번호 생성
# ---------------------------------------------------------------------------

def _parse_number_list(param_name):
    """쉼표로 구분된 번호 목록 쿼리 파라미터를 파싱한다. 형식이 잘못되면 None."""
    raw = request.args.get(param_name, "")
    if not raw:
        return []
    try:
        return [int(x) for x in raw.split(",") if x.strip() != ""]
    except ValueError:
        return None


@app.route("/api/generate")
def api_generate():
    mode = request.args.get("mode", "random")
    if mode not in STRATEGY_LABELS:
        return jsonify({"error": "알 수 없는 생성 모드입니다."}), 400

    include = _parse_number_list("include")
    exclude = _parse_number_list("exclude")
    if include is None or exclude is None:
        return jsonify({"error": "포함/제외 번호는 숫자여야 합니다."}), 400
    if any(n < 1 or n > 45 for n in include + exclude):
        return jsonify({"error": "번호는 1~45 사이여야 합니다."}), 400
    if len(set(include)) != len(include):
        return jsonify({"error": "포함할 번호에 중복이 있습니다."}), 400
    if len(include) > 6:
        return jsonify({"error": "포함할 번호는 최대 6개까지만 지정할 수 있습니다."}), 400
    overlap = sorted(set(include) & set(exclude))
    if overlap:
        return jsonify({"error": f"포함과 제외에 같은 번호가 있습니다: {overlap}"}), 400
    available = 45 - len(set(exclude) - set(include))
    if available < 6:
        return jsonify({"error": "제외한 번호가 너무 많아서 6개를 채울 수 없습니다."}), 400

    numbers = algorithm.generate_numbers(mode, include=include, exclude=exclude)
    return jsonify({
        "numbers": numbers,
        "balls": to_balls(numbers),
        "strategy": STRATEGY_LABELS.get(mode, mode),
        "disclaimer": "모든 번호 조합의 당첨 확률은 수학적으로 동일합니다.",
        "balance": algorithm.calc_balance(numbers),
    })


@app.route("/api/generate/monthly")
def api_generate_monthly():
    sets = algorithm.monthly_prediction_set(5)
    return jsonify({"sets": [{"numbers": s, "balls": to_balls(s)} for s in sets]})


@app.route("/api/generate/personal")
def api_generate_personal():
    mbti = request.args.get("mbti", "")
    blood = request.args.get("blood", "")
    birth = request.args.get("birth", "")
    stat_mode = request.args.get("stat_mode", "hot")
    if not birth:
        return jsonify({"error": "생년월일을 입력해주세요."}), 400
    try:
        weight = float(request.args.get("weight", 0.6))
    except ValueError:
        weight = 0.6

    numbers = personalization.personalized_pick(
        mbti, blood, birth, personal_weight=weight, stat_mode=stat_mode
    )
    return jsonify({"numbers": numbers, "balls": to_balls(numbers)})


# ---------------------------------------------------------------------------
# API: 개인화 프로필 ("나의 행운번호" / "너의 행운을 빌릴게")
# ---------------------------------------------------------------------------

@app.route("/api/personal/profile")
def api_personal_profile():
    mbti = request.args.get("mbti", "")
    blood = request.args.get("blood", "")
    birth = request.args.get("birth", "")
    if not birth:
        return jsonify({"error": "생년월일을 입력해주세요."}), 400
    return jsonify(personalization.get_profile_numbers(mbti, blood, birth))


@app.route("/api/personal/borrow-phrase")
def api_borrow_phrase():
    nickname = request.args.get("nickname", "")
    return jsonify({"phrase": personalization.pick_borrow_phrase(nickname)})


# ---------------------------------------------------------------------------
# API: 당첨 회차 조회
# ---------------------------------------------------------------------------

def draw_to_json(row):
    numbers = [row[f"n{i}"] for i in range(1, 7)]
    return {
        "draw_no": row["draw_no"],
        "draw_date": row["draw_date"],
        "numbers": numbers,
        "balls": to_balls(numbers),
        "bonus": row["bonus"],
        "bonus_ball": {"number": row["bonus"], "color": algorithm.ball_color(row["bonus"])},
        "first_prize_amount": row["first_prize_amount"],
        "first_prize_count": row["first_prize_count"],
    }


@app.route("/api/draw/<int:draw_no>")
def api_draw(draw_no):
    row = db.get_draw(draw_no)
    if not row:
        return jsonify({"error": f"{draw_no}회차 데이터를 찾을 수 없습니다."}), 404
    return jsonify(draw_to_json(row))


@app.route("/api/latest")
def api_latest():
    row = db.get_latest_draw()
    if not row:
        return jsonify({"error": "저장된 당첨 데이터가 없습니다. 먼저 fetch_lotto.py --sync 를 실행해주세요."}), 404
    return jsonify(draw_to_json(row))


# ---------------------------------------------------------------------------
# API: 통계
# ---------------------------------------------------------------------------

@app.route("/api/stats")
def api_stats():
    freq = algorithm.get_frequency_table()
    hot, cold = algorithm.get_hot_cold_numbers(10)
    overdue = algorithm.get_overdue_numbers(10)

    return jsonify({
        "total_draws": db.count_draws(),
        "hot_numbers": [{"number": n, "count": c, "color": algorithm.ball_color(n)} for n, c in hot],
        "cold_numbers": [{"number": n, "count": c, "color": algorithm.ball_color(n)} for n, c in cold],
        "overdue_numbers": [{"number": n, "gap": g, "color": algorithm.ball_color(n)} for n, g in overdue],
        "frequency_all": [{"number": n, "count": freq[n]} for n in range(1, 46)],
    })


@app.route("/api/stats/pairs")
def api_stats_pairs():
    pairs = algorithm.get_top_pairs(15)
    for p in pairs:
        p["colors"] = [algorithm.ball_color(n) for n in p["pair"]]

    carryover = algorithm.get_carryover_stats(10)
    for item in carryover["top_carryover_numbers"]:
        item["color"] = algorithm.ball_color(item["number"])

    return jsonify({"top_pairs": pairs, "carryover": carryover})


# ---------------------------------------------------------------------------
# API: QR 스캔 파싱
# 동행복권 QR 인코딩 규격은 비공개라, 회차 4자리 + 게임당 12자리(번호 6개×2자리)
# 패턴으로 "최선의 추정" 파싱만 시도한다. 실패해도 원본 텍스트를 그대로 돌려줘서
# 프론트엔드에서 사용자가 직접 수정할 수 있게 한다.
# ⚠️ static/core.js의 parseQrText()와 반드시 같은 규칙을 유지해야 한다(현재 프론트
# 엔드 QR 처리는 서버 왕복 없이 core.js 쪽 결과로 즉시 판정하지만, 이 엔드포인트도
# 같은 파싱을 제공해 서버 쪽에서 검증/재사용할 수 있게 남겨둔다).
# ---------------------------------------------------------------------------

def parse_dhlottery_qr(raw_text: str):
    m = re.search(r"[?&]v=([0-9qQ]+)", raw_text, re.IGNORECASE)
    payload = m.group(1) if m else raw_text
    digits_and_q = re.sub(r"[^0-9qQ]", "", payload)
    parts = [p for p in re.split(r"[qQ]", digits_and_q) if p]

    if not parts:
        return {"raw_text": raw_text, "draw_no": None, "games": []}

    draw_no = None
    first = parts[0]
    if len(first) >= 4 and first[:4].isdigit():
        draw_no = int(first[:4])
        rest = first[4:]
        parts = ([rest] + parts[1:]) if rest else parts[1:]

    games = []
    for p in parts:
        if len(p) == 12 and p.isdigit():
            nums = [int(p[i:i + 2]) for i in range(0, 12, 2)]
            if all(1 <= n <= 45 for n in nums) and len(set(nums)) == 6:
                games.append(sorted(nums))
        if len(games) >= 5:
            break

    return {"raw_text": raw_text, "draw_no": draw_no, "games": games}


@app.route("/api/qr/parse", methods=["POST"])
def api_qr_parse():
    data = request.get_json(force=True, silent=True) or {}
    raw_text = data.get("raw_text", "")
    return jsonify(parse_dhlottery_qr(raw_text))


# ---------------------------------------------------------------------------
# API: 내 번호함
# ---------------------------------------------------------------------------

def is_valid_numbers(numbers):
    return (
        isinstance(numbers, list) and len(numbers) == 6
        and all(isinstance(n, int) for n in numbers)
        and len(set(numbers)) == 6
        and all(1 <= n <= 45 for n in numbers)
    )


@app.route("/api/saved", methods=["GET", "POST"])
def api_saved():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        numbers = data.get("numbers")
        if not is_valid_numbers(numbers):
            return jsonify({"error": "1~45 사이 중복 없는 6개 번호가 필요합니다."}), 400
        new_id = db.add_saved_number(
            numbers, memo=data.get("memo", ""), source=data.get("source", "manual")
        )
        return jsonify({"id": new_id})

    items = db.get_saved_numbers()
    for item in items:
        item["balls"] = to_balls(item["numbers"])
        if item["last_check_result"]:
            item["last_check_result"] = json.loads(item["last_check_result"])
    return jsonify({"items": items})


@app.route("/api/saved/<int:item_id>", methods=["DELETE"])
def api_saved_delete(item_id):
    if not db.delete_saved_number(item_id):
        return jsonify({"error": "해당 항목을 찾을 수 없습니다."}), 404
    return jsonify({"ok": True})


@app.route("/api/saved/<int:item_id>/check")
def api_saved_check(item_id):
    items = db.get_saved_numbers()
    item = next((i for i in items if i["id"] == item_id), None)
    if not item:
        return jsonify({"error": "해당 항목을 찾을 수 없습니다."}), 404

    draw_no_param = request.args.get("draw_no")
    draw_row = db.get_draw(int(draw_no_param)) if draw_no_param else db.get_latest_draw()
    if not draw_row:
        return jsonify({"error": "조회할 당첨 데이터가 없습니다."}), 404

    result = algorithm.calc_rank(item["numbers"], draw_row)
    result["draw_no"] = draw_row["draw_no"]
    db.update_saved_number_result(
        item_id, json.dumps(result, ensure_ascii=False), target_draw_no=draw_row["draw_no"]
    )
    return jsonify(result)


db.init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5050)
