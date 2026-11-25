"""실시간·예보 데이터 → web/public/data/live.json (사이트가 기준표 예보 위에 겹쳐 보여줌).

- 한국체육산업개발 올림픽공원 실시간 주차현황: 동2·남2·북2문 주차 합계
- 기상청 단기예보(송파구 방이동 격자 62,126): 시간별 기온·강수확률·하늘·강수형태
- 서울시 실시간 도시데이터(올림픽공원 POI127): 지금 인구 혼잡도와 12시간 예측
- 한국체육산업개발 올림픽공원 공연/행사 일정(홈페이지 일정안내가 쓰는 월별 목록): 이번 달·다음 달 공연
- 기상청 중기예보(서울·인천·경기 육상, 서울 기온): 4–10일 뒤 오전·오후 강수확률과 날씨, 최저·최고기온
- 한국천문연구원 특일정보(공휴일): 이번 달·다음 달 공휴일 (기상청과 같은 공공데이터포털 키)

키는 환경변수(KMA_KEY, SEOUL_KEY)에서, 없으면 .env에서 읽는다.
실시간 주차현황은 기관이 공개한 공용 키 하나만 받는다(문화공공데이터광장에서 발급되는 키는
'올림픽공원운영현황' API용이라 이 주소에서는 401).
하나가 실패해도 나머지는 저장한다(그 항목은 null).
사용법: python scripts/fetch_live.py
"""
import json, os, re, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "web", "public", "data", "live.json")
KST = timezone(timedelta(hours=9))
# 기관 안내 페이지(ksponco.or.kr/pubData/64)에 공개된 공용 키. 이 API가 받는 유일한 키
PARKING_PUBLIC_KEY = "PARKING21803504"


def env_keys():
    found = {}
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            m = re.match(r"\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$", line)
            if m:
                found[m.group(1)] = m.group(2).strip("\"'")
    return {
        "kma": os.environ.get("KMA_KEY") or found.get("KMA_KEY") or found.get("기상청"),
        "seoul": os.environ.get("SEOUL_KEY") or found.get("SEOUL_KEY") or found.get("서울도시데이터"),
    }


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "olpark-forecast/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))


def parking():
    try:
        data = get_json("https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=" + PARKING_PUBLIC_KEY)
        return {"sum": int(data[0]["parking_sum"]), "gates": ["동2", "남2", "북2"]}
    except Exception as e:  # noqa: BLE001
        print("주차현황 실패:", type(e).__name__, str(e)[:80])
        return None


def kma(key, now):
    if not key:
        return None
    # 발표 시각(02,05,...,23시) 10분 뒤부터 조회 가능 → 15분 여유를 두고 가장 최근 발표분
    t = now - timedelta(minutes=15)
    base_hours = [2, 5, 8, 11, 14, 17, 20, 23]
    past = [h for h in base_hours if h <= t.hour]
    latest = t.replace(hour=past[-1]) if past else (t - timedelta(days=1)).replace(hour=23)
    # 최근 발표분은 발표 뒤 시간만 담고 있어, 오늘 이미 지난 시간은 어제 23시 발표분으로 채운다
    early = (now - timedelta(days=1)).replace(hour=23)
    bases = [early, latest] if latest.strftime("%Y%m%d%H") != early.strftime("%Y%m%d%H") else [latest]

    hours = {}
    for base in bases:  # 뒤의(최근) 발표가 앞의 값을 덮어씀
        q = urllib.parse.urlencode(
            {
                "serviceKey": key,
                "pageNo": 1,
                "numOfRows": 1500,
                "dataType": "JSON",
                "base_date": base.strftime("%Y%m%d"),
                "base_time": f"{base.hour:02d}00",
                "nx": 62,
                "ny": 126,
            }
        )
        try:
            items = get_json("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?" + q)["response"]["body"]["items"]["item"]
        except Exception as e:  # noqa: BLE001
            print("기상청 실패:", base.strftime("%m-%d %H시"), type(e).__name__, str(e)[:80])
            continue
        fresh = {}
        for it in items:
            if it["category"] not in ("TMP", "POP", "SKY", "PTY"):
                continue
            k = f'{it["fcstDate"][:4]}-{it["fcstDate"][4:6]}-{it["fcstDate"][6:]}T{it["fcstTime"][:2]}'
            fresh.setdefault(k, {})[it["category"].lower()] = it["fcstValue"]
        hours.update(fresh)
    if not hours:
        return None
    out = {}
    for k, v in sorted(hours.items()):
        out[k] = {
            "tmp": float(v["tmp"]) if "tmp" in v else None,
            "pop": int(v["pop"]) if "pop" in v else None,
            "sky": int(v.get("sky", 0)),  # 1 맑음 3 구름많음 4 흐림
            "pty": int(v.get("pty", 0)),  # 0 없음 1 비 2 비/눈 3 눈 4 소나기
        }
    base = latest
    return {"base": base.strftime("%Y-%m-%dT%H:00"), "hours": out}


def seoul(key):
    if not key:
        return None
    url = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(key)}/json/citydata_ppltn/1/5/" + urllib.parse.quote("올림픽공원")
    try:
        row = get_json(url)["SeoulRtd.citydata_ppltn"][0]
    except Exception as e:  # noqa: BLE001
        print("도시데이터 실패:", type(e).__name__, str(e)[:80])
        return None
    fc = [
        {
            "time": f["FCST_TIME"],
            "level": f["FCST_CONGEST_LVL"],
            "min": int(f["FCST_PPLTN_MIN"]),
            "max": int(f["FCST_PPLTN_MAX"]),
        }
        for f in (row.get("FCST_PPLTN") or [])
    ]
    return {
        "time": row.get("PPLTN_TIME"),
        "level": row["AREA_CONGEST_LVL"],
        "message": row.get("AREA_CONGEST_MSG"),
        "min": int(row["AREA_PPLTN_MIN"]),
        "max": int(row["AREA_PPLTN_MAX"]),
        "forecast": fc,
    }


EVENTS_URL = "https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoListAjax.es"
EVENT_VIEW = "https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoView.es?mid=a20301010100&evtSeq="


def events(now):
    """이번 달과 다음 달 공연 중 아직 끝나지 않은 것"""
    first = now.replace(day=1)
    months = [first, (first + timedelta(days=32)).replace(day=1)]
    seen, out = set(), []
    for m in months:
        body = json.dumps({"nowYM": m.strftime("%Y%m"), "plcCd": ""}).encode()
        req = urllib.request.Request(
            EVENTS_URL,
            data=body,
            headers={"Content-Type": "application/json;charset=UTF-8", "User-Agent": "olpark-forecast/1.0"},
        )
        try:
            data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            print("공연 일정 실패:", m.strftime("%Y-%m"), type(e).__name__, str(e)[:80])
            return None
        for it in data[0] + data[1]:
            seq = it.get("evtSeq")
            if seq in seen or not it.get("beginDt") or (it.get("endDt") or "") < now.strftime("%Y-%m-%d"):
                continue
            seen.add(seq)
            out.append(
                {
                    "title": " ".join((it.get("title") or "").split()),
                    "place": " ".join((it.get("plc") or "").split()),
                    "begin": it["beginDt"],
                    "end": it.get("endDt") or it["beginDt"],
                    "time": " ".join((it.get("tm") or "").split()),
                    "url": EVENT_VIEW + str(seq),
                }
            )
    return sorted(out, key=lambda e: (e["begin"], e["place"]))


def mid(key, now):
    """중기예보: 06시·18시 발표. 4–10일 뒤를 오전·오후 단위로 준다(단기예보가 끝나는 날부터 이어 붙임)."""
    if not key:
        return None
    t = now - timedelta(minutes=30)
    if t.hour >= 18:
        base = t.replace(hour=18)
    elif t.hour >= 6:
        base = t.replace(hour=6)
    else:
        base = (t - timedelta(days=1)).replace(hour=18)
    tm = base.strftime("%Y%m%d%H") + "00"

    def call(op, reg):
        q = urllib.parse.urlencode({"serviceKey": key, "regId": reg, "tmFc": tm, "dataType": "JSON", "numOfRows": 10, "pageNo": 1})
        items = get_json("https://apis.data.go.kr/1360000/MidFcstInfoService/" + op + "?" + q)["response"]["body"]["items"]["item"]
        return items[0] if isinstance(items, list) else items

    try:
        land = call("getMidLandFcst", "11B00000")  # 서울·인천·경기 육상
        ta = call("getMidTa", "11B10101")  # 서울 기온
    except Exception as e:  # noqa: BLE001
        print("중기예보 실패:", type(e).__name__, str(e)[:80])
        return None
    num = lambda v: None if v in (None, "") else int(float(v))
    days = {}
    for n in range(3, 11):
        if f"wf{n}Am" not in land and f"wf{n}" not in land:
            continue
        d = (base + timedelta(days=n)).strftime("%Y-%m-%d")
        days[d] = {
            "popAm": num(land.get(f"rnSt{n}Am", land.get(f"rnSt{n}"))),
            "popPm": num(land.get(f"rnSt{n}Pm", land.get(f"rnSt{n}"))),
            "wfAm": land.get(f"wf{n}Am", land.get(f"wf{n}", "")),
            "wfPm": land.get(f"wf{n}Pm", land.get(f"wf{n}", "")),
            "taMin": num(ta.get(f"taMin{n}")),
            "taMax": num(ta.get(f"taMax{n}")),
        }
    return {"tmFc": tm, "days": days}


def holidays(key, now):
    if not key:
        return None
    out = []
    first = now.replace(day=1)
    for m in (first, (first + timedelta(days=32)).replace(day=1)):
        q = urllib.parse.urlencode(
            {"serviceKey": key, "solYear": m.year, "solMonth": "%02d" % m.month, "_type": "json", "numOfRows": 50}
        )
        try:
            data = get_json("https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?" + q)
            items = data["response"]["body"].get("items") or {}
            item = items.get("item", []) if isinstance(items, dict) else []
            for x in [item] if isinstance(item, dict) else item:  # 한 건이면 목록이 아니라 객체로 옴
                if x.get("isHoliday") == "Y":
                    d = str(x["locdate"])
                    out.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "name": x["dateName"]})
        except Exception as e:  # noqa: BLE001
            print("공휴일 실패:", m.strftime("%Y-%m"), type(e).__name__, str(e)[:80])
            return None
    return out


def main():
    now = datetime.now(KST)
    keys = env_keys()
    live = {
        "updatedAt": now.strftime("%Y-%m-%dT%H:%M"),
        "parking": parking(),
        "weather": kma(keys["kma"], now),
        "mid": mid(keys["kma"], now),
        "people": seoul(keys["seoul"]),
        "events": events(now),
        "holidays": holidays(keys["kma"], now),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(live, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    w = live["weather"]
    p = live["people"]
    print("저장:", OUT)
    print("주차:", live["parking"])
    print("날씨:", w and f'{w["base"]} 발표, {len(w["hours"])}시간')
    print("공연:", live["events"] and [(e["begin"], e["place"], e["title"][:20]) for e in live["events"][:6]])
    print("중기예보:", live["mid"] and sorted(live["mid"]["days"]))
    print("공휴일:", live["holidays"])
    print("인구:", p and f'{p["level"]} {p["min"]}–{p["max"]}명, 예측 {len(p["forecast"])}개')


if __name__ == "__main__":
    main()
