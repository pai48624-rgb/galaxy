# -*- coding: utf-8 -*-
"""
로또 스틸의 법칙 - Flask 앱 진입점
====================================
templates/(home, generate, check, my, stats).html 이 기대하는 API를
db.py / algorithm.py / personalization.py 로 연결합니다.

로컬 실행: python lotto_app.py  (http://127.0.0.1:5050)
※ 기존 app.py(AI 성단 지도)와 포트가 겹치지 않도록 5050번을 사용합니다.
"""
import json
import re

from flask import Flask, jsonify, render_template, request

import algorithm
import db
import personalization

app = Flask(__name__)


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


# ---------------------------------------------------------------------------
# API: 번호 생성
# ---------------------------------------------------------------------------

@app.route("/api/generate")
def api_generate():
    mode = request.args.get("mode", "random")
    if mode == "random":
        numbers = algorithm.pure_random_pick()
    elif mode in ("hot", "overdue", "hybrid"):
        numbers, _ = algorithm.weighted_pick(mode)
    else:
        return jsonify({"error": "알 수 없는 생성 모드입니다."}), 400

    return jsonify({
        "numbers": numbers,
        "balls": to_balls(numbers),
        "strategy": STRATEGY_LABELS.get(mode, mode),
        "disclaimer": "모든 번호 조합의 당첨 확률은 수학적으로 동일합니다.",
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
# 동행복권 QR 인코딩 규격은 비공개라, 커뮤니티에 알려진 일반적인 패턴으로
# "최선의 추정" 파싱만 시도합니다. 실패해도 원본 텍스트를 그대로 돌려줘서
# 프론트엔드에서 사용자가 직접 수정할 수 있게 합니다.
# ---------------------------------------------------------------------------

def parse_dhlottery_qr(raw_text: str):
    draw_no = None
    m = re.search(r"v=(\d{3,4})", raw_text)
    if m:
        draw_no = int(m.group(1))

    tail = raw_text.split("v=", 1)[-1] if "v=" in raw_text else raw_text
    if draw_no is not None:
        tail = tail.replace(str(draw_no), "", 1)
    digits_only = re.sub(r"[^0-9]", "", tail)

    games = []
    for i in range(0, len(digits_only) - 11, 12):
        chunk = digits_only[i:i + 12]
        nums = [int(chunk[j:j + 2]) for j in range(0, 12, 2)]
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
