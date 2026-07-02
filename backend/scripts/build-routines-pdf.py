"""Combine docs/routine-samples/*.md into one coach-shareable PDF."""
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

SRC = Path('/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/docs/routine-samples')
OUT = SRC / 'rutinas-generadas-IA.pdf'

ORDER = [
    'mujer-3d', 'mujer-4d', 'mujer-5d',
    'hombre-3d-1p', 'hombre-3d-2p',
    'hombre-4d-1p', 'hombre-4d-2p',
    'hombre-5d-1p', 'hombre-5d-2p',
    'mujer-4d-principiante', 'hombre-4d-1p-rodilla', 'mujer-3d-45min',
]

styles = getSampleStyleSheet()
H1 = ParagraphStyle('H1x', parent=styles['Title'], fontSize=20, spaceAfter=6)
H3 = ParagraphStyle('H3x', parent=styles['Heading2'], fontSize=13,
                    spaceBefore=14, spaceAfter=4, textColor=colors.HexColor('#1a3d6e'))
META = ParagraphStyle('meta', parent=styles['Normal'], fontSize=9.5, leading=13)
RATIO = ParagraphStyle('ratio', parent=styles['Normal'], fontSize=8.5,
                       leading=11.5, textColor=colors.HexColor('#444444'))
NOTE = ParagraphStyle('note', parent=styles['Italic'], fontSize=8.5,
                      leading=11, textColor=colors.HexColor('#666666'))
CELL = ParagraphStyle('cell', parent=styles['Normal'], fontSize=8, leading=10)
CELLB = ParagraphStyle('cellb', parent=CELL, fontName='Helvetica-Bold')
HEAD = ParagraphStyle('head', parent=CELL, fontName='Helvetica-Bold',
                      textColor=colors.white)
COVER_LINE = ParagraphStyle('cover', parent=styles['Normal'], fontSize=11, leading=18)


def parse_md(path: Path):
    """Split a sample file into (title, meta_lines, note, days[(heading, rows)])."""
    lines = path.read_text(encoding='utf-8').splitlines()
    title, metas, note = '', [], ''
    days, cur_head, cur_rows = [], None, []
    for ln in lines:
        if ln.startswith('# '):
            title = ln[2:].strip()
        elif ln.startswith('- **'):
            metas.append(re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', ln[2:].strip()))
        elif ln.startswith('> '):
            note = ln[2:].strip()
        elif ln.startswith('### '):
            if cur_head:
                days.append((cur_head, cur_rows))
            cur_head, cur_rows = ln[4:].strip(), []
        elif ln.startswith('|') and cur_head:
            cells = [c.strip() for c in ln.strip().strip('|').split('|')]
            if all(set(c) <= set('-: ') for c in cells):
                continue  # separator row
            cur_rows.append(cells)
    if cur_head:
        days.append((cur_head, cur_rows))
    return title, metas, note, days


def day_table(rows):
    header = [Paragraph(h, HEAD) for h in rows[0]]
    body = []
    for r in rows[1:]:
        role = r[1] if len(r) > 1 else ''
        style = CELLB if role == 'principal' else CELL
        body.append([Paragraph(c or '', style) for c in r])
    widths = [9*mm, 24*mm, 36*mm, 72*mm, 15*mm, 21*mm, 24*mm, 62*mm]
    t = Table([header] + body, colWidths=widths, repeatRows=1)
    zebra = [('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f2f5fa'))
             for i in range(1, len(body) + 1, 2)]
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a3d6e')),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#c9d3e0')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        *zebra,
    ]))
    return t


story = []
# Cover
story.append(Spacer(1, 40*mm))
story.append(Paragraph('Rutinas generadas por IA', H1))
story.append(Paragraph('Muestras para revisión del entrenador', styles['Heading2']))
story.append(Spacer(1, 8*mm))
story.append(Paragraph(
    'Cada rutina fue generada automáticamente con el catálogo real de ejercicios '
    'de la app, tal como la recibiría un atleta con ese perfil (antes de tu revisión '
    'en la cola de pendientes). En los ejercicios <b>principales</b> las series, '
    'repeticiones y descansos los fija la periodización de 30 semanas; la prescripción '
    'que se ve acá es la de los accesorios.', COVER_LINE))
story.append(Spacer(1, 8*mm))
story.append(Paragraph('<b>Contenido</b>', COVER_LINE))
for i, key in enumerate(ORDER, 1):
    t, *_ = parse_md(SRC / f'{key}.md')
    story.append(Paragraph(f'{i}. {t}', COVER_LINE))
story.append(PageBreak())

for i, key in enumerate(ORDER):
    title, metas, note, days = parse_md(SRC / f'{key}.md')
    story.append(Paragraph(title, H1))
    for m in metas:
        # keep profile line; compact the generation metadata
        story.append(Paragraph(m, RATIO if m.startswith('<b>Rationale') else META))
    if note:
        story.append(Spacer(1, 2*mm))
        story.append(Paragraph(note, NOTE))
    for head, rows in days:
        story.append(Paragraph(head, H3))
        if rows:
            story.append(day_table(rows))
    if i < len(ORDER) - 1:
        story.append(PageBreak())

doc = SimpleDocTemplate(
    str(OUT), pagesize=landscape(A4),
    leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm,
    title='Rutinas generadas por IA — muestras para revisión',
)
doc.build(story)
print(f'Wrote {OUT}')
