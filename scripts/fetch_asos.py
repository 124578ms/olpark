"""기상청 ASOS 시간자료(서울 108) 2025년 → data/asos_2025.csv

비 오는 시간대에 올림픽공원 주차가 얼마나 달라졌는지 계산하는 데 쓴다.
키: 환경변수 KMA_KEY 또는 .env의 KMA_KEY/기상청 (공공데이터포털 인증키)
사용법: python scripts/fetch_asos.py
"""
import csv, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date, timedelta

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "asos_2025.csv")
URL = "https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList"
START, END = date(2025, 1, 1), date(2025, 12, 31)


def key():
    if os.environ.get("KMA_KEY"):
        return os.environ["KMA_KEY"]
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        m = re.match(r"\s*(KMA_KEY|기상청)\s*=\s*(.*?)\s*$", line)
        if m:
            return m.group(2).strip("\"'")
    sys.exit(".env에 기상청 키가 없습니다")


def fetch(k, s, e):
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode(
            {
                "serviceKey": k,
                "pageNo": page,
                "numOfRows": 999,
                "dataType": "JSON",
                "dataCd": "ASOS",
                "dateCd": "HR",
                "startDt": s.strftime("%Y%m%d"),
                "startHh": "00",
                "endDt": e.strftime("%Y%m%d"),
                "endHh": "23",
                "stnIds": "108",
            }
        )
        for attempt in range(4):
            try:
                body = json.loads(urllib.request.urlopen(URL + "?" + q, timeout=60).read().decode("utf-8"))["response"]["body"]
                break
            except Exception as ex:  # noqa: BLE001
                print("  재시도", attempt + 1, type(ex).__name__, str(ex)[:60])
                time.sleep(3 * (attempt + 1))
        else:
            raise SystemExit(f"실패: {s}~{e}")
        items = body["items"]["item"]
        rows += items
        if page * 999 >= int(body["totalCount"]):
            return rows
        page += 1


def main():
    k = key()
    out = []
    s = START
    while s <= END:
        e = min(s + timedelta(days=30), END)
        got = fetch(k, s, e)
        print(s, "~", e, len(got), "건")
        out += got
        s = e + timedelta(days=1)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["datetime", "기온", "강수량", "습도", "적설"])
        for it in out:
            w.writerow([it["tm"], it.get("ta", ""), it.get("rn", ""), it.get("hm", ""), it.get("dsnw", "")])
    print("저장:", OUT, len(out), "시간")


if __name__ == "__main__":
    main()
