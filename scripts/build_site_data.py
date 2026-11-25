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

    # 비 영향: 기상청 ASOS(서울) 시간 강수와 맞춰, 공연 없는 10–19시의 (재차대수 / 기준표×월보정)을
    # 비 온 시간과 하루 종일 마른 날의 같은 시간대끼리 비교한다. 평일·주말을 나눔(평일 낮은 통근 차량이 많아 영향이 작음)
    rain_effect = None
    asos_path = os.path.join(ROOT, "data", "asos_2025.csv")
    if os.path.exists(asos_path):
        rain = {}
        for w in csv.DictReader(open(asos_path, encoding="utf-8")):
            rain[w["datetime"][:13]] = float(w["강수량"] or 0)
        day_rain = defaultdict(float)
        for k, v in rain.items():
            if 9 <= int(k[11:13]) <= 18:
                day_rain[k[:10]] += v
        groups = defaultdict(list)
        for r in used:
            h = r["dt"].hour
            if r["공연명"] or not (10 <= h <= 19):
                continue
            b = baseline[r["dt"].weekday()][h] * month_factor.get(r["dt"].month, 1.0)
            if not b:
                continue
            k = r["dt"].strftime("%Y-%m-%d %H")
            d = k[:10]
            if rain.get(k, 0) > 0:
                kind = "rain"
            elif day_rain[d] == 0:
                kind = "dry"
            else:
                continue
            groups[("weekend" if r["dt"].weekday() >= 5 else "weekday", kind)].append(r["재차대수"] / b)
        rain_effect = {}
        for g in ("weekday", "weekend"):
            wet, dry = groups[(g, "rain")], groups[(g, "dry")]
            if len(wet) >= 10 and dry:
                rain_effect[g] = {
                    "factor": round(statistics.median(wet) / statistics.median(dry), 3),
                    "rainHours": len(wet),
                    "dryHours": len(dry),
                }

    # 공휴일 영향: 한국천문연구원 특일정보(data/holidays_2025.json)의 공휴일마다, 공연 없는 10–19시
    # 재차대수 합 / (같은 요일 기준표×월보정) 합을 구하고 명절(설날·추석)과 그 밖의 공휴일로 나눠 중앙값을 씀
    holiday_effect = None
    hol_path = os.path.join(ROOT, "data", "holidays_2025.json")
    if os.path.exists(hol_path):
        hol = {datetime.strptime(k, "%Y%m%d").date(): v for k, v in json.load(open(hol_path, encoding="utf-8")).items()}
        sums = defaultdict(lambda: [0.0, 0.0])
        for r in used:
            d, h = r["dt"].date(), r["dt"].hour
            if d not in hol or r["공연명"] or not (10 <= h <= 19):
                continue
            sums[d][0] += r["재차대수"]
            sums[d][1] += baseline[r["dt"].weekday()][h] * month_factor.get(d.month, 1.0)
        kinds = defaultdict(list)
        for d, (a, b) in sums.items():
            if b:
                kinds["major" if hol[d] in ("설날", "추석") else "other"].append(a / b)
        holiday_effect = {
            k: {"factor": round(statistics.median(v), 3), "days": len(v)} for k, v in sorted(kinds.items()) if len(v) >= 3
        }

    # 공연 시작 시각 기준 영향: 2025년 공연 일정(data/events_2025.json, 홈페이지 월별 목록)의 시작 시각을 읽어,
    # 공연장 규모·평일/주말별로 '시작 n시간 전후' 재차대수 / (같은 요일 기준표×월보정)의 중앙값을 구한다.
    # 15시 이후 시작하는 공연만, 그날 가장 큰 공연장의 가장 이른 시작을 기준으로 함
    show_profile = None
    ev_path = os.path.join(ROOT, "data", "events_2025.json")
    if os.path.exists(ev_path):
        sys.path.insert(0, os.path.dirname(__file__))
        from show_times import parse_starts

        def venue_scale(place):
            if "KSPO" in place or "체조" in place:
                return "large"
            if any(k in place for k in ("핸드볼", "라이브 아레나", "올림픽홀")):
                return "mid"
            return "small"

        order = {"small": 0, "mid": 1, "large": 2}
        starts = defaultdict(list)
        for e in json.load(open(ev_path, encoding="utf-8")):
            for d, ts in parse_starts(e["time"], e["begin"], e["end"]).items():
                for t in ts:
                    if int(t[:2]) >= 15:
                        starts[datetime.strptime(d, "%Y-%m-%d").date()].append((venue_scale(e["place"]), int(t[:2])))
        occ = defaultdict(dict)
        for r in used:
            occ[r["dt"].date()][r["dt"].hour] = r["재차대수"]
        ratios, days_n = defaultdict(list), defaultdict(int)
        for d, lst in starts.items():
            if d not in good_days or len(occ[d]) < 24:
                continue
            sc = max(lst, key=lambda x: order[x[0]])[0]
            s0 = min(h for k, h in lst if k == sc)
            wk = "weekend" if d.weekday() >= 5 else "weekday"
            days_n[(sc, wk)] += 1
            for off in range(-3, 6):
                h = s0 + off
                if h < 24:
                    b = baseline[d.weekday()][h] * month_factor.get(d.month, 1.0)
                    if b > 100:
                        ratios[(sc, wk, off)].append(occ[d][h] / b)
        show_profile = {}
        for (sc, wk), n in sorted(days_n.items()):
            if n < 8:  # 표본이 적으면 쓰지 않음
                continue
            f = {str(o): round(statistics.median(ratios[(sc, wk, o)]), 3) for o in range(-3, 6) if len(ratios[(sc, wk, o)]) >= 8}
            show_profile.setdefault(sc, {})[wk] = {"days": n, "factor": f}

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
        "rainEffect": rain_effect,
        "holidayEffect": holiday_effect,
        "showProfile": show_profile,
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
    print("공휴일 영향:", holiday_effect)
    print("공연 시작 기준 영향:", json.dumps(show_profile, ensure_ascii=False))
    print("공연 시간 평균 상승률:", site["showEffect"]["meanUplift"], "| 공연 수:", len(show_list))
    print("규모별 공연 영향(중앙값):", scale_uplift)
    print("비 영향:", rain_effect)
    print("토요일 기준표 10–20시:", baseline[5][10:21])
    for s in show_list[:5]:
        print("  ", s["name"][:30], s["dates"][:2], s["audience"], s["uplift"])


if __name__ == "__main__":
    main()
