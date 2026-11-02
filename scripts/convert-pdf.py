"""Render the supplied PDF plan as a vector image for the photo marker canvas."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.tools' / 'pdf'))
import pymupdf

with pymupdf.open(root / 'source' / 'floor-plan.pdf') as document:
    if len(document) != 1:
        raise ValueError('Expected a single-page floor plan PDF')
    page = document[0]
    (root / 'public' / 'floor-plan-pdf.svg').write_text(
        page.get_svg_image(text_as_path=True), encoding='utf-8')
    page.get_pixmap(matrix=pymupdf.Matrix(1, 1), alpha=False).save(
        root / 'source' / 'plan-preview.png')
    print(f'Converted PDF plan: {page.rect.width:g} x {page.rect.height:g} pt')
