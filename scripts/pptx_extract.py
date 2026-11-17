#!/usr/bin/env python3
"""Extract a weekly-status .pptx into a JSON model (stdlib + python-pptx).

Output (stdout, single JSON object):
{
  "slides": [
    {"index": 1,
     "title": "PROJ1234 FE weekly meeting – WW46",
     "texts": ["...", "..."],                 # every text block, in shape order
     "status": "Green" | "Yellow" | null,     # parsed from "Status: xx"
     "tables": [{"rows": [["a","b"], ...]}],  # raw cell text, newlines -> space
     "bigPicture": true                        # >=4in picture present (dashboard shot)
    }, ...
  ]
}

Usage: python3 pptx_extract.py deck.pptx [--pretty]
"""
import json
import sys


def shape_texts(shape, out_texts, out_tables, out_pics):
    if getattr(shape, 'has_text_frame', False):
        txt = '\n'.join(p.text for p in shape.text_frame.paragraphs if p.text.strip())
        if txt.strip():
            out_texts.append(txt.strip())
    if getattr(shape, 'has_table', False):
        tb = shape.table
        rows = []
        for r in tb.rows:
            rows.append([c.text.replace('\n', ' ').strip() for c in r.cells])
        out_tables.append({'rows': rows})
    if getattr(shape, 'shape_type', None) == 13:      # PICTURE
        try:
            w_in = shape.width / 914400.0
            h_in = shape.height / 914400.0
            if max(w_in, h_in) >= 4:
                out_pics.append('%s %.1fx%.1fin' % (shape.name, w_in, h_in))
        except Exception:
            pass
    if getattr(shape, 'shape_type', None) == 6:       # GROUP
        for s in shape.shapes:
            shape_texts(s, out_texts, out_tables, out_pics)


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: pptx_extract.py deck.pptx [--pretty]')
    from pptx import Presentation

    pres = Presentation(sys.argv[1])
    slides = []
    for i, sl in enumerate(pres.slides, 1):
        texts, tables, pics = [], [], []
        for sh in sl.shapes:
            shape_texts(sh, texts, tables, pics)
        title = ''
        for t in texts:
            first = t.split('\n')[0].strip().replace('\x0b', ' ')
            if first and not first.isdigit() and '保密' not in first:
                title = first
                break
        status = None
        for t in texts:
            for line in t.split('\n'):
                low = line.strip().lower()
                if low.startswith('status:'):
                    val = line.split(':', 1)[1].strip()
                    if val:
                        status = val
        slides.append({'index': i, 'title': title, 'texts': texts,
                       'status': status, 'tables': tables,
                       'bigPicture': bool(pics)})

    out = {'slides': slides}
    print(json.dumps(out, ensure_ascii=False,
                     indent=1 if '--pretty' in sys.argv else None))


if __name__ == '__main__':
    main()
