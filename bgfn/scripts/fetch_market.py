#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BGFN 每日行情抓取。

数据源：腾讯行情 qt.gtimg.cn，无需 key。
A 股与美股指数各取收盘价，算出涨跌幅，写进 data/。
文案不在这里生成，交给前端 app.js，改语气不用重抓。
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# 代码 -> (中文名, 市场)
SYMBOLS = {
    "sh000001": ("上证指数", "cn"),
    "sz399001": ("深证成指", "cn"),
    "sz399006": ("创业板指", "cn"),
    "usINX": ("标普500", "us"),
    "usIXIC": ("纳斯达克", "us"),
    "usDJI": ("道琼斯", "us"),
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def fetch_raw() -> str:
    url = "https://qt.gtimg.cn/q=" + ",".join(SYMBOLS)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("gbk", errors="replace")


def parse(raw: str) -> list[dict]:
    out = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or "=" not in line:
            continue
        code = line.split("=", 1)[0].replace("v_", "").strip()
        if code not in SYMBOLS:
            continue
        body = line.split("=", 1)[1].strip().strip('";')
        f = body.split("~")
        if len(f) < 33:
            continue

        def num(idx: int) -> float:
            try:
                return float(f[idx])
            except (ValueError, IndexError):
                return 0.0

        name, market = SYMBOLS[code]
        out.append({
            "code": code,
            "name": name,
            "market": market,
            "value": num(3),
            "prev_close": num(4),
            "change": num(31),
            "pct": num(32),
            "quoted_at": f[30].strip(),
        })
    return out


def main() -> int:
    raw = fetch_raw()
    items = parse(raw)
    if not items:
        print("没有解析到任何指数，原始返回片段：", file=sys.stderr)
        print(raw[:500], file=sys.stderr)
        return 1

    today = datetime.now(timezone.utc).astimezone().date().isoformat()
    payload = {
        "date": today,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": "腾讯行情 qt.gtimg.cn",
        "indices": items,
    }

    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / f"brief-{today}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "latest.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # 往期索引，最多留 120 期
    index_path = DATA / "index.json"
    dates: list[str] = []
    if index_path.exists():
        try:
            dates = json.loads(index_path.read_text(encoding="utf-8")).get("dates", [])
        except Exception:
            dates = []
    if today not in dates:
        dates.insert(0, today)
    dates = sorted(set(dates), reverse=True)[:120]
    index_path.write_text(json.dumps({"dates": dates}, ensure_ascii=False, indent=2), encoding="utf-8")

    for it in items:
        print(f"{it['name']:>8}  {it['value']:>10.2f}  {it['pct']:+.2f}%   {it['quoted_at']}")
    print(f"\n写入 data/latest.json 与 data/brief-{today}.json，历史 {len(dates)} 期")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
