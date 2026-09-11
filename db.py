# -*- coding: utf-8 -*-
"""
SQLite DB 헬퍼 모듈
- 로또 당첨번호 데이터를 저장/조회하는 기능을 담당합니다.
"""
import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "lotto.db")


def get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """draws 테이블이 없으면 생성합니다."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS draws (
            draw_no     INTEGER PRIMARY KEY,   -- 회차
            draw_date   TEXT,                  -- 추첨일
            n1 INTEGER, n2 INTEGER, n3 INTEGER,
            n4 INTEGER, n5 INTEGER, n6 INTEGER,
            bonus INTEGER,
            first_prize_amount INTEGER,        -- 1등 1인당 당첨금(있으면)
            first_prize_count  INTEGER,        -- 1등 당첨자 수(있으면)
            second_prize_amount INTEGER,       -- 2등 1인당 당첨금(있으면)
            second_prize_count  INTEGER        -- 2등 당첨자 수(있으면)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS saved_numbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numbers TEXT NOT NULL,          -- "1,2,3,4,5,6"
            memo TEXT,
            source TEXT,                    -- 'personal' | 'generate' | 'manual'
            created_at TEXT,
            target_draw_no INTEGER,         -- 확인하고 싶은 회차(선택)
            last_check_result TEXT          -- 마지막 당첨확인 결과(JSON 문자열)
        )
    """)
    conn.commit()
    conn.close()


def add_saved_number(numbers: list, memo: str = "", source: str = "manual", target_draw_no=None):
    import datetime
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO saved_numbers (numbers, memo, source, created_at, target_draw_no, last_check_result)
        VALUES (?, ?, ?, ?, ?, NULL)
    """, (
        ",".join(str(n) for n in numbers), memo, source,
        datetime.datetime.now().isoformat(timespec="seconds"), target_draw_no
    ))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def get_saved_numbers():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM saved_numbers ORDER BY id DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    for r in rows:
        r["numbers"] = [int(x) for x in r["numbers"].split(",")]
    return rows


def delete_saved_number(item_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM saved_numbers WHERE id = ?", (item_id,))
    conn.commit()
    affected = cur.rowcount
    conn.close()
    return affected > 0


def update_saved_number_result(item_id: int, result_json: str, target_draw_no=None):
    conn = get_conn()
    cur = conn.cursor()
    if target_draw_no is not None:
        cur.execute("UPDATE saved_numbers SET last_check_result = ?, target_draw_no = ? WHERE id = ?",
                    (result_json, target_draw_no, item_id))
    else:
        cur.execute("UPDATE saved_numbers SET last_check_result = ? WHERE id = ?", (result_json, item_id))
    conn.commit()
    conn.close()


def upsert_draw(row: dict):
    """
    row 예시:
    {
      "draw_no": 1120, "draw_date": "2024-06-01",
      "n1":1,"n2":2,"n3":3,"n4":4,"n5":5,"n6":6,"bonus":7,
      "first_prize_amount": 0, "first_prize_count": 0
    }
    """
    conn = get_conn()
    cur = conn.cursor()
    row = dict(row)
    row.setdefault("second_prize_amount", 0)
    row.setdefault("second_prize_count", 0)
    cur.execute("""
        INSERT INTO draws (draw_no, draw_date, n1,n2,n3,n4,n5,n6,bonus,
                            first_prize_amount, first_prize_count,
                            second_prize_amount, second_prize_count)
        VALUES (:draw_no, :draw_date, :n1,:n2,:n3,:n4,:n5,:n6,:bonus,
                :first_prize_amount, :first_prize_count,
                :second_prize_amount, :second_prize_count)
        ON CONFLICT(draw_no) DO UPDATE SET
            draw_date=excluded.draw_date,
            n1=excluded.n1, n2=excluded.n2, n3=excluded.n3,
            n4=excluded.n4, n5=excluded.n5, n6=excluded.n6,
            bonus=excluded.bonus,
            first_prize_amount=excluded.first_prize_amount,
            first_prize_count=excluded.first_prize_count,
            second_prize_amount=excluded.second_prize_amount,
            second_prize_count=excluded.second_prize_count
    """, row)
    conn.commit()
    conn.close()


def get_draw(draw_no: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM draws WHERE draw_no = ?", (draw_no,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_latest_draw():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM draws ORDER BY draw_no DESC LIMIT 1")
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_draws():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM draws ORDER BY draw_no ASC")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_draws():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as c FROM draws")
    c = cur.fetchone()["c"]
    conn.close()
    return c
