"""Column-aware line reader for Tamil Nadu (Samacheer Kalvi) textbook PDFs.

The books are two-column. Lines come back left column first, then right column.
Fill-in blanks are drawn as short lines in the PDF; with blanks=True they become "______".
"""
import re

import fitz

fitz.TOOLS.mupdf_display_errors(False)
SLUG_RE = re.compile(r"([A-Za-z0-9_\-]+)\.indd")
OPTION_LABEL = re.compile(r"^\(?[a-dA-D][).]$")
NUM_LABEL = re.compile(r"^(?:\d{1,2}|[IVX]{1,4}|[ivx]{1,4}|\(?[a-d])[.)]?$")
BLANK = "______"


def page_slug(page):
    m = SLUG_RE.search(page.get_text())
    return m.group(1) if m else None


def blank_segments(page):
    W = page.rect.width
    out = []
    for dr in page.get_cdrawings():
        for it in dr["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if abs(a[1] - b[1]) > 1:
                    continue
                x0, x1, y = min(a[0], b[0]), max(a[0], b[0]), a[1]
            elif it[0] == "re":
                r = it[1]
                if r[3] - r[1] > 2:
                    continue
                x0, x1, y = r[0], r[2], r[1]
            else:
                continue
            if 15 < x1 - x0 < 160 and 20 < x0 and x1 < W - 20:
                out.append((x0, y - 5, x1, y - 1))
    return out


def page_rows(page, blanks=False):
    """[(text, y_fraction)] in reading order."""
    W, H = page.rect.width, page.rect.height
    mid = W / 2
    words = []
    for x0, y0, x1, y1, t, *_ in page.get_text("words"):
        if y0 < H * 0.035 or y1 > H * 0.955:
            continue
        words.append((0 if x0 < mid - 15 else 1, (y0 + y1) / 2, x0, x1, t))
    for x0, y0, x1, y1 in (blank_segments(page) if blanks else []):
        if H * 0.035 < y0 < H * 0.955:
            words.append((0 if x0 < mid - 15 else 1, (y0 + y1) / 2 - 2, x0, x1, BLANK))
    words.sort(key=lambda w: (w[0], w[1], w[2]))

    rows = []
    for w in words:
        if rows and rows[-1][0][0] == w[0] and abs(rows[-1][-1][1] - w[1]) < 4:
            rows[-1].append(w)
        else:
            rows.append([w])

    lines = []
    for r in rows:
        r.sort(key=lambda w: w[2])
        text = r[0][4]
        for a, b in zip(r, r[1:]):
            wide = b[2] - a[3] > 40 and BLANK not in (a[4], b[4]) and not OPTION_LABEL.match(b[4]) and not NUM_LABEL.match(a[4])
            text += f" {BLANK} " if wide else " "
            text += b[4]
        text = re.sub(r"\s+", " ", text).strip()
        if SLUG_RE.search(text) or re.search(r"\d+/\d+/\d{4}\s+\d+:\d+", text):
            continue
        lines.append((text, r[0][1] / H))
    return lines


def page_lines(page, blanks=False):
    return [t for t, _ in page_rows(page, blanks)]


def open_book(path):
    return fitz.open(path)
