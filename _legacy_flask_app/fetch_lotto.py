# -*- coding: utf-8 -*-
"""
로또 당첨번호 수집 스크립트
=========================
1) 동행복권 공식 API에서 회차별 당첨번호를 가져와 SQLite DB에 저장합니다.
2) 저장된 전체 데이터를 엑셀(xlsx) 파일로 백업(export)할 수 있습니다.
3) 반대로, 기존에 가지고 있던 엑셀 파일을 DB로 불러올(import) 수도 있습니다.

사용법
------
# 1. 동행복권 API에서 전체 회차를 최초 수집 (인터넷 연결 필요)
python fetch_lotto.py --sync

# 2. 최신 회차 몇 개만 추가로 업데이트하고 싶을 때도 동일 명령 사용
#    (이미 있는 회차는 건너뛰고, 없는 회차만 새로 받아옵니다)
python fetch_lotto.py --sync

# 3. DB에 있는 데이터를 엑셀로 백업
python fetch_lotto.py --export data/lotto_backup.xlsx

# 4. 가지고 있던 엑셀 파일(회차, 날짜, 번호1~6, 보너스 컬럼 포함)을 DB로 불러오기
python fetch_lotto.py --import-xlsx 내엑셀파일.xlsx
"""
import argparse
import time
import sys
from datetime import date, timedelta
import requests
import pandas as pd

import db

FIRST_DRAW_DATE = date(2002, 12, 7)  # 로또 1회차 추첨일(매주 토요일)


def draw_no_to_date(draw_no: int) -> str:
    """회차 번호로 추첨일을 추정합니다(1회차=2002-12-07, 매주 토요일)."""
    d = FIRST_DRAW_DATE + timedelta(weeks=int(draw_no) - 1)
    return d.isoformat()


DHLOTTERY_API = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"


def fetch_one(draw_no: int):
    """동행복권 API에서 특정 회차 정보를 가져옵니다. 실패 시 None 반환."""
    try:
        resp = requests.get(DHLOTTERY_API.format(draw_no), timeout=5)
        data = resp.json()
    except Exception as e:
        print(f"  [!] {draw_no}회차 조회 실패: {e}")
        return None

    if data.get("returnValue") != "success":
        return None

    return {
        "draw_no": data["drwNo"],
        "draw_date": data.get("drwNoDate", ""),
        "n1": data["drwtNo1"], "n2": data["drwtNo2"], "n3": data["drwtNo3"],
        "n4": data["drwtNo4"], "n5": data["drwtNo5"], "n6": data["drwtNo6"],
        "bonus": data["bnusNo"],
        "first_prize_amount": data.get("firstWinamnt", 0),
        "first_prize_count": data.get("firstPrzwnerCo", 0),
        "second_prize_amount": data.get("secondWinamnt", 0),
        "second_prize_count": data.get("secondPrzwnerCo", 0),
    }


def estimate_latest_draw_no():
    """
    로또 1회차는 2002-12-07(토) 추첨. 이후 매주 진행되므로
    현재 날짜 기준 대략적인 최신 회차를 추정합니다.
    (정확한 최신 회차는 sync 진행 중 API 응답이 실패하는 시점에서 자동으로 멈춥니다)
    """
    from datetime import date
    first_draw_date = date(2002, 12, 7)
    weeks = (date.today() - first_draw_date).days // 7
    return max(weeks, 1)


def sync():
    db.init_db()
    start_no = db.count_draws() + 1  # 이미 저장된 다음 회차부터 이어서 수집
    end_no = estimate_latest_draw_no() + 2  # 여유분 포함

    print(f"[동행복권 API 동기화 시작] {start_no}회차 ~ 최신 회차")
    saved = 0
    for no in range(start_no, end_no + 1):
        row = fetch_one(no)
        if row is None:
            print(f"  -> {no}회차 데이터 없음(아직 미추첨). 동기화를 종료합니다.")
            break
        db.upsert_draw(row)
        saved += 1
        print(f"  [{no}회차] {row['n1']},{row['n2']},{row['n3']},"
              f"{row['n4']},{row['n5']},{row['n6']} + 보너스 {row['bonus']}  (저장완료)")
        time.sleep(0.15)  # 서버 부담을 줄이기 위한 짧은 대기

    print(f"\n총 {saved}개 회차 저장/갱신 완료. (DB 전체 {db.count_draws()}건)")


def export_to_excel(path: str):
    db.init_db()
    rows = db.get_all_draws()
    if not rows:
        print("DB에 데이터가 없습니다. 먼저 --sync 로 데이터를 수집하세요.")
        return
    df = pd.DataFrame(rows)
    df.to_excel(path, index=False, sheet_name="lotto_draws")
    print(f"엑셀로 내보내기 완료: {path} (총 {len(df)}행)")


def import_from_excel(path: str):
    """
    엑셀 컬럼명은 아래 중 하나의 형태를 지원합니다(대소문자 무관):
    draw_no/회차, draw_date/추첨일, n1~n6/번호1~번호6, bonus/보너스
    """
    db.init_db()
    df = pd.read_excel(path)

    col_map_candidates = {
        "draw_no": ["draw_no", "회차", "no", "round"],
        "draw_date": ["draw_date", "추첨일", "date", "추첨일자"],
        "n1": ["n1", "번호1", "num1"], "n2": ["n2", "번호2", "num2"],
        "n3": ["n3", "번호3", "num3"], "n4": ["n4", "번호4", "num4"],
        "n5": ["n5", "번호5", "num5"], "n6": ["n6", "번호6", "num6"],
        "bonus": ["bonus", "보너스", "보너스번호"],
        "first_prize_amount": ["first_prize_amount", "1등 당첨금", "1등당첨금"],
        "first_prize_count": ["first_prize_count", "1등 당첨수", "1등당첨수", "1등당첨자수"],
        "second_prize_amount": ["second_prize_amount", "2등 당첨금", "2등당첨금"],
        "second_prize_count": ["second_prize_count", "2등 당첨수", "2등당첨수", "2등당첨자수"],
    }

    normalized = {c.strip().lower(): c for c in df.columns}
    resolved = {}
    for key, candidates in col_map_candidates.items():
        for cand in candidates:
            if cand.lower() in normalized:
                resolved[key] = normalized[cand.lower()]
                break
    missing = [k for k in ["draw_no", "n1", "n2", "n3", "n4", "n5", "n6", "bonus"] if k not in resolved]
    if missing:
        print(f"[!] 엑셀에서 다음 컬럼을 찾지 못했습니다: {missing}")
        print(f"    실제 컬럼: {list(df.columns)}")
        sys.exit(1)

    has_date_col = "draw_date" in resolved
    count = 0
    for _, r in df.iterrows():
        draw_no = int(r[resolved["draw_no"]])
        row = {
            "draw_no": draw_no,
            "draw_date": str(r[resolved["draw_date"]]) if has_date_col else draw_no_to_date(draw_no),
            "n1": int(r[resolved["n1"]]), "n2": int(r[resolved["n2"]]),
            "n3": int(r[resolved["n3"]]), "n4": int(r[resolved["n4"]]),
            "n5": int(r[resolved["n5"]]), "n6": int(r[resolved["n6"]]),
            "bonus": int(r[resolved["bonus"]]),
            "first_prize_amount": int(r[resolved["first_prize_amount"]]) if "first_prize_amount" in resolved else 0,
            "first_prize_count": int(r[resolved["first_prize_count"]]) if "first_prize_count" in resolved else 0,
            "second_prize_amount": int(r[resolved["second_prize_amount"]]) if "second_prize_amount" in resolved else 0,
            "second_prize_count": int(r[resolved["second_prize_count"]]) if "second_prize_count" in resolved else 0,
        }
        db.upsert_draw(row)
        count += 1
    print(f"엑셀에서 {count}건 불러오기 완료. (DB 전체 {db.count_draws()}건)")
    if not has_date_col:
        print("  (※ 엑셀에 추첨일 컬럼이 없어 1회차=2002-12-07 기준 매주 추정일로 자동 계산했습니다)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="로또 당첨번호 수집/백업 도구")
    parser.add_argument("--sync", action="store_true", help="동행복권 API에서 데이터 동기화")
    parser.add_argument("--export", metavar="FILE.xlsx", help="DB 데이터를 엑셀로 내보내기")
    parser.add_argument("--import-xlsx", metavar="FILE.xlsx", help="엑셀 데이터를 DB로 불러오기")
    args = parser.parse_args()

    if args.sync:
        sync()
    elif args.export:
        export_to_excel(args.export)
    elif args.import_xlsx:
        import_from_excel(args.import_xlsx)
    else:
        parser.print_help()
