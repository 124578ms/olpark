"""D04 차량 단위 기록 → 시간대별 집계 + D05 공연정보 결합.

출력: data/hourly.csv
  datetime, 입차(전체/문별), 출차, 재차대수(그 시각 주차장에 있던 차), 공연명, 공연관람객수
사용법: python scripts/aggregate_hourly.py
"""
import csv, glob, gzip, json, os, re, sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.join(os.path.dirname(__file__), "..", "data")
MAX_STAY_H = 24  # 이보다 긴 주차·출차 누락은 재차 계산에서 24시간으로 자름
FMT = "%Y-%m-%d %H:%M:%S"


def gate(name):
    m = re.match(r"([동서남북]\d)문", name or "")
    return m.group(1) if m else "기타"


def hour(t):
    return t.replace(minute=0, second=0, microsecond=0)


def main():
    ent, ext, occ = Counter(), Counter(), Counter()
    ent_g = defaultdict(Counter)
    stats = Counter()
    ids = set()
    for path in sorted(glob.glob(os.path.join(BASE, "d04", "page_*.csv.gz"))):
        for r in csv.DictReader(gzip.open(path, "rt", encoding="utf-8")):
            stats["rows"] += 1
            if r["id"] in ids:
                stats["dup"] += 1
                continue
            ids.add(r["id"])
            try:
                tin = datetime.strptime(r["in_time"], FMT)
            except (TypeError, ValueError):
                stats["bad_in"] += 1
                continue
            tout = None
            if r["out_time"]:
                try:
                    tout = datetime.strptime(r["out_time"], FMT)
                except ValueError:
                    pass
            if tout is None:
                stats["no_out"] += 1
            elif tout < tin:
                stats["neg_stay"] += 1
                tout = None
            h = hour(tin)
            ent[h] += 1
            ent_g[gate(r["in_gate"])][h] += 1
            if tout:
                ext[hour(tout)] += 1
                stats["stay_min_sum"] += (tout - tin).total_seconds() / 60
                stats["stay_n"] += 1
            end = min(tout or tin + timedelta(hours=MAX_STAY_H), tin + timedelta(hours=MAX_STAY_H))
            cur = h
            while cur <= hour(end):
                occ[cur] += 1
                cur += timedelta(hours=1)

    shows = {}
    d05 = os.path.join(BASE, "d05_raw.json")
    if os.path.exists(d05):
        for x in json.load(open(d05, encoding="utf-8")):
            m = re.match(r"공연명:(.*),공연관람객수:(\d*)", (x.get("TITLE") or "").replace("\n", " "), re.S)
            if m and m.group(1).strip():
                shows[x["ISSUED_DATE"][:13]] = (m.group(1).strip(), m.group(2))

    year = [h for h in ent if h.year == 2025]
    start, end = min(year), max(year)
    gates = sorted(ent_g, key=lambda g: -sum(ent_g[g].values()))
    out = os.path.join(BASE, "hourly.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["datetime", "입차", *[f"입차_{g}" for g in gates], "출차", "재차대수", "공연명", "공연관람객수"])
        cur = start
        while cur <= end:
            k = cur.strftime("%Y-%m-%d %H")
            s = shows.get(k, ("", ""))
            w.writerow([cur.strftime(FMT), ent[cur], *[ent_g[g][cur] for g in gates], ext[cur], occ[cur], *s])
            cur += timedelta(hours=1)

    print("== D04 집계 ==")
    print({k: int(v) for k, v in stats.items() if k != "stay_min_sum"})
    if stats["stay_n"]:
        print("평균 주차시간(분):", round(stats["stay_min_sum"] / stats["stay_n"], 1))
    print("기간:", start, "~", end, "| 연도 분포:", Counter(h.year for h in ent))
    print("문별 입차:", {g: sum(ent_g[g].values()) for g in gates})
    daily = Counter()
    for h, v in ent.items():
        daily[h.date()] += v
    top = daily.most_common(5)
    print("입차 많은 날:", [(str(d), v) for d, v in top])
    print("공연 시간대 결합:", len(shows), "| 출력:", out)


if __name__ == "__main__":
    main()
