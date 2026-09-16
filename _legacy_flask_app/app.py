from flask import Flask, jsonify, render_template, request, redirect, url_for, session
import sqlite3
import os
import json
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-바꿔주세요')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'change-me-1234')
DB_PATH = os.path.join(os.path.dirname(__file__), 'constellation.db')
DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'ai_landscape.json')


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get('is_admin'):
            return redirect(url_for('admin_login', next=request.path))
        return f(*args, **kwargs)
    return wrapper


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


SEED_VERSION = '6'  # 시드 데이터 구조가 바뀔 때마다 이 숫자를 올리면, 오래된 로컬 DB도 자동으로 최신 데이터로 갱신됩니다.

# 예전(엑셀 55개 버전)에 직접 조사해 넣었던 인기도 순위 - 새 731개 데이터셋에 있는 동일 툴에 한해
# 순위를 이어받아 크기에 반영합니다. 이 목록 밖의 나머지 675개는 순위 정보가 없어 기본 크기로 표시됩니다.
KNOWN_RANKS = {
    'ChatGPT': 1, 'Gemini': 3, 'Claude': 4, 'Perplexity': 7, 'DeepSeek': 12,
    'Jasper': 34, 'Copy.ai': 39, 'Grammarly': 22, 'QuillBot': 35, 'Character.ai': 42,
    'Midjourney': 5, 'DALL-E 3': 10, 'Stable Diffusion': 13, 'Canva AI': 15,
    'Adobe Firefly': 18, 'Leonardo.ai': 25, 'Phind': 49, 'Recraft': 43,
    'Magnific AI': 46, 'Viggle AI': 55, 'Notion AI': 9, 'NotebookLM': 20,
    'Gamma': 26, 'Beautiful.ai': 45, 'Zapier': 24, 'n8n': 33, 'Fireflies.ai': 38,
    'Granola': 53, 'Otter.ai': 40, 'Mendable': 56, 'Sora': 11, 'Higgsfield AI': 19,
    'Runway': 16, 'Runway Gen-3': 16, 'Pika': 28, 'HeyGen': 31, 'Synthesia': 44,
    'ElevenLabs': 14, 'Suno': 17, 'Udio': 30, 'Veed.io': 47, 'Descript': 41,
    'GitHub Copilot': 2, 'Cursor': 6, 'Claude Code': 8, 'Replit Agent': 21,
    'Replit': 21, 'v0.dev': 23, 'Bolt.new': 27, 'Lovable': 29, 'LangChain': 32,
    'Anakin.ai': 52, 'Relevance AI': 50, 'HubSpot AI': 48, 'Opus Clip': 36,
    'Vrew': 37, 'FeedHive': 54, 'AdCreative.ai': 51,
}


def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    row = conn.execute("SELECT value FROM meta WHERE key='seed_version'").fetchone()
    current_version = row['value'] if row else None
    needs_reseed = current_version != SEED_VERSION

    if needs_reseed:
        conn.execute('DROP TABLE IF EXISTS nodes')
        conn.execute('DROP TABLE IF EXISTS relations')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,          -- 한글명(없으면 영문명으로 대체)
            name_en TEXT,                -- 영문명 (영문 검색/매칭 기준)
            type TEXT NOT NULL,          -- star / satellite
            category TEXT,               -- 대분류(국문)
            category_en TEXT,            -- 대분류(영문)
            subcategory TEXT,            -- 세부분류(국문)
            subcategory_en TEXT,
            parent_id INTEGER,           -- satellite 전용
            description TEXT,            -- 국문 설명
            description_en TEXT,         -- 영문 설명 (다국어 전환 대비)
            url TEXT,
            github TEXT,
            twitter TEXT,
            tags TEXT,
            added_date TEXT,
            blog_url TEXT,
            score INTEGER DEFAULT 50,
            rank INTEGER,                 -- 알려진 인기도 순위(없으면 NULL)
            pricing TEXT DEFAULT '정보없음'  -- 무료 / 부분유료 / 유료 / 정보없음
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            label TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT,
            note TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    ''')

    if needs_reseed:
        seed(conn)
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('seed_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (SEED_VERSION,)
        )
        conn.commit()
    conn.close()


def seed(conn):
    with open(DATA_PATH, encoding='utf-8') as f:
        items = json.load(f)

    name_to_id = {}
    for it in items:
        name_ko = it['name_ko'] or it['name_en']
        rank = KNOWN_RANKS.get(it['name_en'])
        cur = conn.execute(
            "INSERT INTO nodes (name, name_en, type, category, category_en, subcategory, subcategory_en, "
            "description, description_en, url, github, twitter, tags, added_date, rank, pricing) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (name_ko, it['name_en'], 'star', it['category'], it['category_en'],
             it['subcategory'], it['subcategory_en'], it['desc_ko'] or it['desc_en'], it['desc_en'],
             it['url'], it['github'], it['twitter'], it['tags'], it['added_date'], rank, '정보없음')
        )
        name_to_id[it['name_en'].lower()] = cur.lastrowid

    seen_pairs = set()
    for it in items:
        from_id = name_to_id.get(it['name_en'].lower())
        if not from_id:
            continue
        for rel_name in it['related_names']:
            to_id = name_to_id.get(rel_name.lower())
            if not to_id or to_id == from_id:
                continue
            pair = frozenset((from_id, to_id))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            conn.execute(
                "INSERT INTO relations (from_id, to_id, label) VALUES (?,?,?)",
                (from_id, to_id, '같은 세부분류(' + (it['subcategory'] or '') + ')')
            )


@app.route('/')
def index():
    conn = get_db()
    stars = conn.execute(
        "SELECT * FROM nodes WHERE type='star' ORDER BY category, name"
    ).fetchall()
    conn.close()
    grouped = {}
    for s in stars:
        grouped.setdefault(s['category'], []).append(s)
    return render_template('index.html', grouped=grouped)


@app.route('/api/graph')
def api_graph():
    conn = get_db()
    rows = conn.execute('SELECT * FROM nodes').fetchall()
    relations = conn.execute('SELECT * FROM relations').fetchall()
    conn.close()
    return jsonify({
        'nodes': [dict(r) for r in rows],
        'relations': [dict(r) for r in relations],
    })


@app.route('/ai/<int:node_id>')
def ai_detail(node_id):
    conn = get_db()
    node = conn.execute("SELECT * FROM nodes WHERE id=? AND type='star'", (node_id,)).fetchone()
    related = []
    if node:
        related = conn.execute('''
            SELECT n.id, n.name, n.category
            FROM relations r
            JOIN nodes n ON n.id = (CASE WHEN r.from_id=? THEN r.to_id ELSE r.from_id END)
            WHERE r.from_id=? OR r.to_id=?
        ''', (node_id, node_id, node_id)).fetchall()
    conn.close()
    if not node:
        return "존재하지 않는 AI입니다.", 404
    return render_template('ai_detail.html', node=node, satellites=[], related=related)


@app.route('/suggest', methods=['GET', 'POST'])
def suggest():
    saved = False
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        category = request.form.get('category', '').strip()
        note = request.form.get('note', '').strip()
        if name:
            conn = get_db()
            conn.execute(
                "INSERT INTO suggestions (name, category, note) VALUES (?,?,?)",
                (name, category, note)
            )
            conn.commit()
            conn.close()
            saved = True
    return render_template('suggest.html', saved=saved)


@app.route('/admin/suggestions')
@login_required
def admin_suggestions():
    conn = get_db()
    rows = conn.execute("SELECT * FROM suggestions ORDER BY id DESC").fetchall()
    conn.close()
    return render_template('admin_suggestions.html', rows=rows)


@app.route('/admin/suggestions/delete/<int:sid>', methods=['POST'])
@login_required
def admin_suggestion_delete(sid):
    conn = get_db()
    conn.execute("DELETE FROM suggestions WHERE id=?", (sid,))
    conn.commit()
    conn.close()
    return redirect(url_for('admin_suggestions'))


@app.route('/admin/relations', methods=['GET', 'POST'])
@login_required
def admin_relations():
    conn = get_db()
    if request.method == 'POST':
        from_id = request.form.get('from_id')
        to_id = request.form.get('to_id')
        label = request.form.get('label', '')
        if from_id and to_id and from_id != to_id:
            conn.execute(
                "INSERT INTO relations (from_id, to_id, label) VALUES (?,?,?)",
                (from_id, to_id, label)
            )
            conn.commit()
    stars = conn.execute("SELECT id, name FROM nodes WHERE type='star' ORDER BY name").fetchall()
    relations = conn.execute('''
        SELECT r.id, r.label, a.name as from_name, b.name as to_name
        FROM relations r
        JOIN nodes a ON r.from_id = a.id
        JOIN nodes b ON r.to_id = b.id
        ORDER BY r.id DESC LIMIT 300
    ''').fetchall()
    conn.close()
    return render_template('admin_relations.html', stars=stars, relations=relations)


@app.route('/admin/relations/delete/<int:rid>', methods=['POST'])
@login_required
def admin_relation_delete(rid):
    conn = get_db()
    conn.execute("DELETE FROM relations WHERE id=?", (rid,))
    conn.commit()
    conn.close()
    return redirect(url_for('admin_relations'))


@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        if request.form.get('password') == ADMIN_PASSWORD:
            session['is_admin'] = True
            next_url = request.args.get('next') or url_for('admin')
            return redirect(next_url)
        error = '비밀번호가 틀렸습니다.'
    return render_template('admin_login.html', error=error)


@app.route('/admin/logout')
def admin_logout():
    session.pop('is_admin', None)
    return redirect(url_for('admin_login'))


@app.route('/admin', methods=['GET', 'POST'])
@login_required
def admin():
    conn = get_db()
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        name_en = request.form.get('name_en', '').strip()
        ntype = request.form.get('type')
        category = request.form.get('category') or None
        parent_id = request.form.get('parent_id') or None
        description = request.form.get('description', '')
        blog_url = request.form.get('blog_url', '')
        rank = request.form.get('rank') or None
        pricing = request.form.get('pricing') or '정보없음'
        if name and ntype:
            conn.execute(
                "INSERT INTO nodes (name, name_en, type, category, parent_id, description, blog_url, rank, pricing) VALUES (?,?,?,?,?,?,?,?,?)",
                (name, name_en, ntype, category, parent_id, description, blog_url, rank, pricing)
            )
            conn.commit()

    nodes = conn.execute('SELECT * FROM nodes ORDER BY category, name LIMIT 500').fetchall()
    stars = conn.execute("SELECT id, name FROM nodes WHERE type='star' ORDER BY name").fetchall()
    total = conn.execute("SELECT COUNT(*) c FROM nodes WHERE type='star'").fetchone()['c']
    conn.close()
    return render_template('admin.html', nodes=nodes, stars=stars, total=total)


@app.route('/admin/delete/<int:node_id>', methods=['POST'])
@login_required
def admin_delete(node_id):
    conn = get_db()
    conn.execute('DELETE FROM nodes WHERE id=? OR parent_id=?', (node_id, node_id))
    conn.execute('DELETE FROM relations WHERE from_id=? OR to_id=?', (node_id, node_id))
    conn.commit()
    conn.close()
    return redirect(url_for('admin'))


init_db()

if __name__ == '__main__':
    app.run(debug=True)
