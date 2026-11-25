"""D04 (올림픽공원 입출차정보 전체구역, 약 241만 건) 수집. 중단돼도 이어받기 가능.

사용법: python scripts/fetch_d04.py
  - .env 의 KCISA_KEY_D04 (없으면 KCISA_KEY) 사용
  - 페이지마다 data/d04/page_0001.csv.gz 로 저장, 이미 있는 페이지는 건너뜀
  - 제한: 1회 최대 10,000건, 5초에 1회
"""
import csv, gzip, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
sys.path.insert(0, os.path.dirname(__file__))
from fetch_d05 import find_items, load_env_key  # noqa: E402

URL = "https://api.kcisa.kr/openapi/API_CPM_008/request"
ROWS = 10000
GAP = 11  # 문서상 5초지만 실제로는 응답 후 약 10초 필요
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "d04")
COLS = ["id", "in_gate", "in_time", "out_gate", "out_time"]


def call(key, page):
    q = urllib.parse.urlencode({"serviceKey": key, "numOfRows": ROWS, "pageNo": page})
    req = urllib.request.Request(f"{URL}?{q}", headers={"Accept": "application/json"})
    for attempt in range(8):
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                j = json.loads(r.read().decode("utf-8"))
            total = None
            body = j.get("response", {}).get("body", {})
            if isinstance(body, dict):
                total = body.get("totalCount")
            return find_items(j), total
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise
            why = f"HTTP {e.code} {e.read()[:120]!r}"
            wait = 10 * (attempt + 1)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ConnectionError) as e:
            why = f"{type(e).__name__}: {str(e)[:120]}"
            wait = 15 * (attempt + 1)
        time.sleep(0)
        print(f"  page {page} 재시도 {attempt + 1} ({wait}s 대기) - {why} / {time.time() - t0:.1f}s")
        time.sleep(wait)
    raise RuntimeError(f"page {page} 실패")


def parse(item):
    d = item.get("DESCRIPTION") or ""
    f = dict(
        (k.strip(), v.strip())
        for k, v in (p.split(":", 1) for p in re.split(r",\s*(?=[^,:]+:)", d) if ":" in p)
    )
    return [item.get("LOCAL_ID"), f.get("입구"), f.get("입차시간"), f.get("출구"), f.get("출차시간")]


def main():
    key = load_env_key("KCISA_KEY_D04") or load_env_key()
    os.makedirs(OUT, exist_ok=True)
    page, last, total_pages = 1, 0, None
    while True:
        path = os.path.join(OUT, f"page_{page:04d}.csv.gz")
        if os.path.exists(path):
            page += 1
            if total_pages and page > total_pages:
                break
            if not total_pages and not os.path.exists(os.path.join(OUT, f"page_{page:04d}.csv.gz")):
                pass  # 다음 페이지를 받아 총 건수를 확인
            continue
        time.sleep(max(0, GAP - (time.time() - last)))
        items, total = call(key, page)
        last = time.time()  # 제한 간격은 응답이 끝난 시점부터 계산됨
        if total and not total_pages:
            total_pages = -(-int(total) // ROWS)
            print(f"총 {total}건 / {total_pages}페이지")
        if not items:
            break
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(COLS)
        w.writerows(parse(i) for i in items)
        tmp = path + ".tmp"
        with gzip.open(tmp, "wt", encoding="utf-8", newline="") as g:
            g.write(buf.getvalue())
        os.replace(tmp, path)
        print(f"page {page}/{total_pages or '?'}: {len(items)}건")
        if len(items) < ROWS:
            break
        page += 1
    print("완료")


if __name__ == "__main__":
    main()
