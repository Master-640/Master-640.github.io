#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 BGFN 主播「白格」的像素头像 SVG。

网格 16x18，每格 5px，输出 80x90 的 <rect> 拼图。
改形象只要改下面的 GRID：H 头发 / F 脸 / E 眼 / G 眼镜 / M 嘴 / N 脖子 / S 西装 / W 衬衫 / T 领带
"""

from pathlib import Path

CELL = 5

GRID = [
    "......HHHH......",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "...HFFFFFFFFH...",
    "...HFFFFFFFFH...",
    "...HFFEFFEFFH...",
    "...HFFFFFFFFH...",
    "...HFFFMMFFFH...",
    "....FFFFFFFF....",
    "......NNNN......",
    "....SSSSSSSS....",
    "...SSSSSSSSSS...",
    "..SSSSSWWSSSSS..",
    "..SSSSWTTWSSSS..",
    "..SSSSWTTWSSSS..",
    "..SSSSWTTWSSSS..",
    "..SSSSSSSSSSSS..",
    "..SSSSSSSSSSSS..",
]

COLORS = {
    "H": "#2B3346",   # 头发，深蓝灰
    "F": "#FFDAB9",   # 皮肤
    "E": "#10192B",   # 眼睛
    "G": "#46536B",   # 眼镜框（当前未使用）
    "M": "#7A4A3E",   # 嘴
    "N": "#F0C09A",   # 脖子
    "S": "#1746B4",   # 西装
    "W": "#FFFFFF",   # 衬衫
    "T": "#0B2A6B",   # 领带
}


def build() -> str:
    w = len(GRID[0])
    h = len(GRID)
    for i, row in enumerate(GRID):
        assert len(row) == w, f"第 {i} 行长度 {len(row)}，应为 {w}"

    rects = []
    for y, row in enumerate(GRID):
        for x, ch in enumerate(row):
            color = COLORS.get(ch)
            if not color:
                continue
            rects.append(
                f'<rect x="{x * CELL}" y="{y * CELL}" width="{CELL}" height="{CELL}" fill="{color}"/>'
            )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * CELL} {h * CELL}" '
        f'width="{w * CELL}" height="{h * CELL}" shape-rendering="crispEdges" '
        f'role="img" aria-label="BGFN 主播白格的像素头像">\n'
        '  <g>\n    ' + "\n    ".join(rects) + "\n  </g>\n</svg>\n"
    )


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "assets" / "anchor.svg"
    out.write_text(build(), encoding="utf-8")
    print(f"written {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
