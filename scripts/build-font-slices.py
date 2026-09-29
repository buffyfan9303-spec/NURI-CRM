# SUIT Variable 글꼴 슬라이스 생성 (2026-09-29 성능 작업). 실행: py -3.12 scripts/build-font-slices.py <원본 SUIT-Variable.woff2>
#   원본(wght 100~900, 624KB)은 git 이력에 있다: git show 9cd5df1:nuri-crm-next/public/fonts/SUIT-Variable.woff2 > SUIT-Variable.woff2
#   필요: pip install fonttools brotli
# 산출(public/fonts/):
#   SUIT-400-700-ui.woff2   wght 400~700 가변, 라틴·기호 + 앱 UI 문자열(app/components/lib 의 .ts/.tsx, 주석 제외)이 쓰는 한글 음절
#   SUIT-400-700-ext.woff2  wght 400~700 가변, 나머지 한글 음절(고객 이름 등 데이터에만 나오는 글자 — 필요할 때만 내려받음)
#   SUIT-800-latin.woff2    wght 800 정적, 라틴만(로그인 로고 "NURI CRM" font-extrabold)
#   font-unicode-range-ui.txt  ui 슬라이스의 unicode-range (globals.css @font-face 에 붙여 넣는다)
# 새 UI 문구에 처음 나오는 음절은 ext 슬라이스(235KB)를 내려받게 되므로, UI 문구를 많이 바꾼 뒤엔 다시 돌려 ui 슬라이스를 갱신한다.
import os, re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "fonts")
src = sys.argv[1]

chars = set()
for top in ("app", "components", "lib"):
    for dp, _, fs in os.walk(os.path.join(ROOT, top)):
        for f in fs:
            if not f.endswith((".ts", ".tsx")) or f.endswith((".test.ts", ".test.tsx")):
                continue
            s = open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read()
            s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
            s = re.sub(r"(?m)^\s*//.*$", "", s)
            s = re.sub(r"(?m)(?<=[;{}),])\s*//.*$", "", s)
            chars.update(c for c in s if 0xAC00 <= ord(c) <= 0xD7A3)

def save_subset(font_path, dst, unicodes):
    opts = subset.Options(flavor="woff2", glyph_names=False, notdef_outline=True, layout_features=["*"], name_IDs=["*"], hinting=False)
    f = subset.load_font(font_path, opts)
    s = subset.Subsetter(opts)
    s.populate(unicodes=unicodes)
    s.subset(f)
    subset.save_font(f, dst, opts)
    f.close()
    return os.path.getsize(dst)

v = instancer.instantiateVariableFont(TTFont(src), {"wght": (400, 700)}); v.flavor = None; v.save("_v.ttf"); v.close()
e = instancer.instantiateVariableFont(TTFont(src), {"wght": 800}); e.flavor = None; e.save("_e.ttf"); e.close()
_vf = TTFont("_v.ttf"); cmap = _vf.getBestCmap(); _vf.close()
ui = sorted(ord(c) for c in chars if ord(c) in cmap)
non_hangul = sorted(c for c in cmap if not (0xAC00 <= c <= 0xD7A3))
ext = sorted(c for c in cmap if 0xAC00 <= c <= 0xD7A3 and c not in set(ui))
print("ui hangul", len(ui), "ext hangul", len(ext), "missing in font", sorted(c for c in chars if ord(c) not in cmap))
print("ui  ", save_subset("_v.ttf", os.path.join(OUT, "SUIT-400-700-ui.woff2"), non_hangul + ui))
print("ext ", save_subset("_v.ttf", os.path.join(OUT, "SUIT-400-700-ext.woff2"), ext))
latin = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20A9]
print("800 ", save_subset("_e.ttf", os.path.join(OUT, "SUIT-800-latin.woff2"), latin))

def ranges(cps):
    cps = sorted(set(cps)); out = []; a = b = cps[0]
    for c in cps[1:]:
        if c == b + 1: b = c
        else: out.append((a, b)); a = b = c
    out.append((a, b)); return out
txt = ", ".join(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in ranges(non_hangul + ui))
open(os.path.join(OUT, "font-unicode-range-ui.txt"), "w").write(txt + "\n")
print("ui unicode-range entries:", txt.count(",") + 1)
for t in ("_v.ttf", "_e.ttf"):
    try: os.remove(t)
    except OSError: pass
