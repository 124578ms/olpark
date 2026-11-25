"""data/hourly.csv → web/public/data/site.json (사이트가 읽는 예보 모델·분석 결과).

모델(설명 가능한 기준표 방식):
  예상 재차대수(날짜, 시) = 기준표[요일][시] × 월 보정계수[월]
  - 기준표: 2025년 같은 요일·같은 시각 재차대수의 중앙값 (공연 있는 시간은 제외)
  - 월 보정: 월별 하루 입차 평균 / 전체 하루 입차 평균
  - 공연 영향: 공연 시간대 재차대수 / 같은 요일·시각 기준값 (공연별로 정리)
혼잡 등급: 07–22시 재차대수 분포의 50·75·90 분위수로 4단계
사용법: python scripts/build_site_data.py
"""
import csv, json, os, statistics, sys
from collections import defaultdict
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "data", "hourly.csv")
OUT = os.path.join(ROOT, "web", "public", "data", "site.json")
MIN_DAY_ENTRIES = 300  # 이보다 적은 날은 수집 누락으로 보고 제외
EXPORT_CAP = 65534  # 원본이 월 65,534행에서 잘린 달(옛 엑셀 행 한도) → 일부 표본만 있음
PARTIAL_RATIO = 0.2  # 같은 요일 중앙값의 20% 미만인 날은 중간에 잘린 날로 봄


def q(values, p):
    s = sorted(values)
    return s[min(len(s) - 1, int(p * (len(s) - 1)))]


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    gates = [c[3:] for c in rows[0] if c.startswith("입차_") and c != "입차_기타"]
    for r in rows:
        r["dt"] = datetime.strptime(r["datetime"], "%Y-%m-%d %H:%M:%S")
        for k in ("입차", "출차", "재차대수", *[f"입차_{g}" for g in gates]):
            r[k] = int(r[k] or 0)

    day_entries = defaultdict(int)
    for r in rows:
        day_entries[r["dt"].date()] += r["입차"]
    month_rows = defaultdict(int)
    for d, v in day_entries.items():
        month_rows[d.month] += v
    present = {d for d, v in day_entries.items() if v >= MIN_DAY_ENTRIES}
    capped = [m for m, v in month_rows.items() if v == EXPORT_CAP]
    # 잘린 달 두 종류: 한 달 전체에 고르게 뽑힌 표본(sampled) / 시간순으로 앞부분만 온전한 달(truncated)
    sampled_months = sorted(m for m in capped if sum(1 for d in present if d.month == m) >= 25)
    truncated_last = {max(d for d in present if d.month == m) for m in capped if m not in sampled_months}
    full = {d for d in present if d.month not in sampled_months}
    wd_med = {w: statistics.median([day_entries[d] for d in full if d.weekday() == w]) for w in range(7)}
    partial = sorted(truncated_last | {d for d in full if day_entries[d] < PARTIAL_RATIO * wd_med[d.weekday()]})
    good_days = full - set(partial)
    # 재차대수·기준표·공연 영향은 온전한 날만, 출입문 비율은 고르게 뽑힌 표본 달도 함께 사용
    used = [r for r in rows if r["dt"].date() in good_days]
    used_share = [r for r in rows if r["dt"].date() in good_days or (r["dt"].date() in present and r["dt"].month in sampled_months)]

    # 기준표 (공연 시간 제외)
    cell, cell_all = defaultdict(list), defaultdict(list)
    for r in used:
        key = (r["dt"].weekday(), r["dt"].hour)
        cell_all[key].append(r["재차대수"])
        if not r["공연명"]:
            cell[key].append(r["재차대수"])
    baseline = [
        [round(statistics.median(cell[(w, h)] or cell_all[(w, h)] or [0])) for h in range(24)] for w in range(7)
    ]

    # 월 보정
    # 요일 구성 차이를 없애려고, 하루 입차를 같은 요일 중앙값으로 나눈 비율의 월 평균을 씀
    month_days = defaultdict(list)
    for d in good_days:
        month_days[d.month].append(day_entries[d] / wd_med[d.weekday()])
    overall = statistics.median(v for vs in month_days.values() for v in vs)
    complete = len({d.month for d in good_days}) >= 9
    # 수집이 덜 된 상태에서는 월별 표본이 치우쳐 있어 보정하지 않음(모두 1.0)
    month_factor = {
        # 행사일에 끌려가지 않게 중앙값, 일수가 적은 달은 1 쪽으로 줄임(n/(n+10))
        m: (round(min(1.6, max(0.6, 1 + (statistics.median(v) / overall - 1) * len(v) / (len(v) + 10))), 3) if complete else 1.0)
        for m, v in sorted(month_days.items())
    }
    month_n = {m: len(v) for m, v in month_days.items()}

    # 혼잡 등급 기준
    day_hours = [r["재차대수"] for r in used if 7 <= r["dt"].hour <= 22]
    thresholds = [q(day_hours, 0.5), q(day_hours, 0.75), q(day_hours, 0.9)]

    # 시간대별 출입문 비율
    gate_hour = [[0] * len(gates) for _ in range(24)]
    for r in used_share:
        for i, g in enumerate(gates):
            gate_hour[r["dt"].hour][i] += r[f"입차_{g}"]
    gate_share = [[round(v / max(1, sum(row)), 4) for v in row] for row in gate_hour]

    # 공연 영향
    shows = defaultdict(lambda: {"dates": set(), "audience": 0, "ratios": [], "peak": 0, "with": set()})
    for r in used:
        if not r["공연명"]:
            continue
        base = baseline[r["dt"].weekday()][r["dt"].hour]
        # 같은 시간대 공연 여러 개가 쉼표로 이어져 오므로 첫 공연명으로 묶고 나머지는 함께한 공연으로
        names = [x.strip() for x in r["공연명"].split(",") if x.strip()]
        s = shows[names[0]]
        s["with"].update(names[1:])
        s["dates"].add(r["dt"].date().isoformat())
        s["audience"] = max(s["audience"], int(r["공연관람객수"] or 0))
        s["peak"] = max(s["peak"], r["재차대수"])
        if base:
            s["ratios"].append(r["재차대수"] / base)
    show_list = sorted(
        (
            {
                "name": n,
                "with": sorted(s["with"] - {n}),
                "dates": sorted(s["dates"]),
                "audience": s["audience"],
                "peakOccupancy": s["peak"],
                "uplift": round(statistics.mean(s["ratios"]) - 1, 3) if s["ratios"] else None,
            }
            for n, s in shows.items()
        ),
        key=lambda x: -(x["uplift"] or -9),
    )
    all_ratios = [r for s in shows.values() for r in s["ratios"]]

    # 관람객 규모별 공연 영향(공연별 상승률의 중앙값). 앞으로의 공연은 공연장 규모로 이 값을 골라 쓴다
    def scale_of(aud):
        return "large" if aud >= 10000 else "mid" if aud >= 3000 else "small"

    by_scale = defaultdict(list)
    for s in shows.values():
        if s["ratios"]:
            by_scale[scale_of(s["audience"])].append(statistics.mean(s["ratios"]) - 1)
    scale_uplift = {k: {"uplift": round(statistics.median(v), 3), "shows": len(v)} for k, v in sorted(by_scale.items())}

    # 일별 요약 (연간 달력)
    daily = defaultdict(lambda: {"entries": 0, "peak": 0, "show": ""})
    for r in used:
        d = daily[r["dt"].date().isoformat()]
        d["entries"] += r["입차"]
        d["peak"] = max(d["peak"], r["재차대수"])
        if r["공연명"] and not d["show"]:
            d["show"] = r["공연명"].strip()

    site = {
        "generatedAt": datetime.now().isoformat(timespec="minutes"),
        "source": {
            "rows": sum(day_entries[d] for d in good_days),
            "days": len(good_days),
            "from": min(good_days).isoformat(),
            "to": max(good_days).isoformat(),
            "complete": complete,
            "sampledMonths": sampled_months,
            "partialDays": [d.isoformat() for d in partial],
        },
        "gates": gates,
        "thresholds": thresholds,
        "baseline": baseline,
        "monthFactor": month_factor,
        "gateShare": gate_share,
        "showEffect": {
            "hours": len(all_ratios),
            "byScale": scale_uplift,  # small < 3,000명 ≤ mid < 10,000명 ≤ large
            "showCount": len(set(shows) | {w for s in shows.values() for w in s["with"]}),
            "meanUplift": round(statistics.mean(all_ratios) - 1, 3) if all_ratios else None,
            "shows": show_list,
        },
        "daily": dict(sorted(daily.items())),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(site, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"출력: {OUT} ({os.path.getsize(OUT) // 1024} KB)")
    print("표본만 있는 달:", sampled_months, "| 잘린 날:", [d.isoformat() for d in partial])
    print("사용 일수:", len(good_days), site["source"]["from"], "~", site["source"]["to"])
    print("등급 기준(50/75/90%):", thresholds)
    print("월 보정:", month_factor, "| 일수:", dict(sorted(month_n.items())))
    print("공연 시간 평균 상승률:", site["showEffect"]["meanUplift"], "| 공연 수:", len(show_list))
    print("규모별 공연 영향(중앙값):", scale_uplift)
    print("토요일 기준표 10–20시:", baseline[5][10:21])
    for s in show_list[:5]:
        print("  ", s["name"][:30], s["dates"][:2], s["audience"], s["uplift"])


if __name__ == "__main__":
    main()
