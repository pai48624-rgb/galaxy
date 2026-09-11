# -*- coding: utf-8 -*-
"""
MBTI · 혈액형 · 생년월일 기반 "나만의 행운/불행 번호" 모듈
================================================================
※ 매우 중요한 전제
과학적으로 MBTI, 혈액형, 생년월일은 로또 당첨번호와 아무런 인과관계가 없습니다.
(실제로 "혈액형별 행운의 숫자" 같은 공인 데이터는 존재하지 않으며, 혈액형 성격론
 자체도 과학적 근거가 없는 대중문화 속설입니다.)

이 모듈은 그 사실을 숨기지 않고, "입력값에 따라 항상 같은 결과가 나오는
재미용 개인화 콘텐츠"로 설계했습니다. 같은 MBTI+혈액형+생년월일을 입력하면
매번 동일한 행운/불행 번호가 나오도록 해시 기반 결정론적 알고리즘을 사용합니다.
실제 당첨 확률에는 어떠한 영향도 주지 않습니다.
"""
import hashlib
import random

import algorithm

_rng = random.SystemRandom()

MBTI_TYPES = [
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
]

BLOOD_TYPES = ["A", "B", "O", "AB"]

BORROW_PHRASES = [
    "{name}님의 기운을 살짝 빌려볼게요 🍀",
    "{name}님, 행운 잠깐만 빌릴게요! 이자는 안 쳐드려요 😆",
    "니 행운 빌려갈게~ 갚을 땐 당첨금으로 갚아줘",
    "{name}님 몰래 운 좀 훔쳐올게요 (허락받은 거 맞죠?)",
    "오늘만큼은 {name}님의 인생을 살짝 빌려 살아보겠습니다",
    "{name}님의 럭키 유전자, 잠깐 접속하겠습니다...",
    "{name}님 운빨 좀 나눠주세요, 나중에 소주 한 잔 살게요",
]


def pick_borrow_phrase(nickname: str) -> str:
    name = (nickname or "").strip() or "그 사람"
    return _rng.choice(BORROW_PHRASES).format(name=name)


# 재미용 한 줄 키워드 (과학적 근거 없음, 대중문화적 이미지에 기반한 엔터테인먼트 텍스트)
MBTI_KEYWORD = {
    "INTJ": "전략가", "INTP": "논리술사", "ENTJ": "지휘관", "ENTP": "변론가",
    "INFJ": "옹호자", "INFP": "중재자", "ENFJ": "선도자", "ENFP": "활동가",
    "ISTJ": "현실주의자", "ISFJ": "수호자", "ESTJ": "경영자", "ESFJ": "집정관",
    "ISTP": "장인", "ISFP": "모험가", "ESTP": "사업가", "ESFP": "연예인",
}

BLOOD_KEYWORD = {
    "A": "신중함", "B": "자유로움", "O": "리더십", "AB": "독창성",
}


def life_path_number(birth_date: str) -> int:
    """
    생년월일(YYYY-MM-DD)의 모든 숫자를 더해 한 자리 수로 축약하는
    전통적인 수비학(numerology) 방식의 '라이프패스 넘버'를 계산합니다.
    """
    digits = [int(ch) for ch in birth_date if ch.isdigit()]
    total = sum(digits)
    while total > 9:
        total = sum(int(d) for d in str(total))
    return total or 1


def _affinity_scores(mbti: str, blood_type: str, birth_date: str) -> dict:
    """
    MBTI + 혈액형 + 생년월일을 조합한 문자열을 시드로 사용해
    1~45 각 번호에 대한 결정론적 '궁합 점수'(0~1)를 계산합니다.
    같은 입력에는 항상 같은 결과가 나옵니다(재현 가능).
    """
    lp = life_path_number(birth_date)
    seed_base = f"{mbti.upper()}|{blood_type.upper()}|{birth_date}|lp{lp}"

    scores = {}
    for n in range(1, 46):
        h = hashlib.sha256(f"{seed_base}-{n}".encode()).hexdigest()
        scores[n] = int(h[:8], 16) / 0xFFFFFFFF  # 0~1 사이 값
    return scores


def get_profile_numbers(mbti: str, blood_type: str, birth_date: str, top_n: int = 6):
    """
    프로필 기준으로 '나와 잘 맞는 번호' Top N, '나와 안 맞는 번호' Bottom N을 반환합니다.
    """
    scores = _affinity_scores(mbti, blood_type, birth_date)
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    lucky = ranked[:top_n]
    unlucky = ranked[-top_n:][::-1]

    return {
        "mbti": mbti.upper(),
        "mbti_keyword": MBTI_KEYWORD.get(mbti.upper(), ""),
        "blood_type": blood_type.upper(),
        "blood_keyword": BLOOD_KEYWORD.get(blood_type.upper(), ""),
        "birth_date": birth_date,
        "life_path_number": life_path_number(birth_date),
        "lucky_numbers": [
            {"number": n, "score": round(s, 3), "color": algorithm.ball_color(n)}
            for n, s in lucky
        ],
        "unlucky_numbers": [
            {"number": n, "score": round(s, 3), "color": algorithm.ball_color(n)}
            for n, s in unlucky
        ],
    }


def personalized_pick(
    mbti: str, blood_type: str, birth_date: str,
    personal_weight: float = 0.6, stat_mode: str = "hot",
):
    """
    개인화 궁합 점수 + 실제 역대 통계 점수를 섞어서 6개 번호를 가중 무작위로 뽑습니다.

    personal_weight: 개인화 점수 반영 비율 (0~1). 나머지는 통계 점수 비율.
    stat_mode:
      - "hot"  : 통계 요소로 '자주 나온 번호'(빈도) 사용 → "나의 행운번호" 탭에서 사용
      - "cold" : 통계 요소로 '오래 안 나온 번호'(미출현) 사용 → "너의 행운을 빌릴게" 탭에서 사용
                 (같은 개인화 점수라도 통계 반영 방향이 정반대라 결과가 달라집니다)
    ※ 이 가중치는 사용자 경험을 위한 것이며, 실제 당첨 확률은 모든 조합이 동일합니다.
    """
    personal = _affinity_scores(mbti, blood_type, birth_date)

    if stat_mode == "cold":
        stat = algorithm.normalize(algorithm.get_gap_table())
    else:
        stat = algorithm.normalize(algorithm.get_frequency_table())

    combined = {
        n: personal_weight * personal[n] + (1 - personal_weight) * stat.get(n, 0)
        for n in range(1, 46)
    }

    numbers = algorithm.sample_unique_weighted(combined, k=6)
    return numbers
