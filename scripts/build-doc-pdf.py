#!/usr/bin/env python3
"""Render a docs/*.md file to a print-ready PDF beside it.

Usage:  python3 scripts/build-doc-pdf.py docs/ARCHITECTURE-OVERVIEW.md

Markdown is the source of truth; this only styles it. The app's own colour
tokens and type conventions are used so a printed document looks like it came
from the same system as the screens.

Any `![alt](something.svg)` is inlined and given its own LANDSCAPE page — the
diagrams are wide, and scaled into a portrait column their labels stop being
readable. Everything else stays portrait.

Needs: python `markdown`, and Google Chrome (headless, for print-to-pdf).
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
import base64
from pathlib import Path

import markdown

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
:root {
  --ground: #fbfbf9; --surface: #ffffff;
  --ink: #1c1c1a; --ink-2: #5f5e59; --ink-3: #6b6a65;
  --rule: #e9e9e4; --rule-strong: #dcdcd5;
  --brand: #2e5fd1; --brand-wash: #eaf0fd;
  --money: #8a6423; --money-wash: #faf2e4;
  --good: #10725a;  --good-wash: #e6f4f0;
}

@page          { size: A4; margin: 19mm 18mm 16mm; }
@page diagram  { size: A4 landscape; margin: 10mm; }

* { box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 10.2pt; line-height: 1.52;
  color: var(--ink); background: var(--surface);
  margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

h1 {
  font-size: 21pt; line-height: 1.18; font-weight: 700;
  letter-spacing: -0.3px; margin: 0 0 6pt;
}
h1 + p { color: var(--ink-2); font-size: 10.6pt; margin-top: 0; }

h2 {
  font-size: 14pt; font-weight: 700; margin: 20pt 0 7pt;
  padding-bottom: 5pt; border-bottom: 1.2pt solid var(--rule);
  break-after: avoid;
}
h3 {
  font-size: 11.2pt; font-weight: 700; color: var(--brand);
  margin: 14pt 0 4pt; break-after: avoid;
}

p, li { orphans: 2; widows: 2; }
p { margin: 0 0 7pt; }
ul, ol { margin: 0 0 7pt; padding-left: 15pt; }
li { margin-bottom: 3pt; }

strong { font-weight: 650; }
em { color: var(--ink-2); }

/* A horizontal rule in the markdown is a section break, not a drawn line. */
hr { border: 0; height: 0; margin: 14pt 0 0; }

table {
  width: 100%; border-collapse: collapse;
  margin: 8pt 0 12pt; font-size: 9.4pt;
  break-inside: avoid;
}
th {
  text-align: left; font-size: 7.6pt; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.7px; color: var(--ink-3);
  padding: 0 7pt 4pt; border-bottom: 1.2pt solid var(--rule-strong);
}
td {
  padding: 5pt 7pt; border-bottom: 0.8pt solid var(--rule);
  vertical-align: top;
}
/* Money column reads right-aligned; it is always the last one. */
td:last-child, th:last-child { text-align: right; white-space: nowrap; }
tr:last-child td {
  border-bottom: none; border-top: 1.2pt solid var(--rule-strong);
  background: var(--money-wash); font-weight: 650;
}

/* Each diagram gets a landscape page to itself.
   The cap must be an ABSOLUTE length: a percentage max-height resolves against
   a container with no definite height in paged media, so it does nothing and a
   tall diagram silently spills onto a second landscape page. A4 landscape less
   10mm margins leaves 785 x 538pt; 530pt keeps a hair of slack. */
.diagram {
  page: diagram;
  break-before: page; break-after: page;
  text-align: center;
}
.diagram svg {
  width: auto; height: auto;
  max-width: 100%; max-height: 530pt;
}

/* A screenshot sits inline with the step it illustrates — no page break, so a
   picture stays beside the sentence that sends you looking for it. */
.shot { margin: 10pt 0; break-inside: avoid; text-align: center; }
.shot img {
  max-width: 100%; max-height: 300pt;
  border: 0.5pt solid var(--rule); border-radius: 6pt;
}
.shot figcaption {
  margin-top: 4pt; font-size: 8pt; color: var(--ink-2); text-align: left;
}

blockquote {
  margin: 8pt 0; padding: 7pt 10pt;
  background: var(--brand-wash); border-radius: 8pt;
  color: var(--ink-2);
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9pt; background: var(--ground); padding: 1pt 3pt; border-radius: 3pt;
}
"""


def build(md_path: Path) -> Path:
    src = md_path.read_text(encoding="utf-8")

    # Pull the SVG references out before markdown runs, so the raw SVG is not
    # escaped. Each becomes its own landscape page.
    def inline_svg(match: re.Match[str]) -> str:
        svg_file = md_path.parent / match.group(2)
        if not svg_file.exists():
            raise SystemExit(f"diagram not found: {svg_file}")
        svg = svg_file.read_text(encoding="utf-8")
        svg = re.sub(r"<\?xml[^>]*\?>", "", svg).strip()
        # Let CSS size it; a fixed width/height would defeat the flex fit.
        svg = re.sub(r'\s(width|height)="\d+"', "", svg, count=2)
        return f'<div class="diagram">{svg}</div>'

    src = re.sub(r"!\[([^\]]*)\]\(([^)]+\.svg)\)", inline_svg, src)

    # Raster screenshots, inlined as data URIs for the same reason as the SVG
    # above: the HTML is written to a temp dir, so Chrome resolves no relative
    # path from here. A caption is the alt text, rendered under the figure.
    def inline_img(match: re.Match[str]) -> str:
        img_file = md_path.parent / match.group(2)
        if not img_file.exists():
            raise SystemExit(f"image not found: {img_file}")
        mime = "image/png" if img_file.suffix.lower() == ".png" else "image/jpeg"
        b64 = base64.b64encode(img_file.read_bytes()).decode("ascii")
        caption = match.group(1)
        cap = f"<figcaption>{caption}</figcaption>" if caption else ""
        return (
            f'<figure class="shot">'
            f'<img src="data:{mime};base64,{b64}" alt="{caption}">{cap}</figure>'
        )

    src = re.sub(r"!\[([^\]]*)\]\(([^)]+\.(?:png|jpg|jpeg))\)", inline_img, src)

    body = markdown.markdown(src, extensions=["tables", "smarty", "attr_list"])
    html = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{CSS}</style></head><body>{body}</body></html>"
    )

    out = md_path.with_suffix(".pdf")
    with tempfile.TemporaryDirectory() as tmp:
        # Chrome resolves nothing external here; everything is already inline.
        page = Path(tmp) / "page.html"
        page.write_text(html, encoding="utf-8")
        argv = [
            CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
            "--no-first-run", "--no-default-browser-check",
            "--disable-extensions", "--disable-sync",
            f"--print-to-pdf={out}", f"--user-data-dir={tmp}/chrome",
            page.as_uri(),
        ]
        # Chrome writes the PDF and then, on this machine, does not always exit.
        # The file landing is the real success signal, so a timeout is only a
        # failure if nothing was written — otherwise kill it and carry on.
        out.unlink(missing_ok=True)
        proc = subprocess.Popen(argv, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
        try:
            proc.wait(timeout=90)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        if not out.exists() or out.stat().st_size == 0:
            raise SystemExit("Chrome produced no PDF")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    if not Path(CHROME).exists():
        raise SystemExit(f"Chrome not found at {CHROME}")
    if shutil.which("python3") is None:
        raise SystemExit("python3 missing")
    result = build(Path(sys.argv[1]).resolve())
    print(f"wrote {result} ({result.stat().st_size // 1024} KB)")
