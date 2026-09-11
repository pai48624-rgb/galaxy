# -*- coding: utf-8 -*-
"""
통계 분석 & 번호 생성 알고리즘
================================
※ 중요: 로또는 매 회차 완전 독립적인 무작위 추첨입니다(1~45 중 6개, 확률 1/8,145,060).
   과거 출현 빈도나 미출현 기간은 다음 회차의 당첨 확률에 수학적으로 아무 영향을 주지 않습니다.
   아래 "가중치 알고리즘"은 어디까지나 통계적 흥미/참고용 기능이며,
   실제 당첨 확률을 높여주지 않는다는 점을 UI에도 명시합니다.
"""
import random
from collections import Counter
from itertools import combinations
import db

# 공개 서비스에서 예측 가능성을 낮추기 위해 OS 수준 CSPRNG 기반 난수 생성기 사용
_rng = random.SystemRandom()

NUM_MIN, NUM_MAX = 1, 45


def ball_color(n: int) -> str:
    """공식 로또 공 색상 규칙"""
    if n <= 10:
        return "yellow"
    elif n <= 20:
        return "blue"
    elif n <= 30:
        return "red"
    elif n <= 40:
        return "gray"
    else:
        return "green"


def pure_random_pick():
    """완전 무작위 6개 번호 (기본 생성기)"""
    return sorted(_rng.sample(range(NUM_MIN, NUM_MAX + 1), 6))


def get_frequency_table():
    """
    전체 회차 기준 1~45 각 번호의 출현 횟수를 계산합니다.
    반환: {번호: 출현횟수} 딕셔너리 (1~45 전부 포함, 없으면 0)
    """
    rows = db.get_all_draws()
    counter = Counter()
    for r in rows:
        for i in range(1, 7):
            counter[r[f"n{i}"]] += 1
        # 보너스 번호는 별도 집계하고 싶다면 여기에 추가 가능

    return {n: counter.get(n, 0) for n in range(NUM_MIN, NUM_MAX + 1)}


def get_gap_table():
    """
    각 번호가 '마지막으로 나온 이후 몇 회차가 지났는지'(미출현 기간)를 계산합니다.
    값이 클수록 오랫동안 안 나온 번호("미출현/장기 미출현" 번호)입니다.
    """
    rows = db.get_all_draws()
    if not rows:
        return {n: 0 for n in range(NUM_MIN, NUM_MAX + 1)}

    last_seen = {n: None for n in range(NUM_MIN, NUM_MAX + 1)}
    for r in rows:  # 오래된 회차 -> 최신 회차 순
        for i in range(1, 7):
            last_seen[r[f"n{i}"]] = r["draw_no"]

    latest_no = rows[-1]["draw_no"]
    gap = {}
    for n in range(NUM_MIN, NUM_MAX + 1):
        if last_seen[n] is None:
            gap[n] = latest_no  # 한 번도 안 나온 경우
        else:
            gap[n] = latest_no - last_seen[n]
    return gap


def get_hot_cold_numbers(top_n: int = 10):
    freq = get_frequency_table()
    sorted_by_freq = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    hot = sorted_by_freq[:top_n]           # 가장 많이 나온 번호
    cold = sorted_by_freq[-top_n:][::-1]   # 가장 적게 나온 번호 (적은 순)
    return hot, cold


def get_overdue_numbers(top_n: int = 10):
    gap = get_gap_table()
    sorted_by_gap = sorted(gap.items(), key=lambda x: x[1], reverse=True)
    return sorted_by_gap[:top_n]


def normalize(d: dict) -> dict:
    """딕셔너리 값들을 0~1 사이로 정규화합니다."""
    max_v = max(d.values()) or 1
    return {k: (v / max_v) for k, v in d.items()}


def sample_unique_weighted(weights: dict, k: int = 6):
    """
    가중치 딕셔너리 {번호: 가중치} 를 받아 중복 없이 k개를 가중 추첨합니다.
    모든 가중치가 0이 되지 않도록 최소값 0.01을 보장한 뒤 사용해야 합니다.
    """
    numbers = list(weights.keys())
    probs = [max(w, 0.01) for w in weights.values()]
    picked = set()
    while len(picked) < k:
        choice = _rng.choices(numbers, weights=probs, k=1)[0]
        picked.add(choice)
    return sorted(picked)


def weighted_pick(strategy: str = "hybrid"):
    """
    통계 기반 가중치 추첨 (참고/재미용).
    strategy:
      - "hot"     : 자주 나온 번호에 더 높은 가중치
      - "overdue" : 오래 안 나온 번호에 더 높은 가중치
      - "hybrid"  : 두 지표를 절반씩 섞어서 가중치 산정 (기본값)
    DB에 데이터가 없으면 완전 무작위로 대체됩니다.
    """
    freq = get_frequency_table()
    gap = get_gap_table()

    if sum(freq.values()) == 0:
        return pure_random_pick(), "hybrid(데이터 없음 → 완전 무작위로 대체됨)"

    def normalize(d):
        max_v = max(d.values()) or 1
        return {k: (v / max_v) for k, v in d.items()}

    freq_n = normalize(freq)
    gap_n = normalize(gap)

    weights = {}
    for n in range(NUM_MIN, NUM_MAX + 1):
        if strategy == "hot":
            w = freq_n[n]
        elif strategy == "overdue":
            w = gap_n[n]
        else:  # hybrid
            w = 0.5 * freq_n[n] + 0.5 * gap_n[n]
        weights[n] = max(w, 0.01)  # 완전히 0이 되지 않도록 최소값 부여

    numbers = list(weights.keys())
    probs = list(weights.values())

    picked = set()
    # 중복 없이 6개가 뽑힐 때까지 가중 추첨 반복
    while len(picked) < 6:
        choice = _rng.choices(numbers, weights=probs, k=1)[0]
        picked.add(choice)

    return sorted(picked), strategy


def monthly_prediction_set(num_sets: int = 5):
    """
    '한 달 내 예측 번호' 후보 세트를 여러 개 생성합니다.
    실제로는 hybrid 가중치 알고리즘을 매번 새로 돌려 서로 다른 조합 5세트를 만드는 것으로,
    확률을 올려주는 것이 아니라 통계적으로 관심도가 높은 번호들을 조합해 보여주는 기능입니다.
    """
    results = []
    seen = set()
    attempts = 0
    while len(results) < num_sets and attempts < num_sets * 20:
        nums, _ = weighted_pick("hybrid")
        key = tuple(nums)
        if key not in seen:
            seen.add(key)
            results.append(nums)
        attempts += 1
    return results


# ---------------------------------------------------------------------------
# 궁합수(동시출현 번호 쌍) & 이월수 분석
# ---------------------------------------------------------------------------

def get_top_pairs(top_n: int = 15):
    """
    역대 회차에서 두 번호가 함께 나온 횟수(동시출현 빈도, 이른바 '궁합수')를 계산합니다.
    """
    rows = db.get_all_draws()
    counter = Counter()
    for r in rows:
        nums = sorted(r[f"n{i}"] for i in range(1, 7))
        for a, b in combinations(nums, 2):
            counter[(a, b)] += 1

    top = counter.most_common(top_n)
    return [{"pair": [a, b], "count": c} for (a, b), c in top]


def get_carryover_stats(top_n: int = 10):
    """
    이월수 분석: 직전 회차에 나온 번호가 바로 다음 회차에도 다시 나오는 현상을 집계합니다.
    (회차별로 평균 몇 개의 번호가 '이월'되는지, 어떤 번호가 이월이 잦은지)
    """
    rows = db.get_all_draws()  # draw_no 오름차순
    per_number_carry = Counter()
    total_carry = 0
    compared = 0

    for i in range(1, len(rows)):
        prev_nums = {rows[i - 1][f"n{j}"] for j in range(1, 7)}
        cur_nums = {rows[i][f"n{j}"] for j in range(1, 7)}
        overlap = prev_nums & cur_nums
        total_carry += len(overlap)
        compared += 1
        for n in overlap:
            per_number_carry[n] += 1

    avg_carry = round(total_carry / compared, 2) if compared else 0
    top_carry = per_number_carry.most_common(top_n)

    return {
        "avg_carryover_per_draw": avg_carry,
        "compared_draw_pairs": compared,
        "top_carryover_numbers": [{"number": n, "count": c} for n, c in top_carry],
    }


# ---------------------------------------------------------------------------
# 당첨 등수 계산 (QR 스캔 / 내 번호함 당첨확인에서 사용)
# ---------------------------------------------------------------------------

RANK_LABELS = {
    1: "1등", 2: "2등", 3: "3등", 4: "4등", 5: "5등", 0: "낙첨",
}


def calc_rank(user_numbers: list, draw_row: dict):
    """
    사용자가 고른 6개 번호와 특정 회차 당첨결과를 비교해 등수를 계산합니다.
    1등: 6개 일치 / 2등: 5개+보너스 일치 / 3등: 5개 일치
    4등: 4개 일치 / 5등: 3개 일치 / 그 외: 낙첨
    """
    winning = {draw_row[f"n{i}"] for i in range(1, 7)}
    bonus = draw_row["bonus"]
    user_set = set(user_numbers)
    match = len(user_set & winning)

    if match == 6:
        rank = 1
    elif match == 5 and bonus in user_set:
        rank = 2
    elif match == 5:
        rank = 3
    elif match == 4:
        rank = 4
    elif match == 3:
        rank = 5
    else:
        rank = 0

    return {
        "rank": rank,
        "rank_label": RANK_LABELS[rank],
        "match_count": match,
        "bonus_matched": bonus in user_set,
        "matched_numbers": sorted(user_set & winning),
    }
