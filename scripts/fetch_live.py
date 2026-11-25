"""실시간·예보 데이터 → web/public/data/live.json (사이트가 기준표 예보 위에 겹쳐 보여줌).

- 한국체육산업개발 올림픽공원 실시간 주차현황: 동2·남2·북2문 주차 합계
- 기상청 단기예보(송파구 방이동 격자 62,126): 시간별 기온·강수확률·하늘·강수형태
- 서울시 실시간 도시데이터(올림픽공원 POI127): 지금 인구 혼잡도와 12시간 예측

키는 환경변수(KMA_KEY, SEOUL_KEY, PARKING_KEY)에서, 없으면 .env에서 읽는다.
하나가 실패해도 나머지는 저장한다(그 항목은 null).
사용법: python scripts/fetch_live.py
"""
import json, os, re, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "web", "public", "data", "live.json")
KST = timezone(timedelta(hours=9))
# 기관 안내 페이지(ksponco.or.kr/pubData/64)에 공개된 키. 개별 발급 키가 안 될 때 쓴다
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
        "parking": os.environ.get("PARKING_KEY") or found.get("PARKING_KEY") or found.get("올림픽공원주차현황"),
    }


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "olpark-forecast/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))


def parking(key):
    for k in [key, PARKING_PUBLIC_KEY]:
        if not k:
            continue
        try:
            data = get_json("https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=" + urllib.parse.quote(k))
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
    base = t.replace(hour=past[-1]) if past else (t - timedelta(days=1)).replace(hour=23)
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
        print("기상청 실패:", type(e).__name__, str(e)[:80])
        return None
    hours = {}
    for it in items:
        if it["category"] not in ("TMP", "POP", "SKY", "PTY", "PCP"):
            continue
        k = f'{it["fcstDate"][:4]}-{it["fcstDate"][4:6]}-{it["fcstDate"][6:]}T{it["fcstTime"][:2]}'
        hours.setdefault(k, {})[it["category"].lower()] = it["fcstValue"]
    out = {}
    for k, v in sorted(hours.items()):
        out[k] = {
            "tmp": float(v["tmp"]) if "tmp" in v else None,
            "pop": int(v["pop"]) if "pop" in v else None,
            "sky": int(v.get("sky", 0)),  # 1 맑음 3 구름많음 4 흐림
            "pty": int(v.get("pty", 0)),  # 0 없음 1 비 2 비/눈 3 눈 4 소나기
        }
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


def main():
    now = datetime.now(KST)
    keys = env_keys()
    live = {
        "updatedAt": now.strftime("%Y-%m-%dT%H:%M"),
        "parking": parking(keys["parking"]),
        "weather": kma(keys["kma"], now),
        "people": seoul(keys["seoul"]),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(live, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    w = live["weather"]
    p = live["people"]
    print("저장:", OUT)
    print("주차:", live["parking"])
    print("날씨:", w and f'{w["base"]} 발표, {len(w["hours"])}시간')
    print("인구:", p and f'{p["level"]} {p["min"]}–{p["max"]}명, 예측 {len(p["forecast"])}개')


if __name__ == "__main__":
    main()
