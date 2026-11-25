"""D05 (올림픽공원 2025 차량입출차·공연·날씨 연계) 전체 수집 + 진단.

사용법 (PowerShell):
    $env:KCISA_KEY = "문화공공데이터광장에서 발급받은 서비스키"
    python scripts/fetch_d05.py

결과: data/d05_raw.json (원본), data/d05.csv (DESCRIPTION을 열로 펼친 표), 화면에 진단 출력.
"""
import csv, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")
URL = "https://api.kcisa.kr/openapi/API_CPM_009/request"
ROWS = 1000
OUT = os.path.join(os.path.dirname(__file__), "..", "data")


def call(key, page):
    q = urllib.parse.urlencode({"serviceKey": key, "numOfRows": ROWS, "pageNo": page})
    req = urllib.request.Request(f"{URL}?{q}", headers={"Accept": "application/json"})
    for wait in (5, 15, 30, 60, 120, 0):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode("utf-8")
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or not wait:
                raise
            print(f"  429 호출 제한 → {wait}초 후 재시도")
            time.sleep(wait)
    try:
        return find_items(json.loads(body))
    except json.JSONDecodeError:
        root = ET.fromstring(body)
        return [{c.tag: (c.text or "") for c in it} for it in root.iter("item")]


def find_items(node):
    """JSON 구조가 문서와 다를 수 있어 DESCRIPTION 키를 가진 dict 목록을 찾는다."""
    if isinstance(node, list):
        if node and all(isinstance(x, dict) for x in node) and any(
            "description" in {k.lower() for k in x} for x in node
        ):
            return node
        for x in node:
            r = find_items(x)
            if r:
                return r
    elif isinstance(node, dict):
        lk = {k.lower() for k in node}
        if "description" in lk:
            return [node]
        for v in node.values():
            r = find_items(v)
            if r:
                return r
    return []


def parse(item):
    it = {k.lower(): v.strip() if isinstance(v, str) else v for k, v in item.items()}
    row = {"id": it.get("local_id"), "datetime": it.get("issued_date"), "title": it.get("title")}
    for part in re.split(r",\s*(?=[^,:]+:)", it.get("description") or ""):
        if ":" in part:
            k, v = part.split(":", 1)
            row[k.strip()] = v.strip()
    return row


def load_env_key(name="KCISA_KEY"):
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return None
    for line in open(path, encoding="utf-8-sig"):
        if line.strip().startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def num(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def main():
    raw_path = os.path.join(OUT, "d05_raw.json")
    if "--cached" in sys.argv and os.path.exists(raw_path):
        items = json.load(open(raw_path, encoding="utf-8"))
        print(f"저장된 원본 사용: {len(items)}건")
        return analyze(items)
    key = os.environ.get("KCISA_KEY") or load_env_key()
    if not key:
        sys.exit("KCISA_KEY 환경변수 또는 프로젝트 폴더의 .env 파일(KCISA_KEY=...)에 서비스키를 넣어 주세요.")
    os.makedirs(OUT, exist_ok=True)
    items, page = [], 1
    while True:
        batch = call(key, page)
        items += batch
        print(f"page {page}: {len(batch)}건 (누적 {len(items)})")
        if len(batch) < ROWS:
            break
        page += 1
        time.sleep(3)
    json.dump(items, open(raw_path, "w", encoding="utf-8"), ensure_ascii=False)
    analyze(items)


def analyze(items):
    rows = sorted((parse(i) for i in items), key=lambda r: r["datetime"] or "")
    cols = list(dict.fromkeys(k for r in rows for k in r))
    with open(os.path.join(OUT, "d05.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    # ---- 진단 ----
    print("\n== 진단 ==")
    print("총 행:", len(rows), "| 열:", cols)
    dts = [r["datetime"] for r in rows if r["datetime"]]
    print("기간:", dts[0], "~", dts[-1])
    days = Counter(d[:10] for d in dts)
    print("날짜 수:", len(days), "| 하루 행 수 분포:", sorted(Counter(days.values()).items()))
    print("시간대 분포:", sorted(Counter(d[11:13] for d in dts).items()))
    print("중복 일시:", sum(c - 1 for c in Counter(dts).values() if c > 1))

    park = [num(r.get("주차대수")) for r in rows]
    vis = [num(r.get("방문객")) for r in rows]
    pairs = [(p, v) for p, v in zip(park, vis) if p and v is not None]
    ratios = Counter(round(v / p, 2) for p, v in pairs)
    print("방문객/주차대수 비율 상위:", ratios.most_common(5))
    vals = [p for p in park if p is not None]
    if vals:
        print("주차대수 min/max/평균:", min(vals), max(vals), round(sum(vals) / len(vals), 1))
    # ID 순서로 정렬했을 때 주차대수가 1씩 변하는 비율 (샘플에서 보인 이상 패턴 점검)
    by_id = sorted(rows, key=lambda r: num(r["id"]) or 0)
    p_id = [num(r.get("주차대수")) for r in by_id]
    steps = Counter(round(b - a) for a, b in zip(p_id, p_id[1:]) if a is not None and b is not None)
    print("ID순 주차대수 차이 상위:", steps.most_common(5))
    for k in ("휴일", "공연명", "강수량"):
        filled = sum(1 for r in rows if r.get(k))
        print(f"'{k}' 값 있는 행: {filled}")
    shows = Counter(r.get("공연명") for r in rows if r.get("공연명"))
    print("공연명 상위:", shows.most_common(10))


if __name__ == "__main__":
    main()
