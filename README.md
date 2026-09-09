# galaxy

AI 생태계를 별자리(constellation)로 시각화하기 위한 데이터셋입니다.

## 내용물

- `constellation.db` — SQLite 3 데이터베이스
  - `nodes` (731행): AI 회사·모델·툴 등의 노드. 한/영 이름, 분류, 설명, 공개 URL, SNS 링크, 태그, 점수 등
  - `relations` (2184행): 노드 간 관계 (`from_id`, `to_id`, `label`)
  - `suggestions`: 사용자 제안 항목
  - `meta`: 시드 버전 등 메타 정보

## 스키마 (요약)

```sql
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_en TEXT,
  type TEXT NOT NULL,            -- star / satellite
  category TEXT, category_en TEXT,
  subcategory TEXT, subcategory_en TEXT,
  parent_id INTEGER,
  description TEXT, description_en TEXT,
  url TEXT, github TEXT, twitter TEXT, blog_url TEXT,
  tags TEXT, added_date TEXT,
  score INTEGER DEFAULT 50, rank INTEGER,
  pricing TEXT
);

CREATE TABLE relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  label TEXT
);
```

## 사용 예

```bash
sqlite3 constellation.db "SELECT name_en, category_en FROM nodes LIMIT 10;"
```
