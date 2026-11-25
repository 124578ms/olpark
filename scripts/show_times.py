"""공연 일정의 시간 글(자유 형식)에서 날짜별 시작 시각을 읽는다.

예) '2026년 11월 27일(금) 오후 7시 2026년 11월 28일(토) 오후 6시'
    '2026.12.18. FRI 7PM / 12.19 SAT 6PM'
    '수목금 19시 30분 / 토 15시, 19시 / 일 14시'
    '목 오후 7시 30분 / 금 오후 6시'
    '19시 30분'
읽지 못하면 빈 dict (사이트는 2025년 공연 기록이 몰린 16–20시를 그대로 씀)
"""
import re
from datetime import date, timedelta

WEEK = "월화수목금토일"
WEEK_EN = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3, "FRI": 4, "SAT": 5, "SUN": 6}

# 시각: '오후 7시 30분', '19시 30분', '7:30PM', '8PM', '09:00:00PM', '18:00', '6시'
TIME_RE = re.compile(
    r"(?P<ap>오전|오후|낮|저녁|밤)?\s*(?P<h>\d{1,2})\s*(?:(?:시\s*(?:(?P<m1>\d{1,2})\s*분|반)?)|(?::(?P<m2>\d{2})(?::\d{2})?)\s*(?P<ap2>[AaPp][Mm])?|\s*(?P<ap3>[AaPp][Mm]))"
)
# 날짜: '2026년 11월 27일', '12월 5일', '2026.12.18.', '12.19', '12.24(목)'
DATE_RE = re.compile(r"(?:(?P<y>20\d{2})\s*[년.]\s*)?(?P<mo>\d{1,2})\s*(?:월\s*|\.)\s*(?P<d>\d{1,2})\s*일?(?=\D|$)")


def _times(text):
    out = []
    for m in TIME_RE.finditer(text):
        h = int(m.group("h"))
        mi = int(m.group("m1") or m.group("m2") or (30 if "반" in m.group(0) else 0))
        ap = (m.group("ap") or "") + (m.group("ap2") or m.group("ap3") or "").upper()
        if h > 24 or mi > 59:
            continue
        if ("오후" in ap or "저녁" in ap or "밤" in ap or "PM" in ap) and h < 12:
            h += 12
        elif not ap and 1 <= h <= 10:
            h += 12  # 공연은 저녁: '6시'는 18시로
        if 9 <= h <= 23:
            out.append(f"{h:02d}:{mi:02d}")
    # 글이 잘려 '오후 5'처럼 끝난 경우
    tail = re.search(r"(오후|저녁)\s*(\d{1,2})\s*$", text)
    if tail and not out:
        h = int(tail.group(2))
        out.append(f"{h + 12 if h < 12 else h:02d}:00")
    return out


def _days(begin, end):
    d = begin
    while d <= end:
        yield d
        d += timedelta(days=1)


def parse_starts(text, begin, end):
    """text: 시간 글, begin/end: 'YYYY-MM-DD'. 반환: {'YYYY-MM-DD': ['HH:MM', ...]}"""
    b, e = date.fromisoformat(begin), date.fromisoformat(end)
    text = " ".join((text or "").split())
    if not text:
        return {}
    out = {}

    # 1) 날짜가 적힌 형식: 날짜 뒤부터 다음 날짜 전까지의 시각
    dates = [m for m in DATE_RE.finditer(text) if 1 <= int(m.group("mo")) <= 12 and 1 <= int(m.group("d")) <= 31]
    # 시각(19:30, 7.5 같은)과 헷갈리지 않게, 공연 기간 안의 날짜만 인정
    found = []
    for m in dates:
        mo, dd = int(m.group("mo")), int(m.group("d"))
        y = int(m.group("y")) if m.group("y") else None
        for cand in ([y] if y else [b.year, e.year]):
            try:
                d = date(cand, mo, dd)
            except ValueError:
                continue
            if b <= d <= e:
                found.append((m, d))
                break
    if found:
        for i, (m, d) in enumerate(found):
            seg = text[m.end() : found[i + 1][0].start() if i + 1 < len(found) else len(text)]
            seg = re.sub(r"\((?:[월화수목금토일]|[A-Za-z]{3})\)", " ", seg)  # 요일 괄호 제거
            ts = _times(seg)
            if ts:
                out[d.isoformat()] = ts
        return out

    # 2) 요일 형식: '수목금 19시 30분 / 토 15시, 19시 / 일 14시'
    rules = {}
    for seg in re.split(r"[/|,]\s*(?=[월화수목금토일]|평일|주말|(?:MON|TUE|WED|THU|FRI|SAT|SUN))", text):
        head = re.match(r"\s*((?:[월화수목금토일]\s*,?\s*|평일\s*|주말\s*|(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s*)+)", seg)
        ts = _times(seg[head.end():] if head else seg)
        if not ts:
            continue
        if not head:
            rules.setdefault("all", []).extend(ts)
            continue
        h = head.group(1)
        wd = {WEEK.index(c) for c in h if c in WEEK}
        wd |= {WEEK_EN[k] for k in WEEK_EN if k in h}
        if "평일" in h:
            wd |= {0, 1, 2, 3, 4}
        if "주말" in h:
            wd |= {5, 6}
        for w in wd:
            rules.setdefault(w, []).extend(ts)
    for d in _days(b, e):
        ts = rules.get(d.weekday()) or rules.get("all")
        if ts:
            out[d.isoformat()] = sorted(set(ts))
    return out


if __name__ == "__main__":
    import json, os, sys

    sys.stdout.reconfigure(encoding="utf-8")
    live = json.load(open(os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "live.json"), encoding="utf-8"))
    for ev in live.get("events") or []:
        print(ev["place"][:12], "|", ev["time"][:70])
        print("   →", parse_starts(ev["time"], ev["begin"], ev["end"]))
