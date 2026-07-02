#!/usr/bin/env python
"""Import the coach's Excel routines into backend/src/data/routine-templates.json.

The Excels in docs/routine-templates-src/ are the LITERAL source of truth for
routine generation (template-first architecture). Re-run whenever the coach
hands over updated planillas:

    .local/xlsxvenv/bin/python backend/scripts/import-routine-templates.py

Requires the dev postgres up (exercise_id resolution) and the xlsxvenv
(openpyxl). Fails loudly if any exercise name doesn't match the catalog.
"""
import glob
import json
import os
import re
import subprocess
import sys
import unicodedata

import openpyxl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC_DIR = os.path.join(ROOT, 'docs', 'routine-templates-src')
OUT_PATH = os.path.join(ROOT, 'backend', 'src', 'data', 'routine-templates.json')
DB_URL = os.environ.get('DATABASE_URL', 'postgres://user:password@localhost:5433/mydb')

DAY_TOKENS = {
    'LUN': 'lun', 'LUNES': 'lun',
    'MAR': 'mar', 'MARTES': 'mar',
    'MIE': 'mie', 'MIER': 'mie', 'MIERCOLES': 'mie',
    'JUE': 'jue', 'JUEVES': 'jue',
    'VIE': 'vie', 'VIER': 'vie', 'VIERNES': 'vie',
    'SAB': 'sab', 'SABADO': 'sab', 'SABADOS': 'sab',
    'DOM': 'dom', 'DOMINGO': 'dom',
}


def norm(s: str) -> str:
    s = unicodedata.normalize('NFD', s.strip().lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def load_catalog():
    out = subprocess.run(
        ['psql', DB_URL, '-tA', '-F', '\t', '-c',
         'SELECT id, name, is_principal, muscle_group FROM exercises'],
        capture_output=True, text=True, check=True,
    )
    catalog = {}
    for line in out.stdout.strip().split('\n'):
        if not line:
            continue
        ex_id, name, is_principal, mg = line.split('\t')
        catalog[norm(name)] = {
            'id': int(ex_id),
            'name': name,
            'is_principal': is_principal == 't',
            'muscle_group': mg,
        }
    return catalog


def parse_filename(fname: str):
    up = fname.upper()
    gender = 'female' if 'MUJER' in up else 'male'
    m = re.search(r'(\d)\s*DIAS', up)
    if not m:
        raise ValueError(f'cannot parse days from: {fname}')
    days = int(m.group(1))
    leg_days = None
    if gender == 'male':
        lm = re.search(r'(\d)\s*DIAS?\s*(?:DE\s*)?PIERNAS?', up)
        leg_days = int(lm.group(1)) if lm else 1
    schedules = []
    paren = re.search(r'\(([^)]*)\)', fname)
    if paren:
        for combo in re.split(r'[_/]', paren.group(1)):
            toks = [t.strip().upper() for t in combo.strip().split('-')]
            mapped = [DAY_TOKENS.get(t) for t in toks]
            if mapped and all(mapped):
                schedules.append(mapped)
    return gender, days, leg_days, schedules


def fmt_num(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def derive_role(group: str, ex: dict, series, reps) -> str:
    if norm(group) == 'calentamiento':
        return 'calentamiento'
    if ex['is_principal'] and series == 3 and reps in ('6 a 8', '6'):
        return 'principal'
    return 'accesorio'


def parse_workbook(path: str, catalog: dict):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb['Entrenamiento']
    days = {}
    current_day = None
    unmatched = []
    for row in ws.iter_rows(min_row=1, max_row=200, max_col=12, values_only=True):
        head = row[0] if isinstance(row[0], str) else ''
        if 'BLOQUE 2' in head.upper():
            break
        dm = re.match(r'\s*DIA\s+(\d+)\s*-\s*BLOQUE\s*1', head, re.IGNORECASE)
        if dm:
            current_day = int(dm.group(1))
            days.setdefault(current_day, [])
            continue
        if current_day is None:
            continue
        group, ex_name = row[0], row[1]
        if not (isinstance(group, str) and isinstance(ex_name, str)):
            continue
        group, ex_name = group.strip(), ex_name.strip()
        if not group or not ex_name or group == 'Grupo Muscular':
            continue
        ex = catalog.get(norm(ex_name))
        if not ex:
            unmatched.append(ex_name)
            continue
        try:
            series = int(float(row[4])) if row[4] is not None else None
        except (ValueError, TypeError):
            if norm(group) == 'calentamiento':
                # Coach typo (e.g. series='M'); warmup prescription is owned
                # by the engine anyway — keep the slot.
                series = None
            else:
                print(f'  ! skipping row with non-numeric series: {ex_name!r} series={row[4]!r}')
                continue
        reps = fmt_num(row[5])
        rir = fmt_num(row[9])
        rir = None if rir in (None, '-') else rir
        descanso = fmt_num(row[10])
        descanso = None if descanso in (None, '-') else descanso
        notes = row[11].strip() if isinstance(row[11], str) and row[11].strip() else None
        days[current_day].append({
            'exercise_id': ex['id'],
            'exercise_name': ex['name'],
            'muscle_group': ex['muscle_group'],
            'role': derive_role(group, ex, series, reps),
            'series': series,
            'reps': reps,
            'rir': rir,
            'descanso': descanso,
            'notes': notes,
        })
    filled = {d: slots for d, slots in days.items() if slots}
    return filled, unmatched


def day_focus(slots):
    seen, order = set(), []
    for s in slots:
        if s['role'] == 'calentamiento':
            continue
        base = s['muscle_group'].split('-')[0].strip()
        if base not in seen:
            seen.add(base)
            order.append(base)
    return ' / '.join(order)


def main():
    catalog = load_catalog()
    files = sorted(glob.glob(os.path.join(SRC_DIR, 'APP RUTINA*.xlsx')))
    if not files:
        sys.exit(f'no Excels found in {SRC_DIR}')
    templates, errors = [], []
    for f in files:
        fname = os.path.basename(f)
        gender, days, leg_days, schedules = parse_filename(fname)
        parsed, unmatched = parse_workbook(f, catalog)
        if unmatched:
            errors.append(f'{fname}: unmatched exercises: {sorted(set(unmatched))}')
            continue
        if len(parsed) != days:
            errors.append(f'{fname}: filename says {days} days but sheet has {sorted(parsed)}')
            continue
        templates.append({
            'source': fname,
            'gender': gender,
            'days': days,
            'leg_days': leg_days,
            'schedules': schedules,
            'days_detail': [
                {'focus': day_focus(parsed[d]), 'slots': parsed[d]}
                for d in sorted(parsed)
            ],
        })
    if errors:
        sys.exit('IMPORT FAILED:\n' + '\n'.join(errors))
    templates.sort(key=lambda t: (t['gender'], t['days'], t['leg_days'] or 0, t['source']))
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        json.dump(templates, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    for t in templates:
        slot_counts = [len(d['slots']) for d in t['days_detail']]
        print(f"{t['gender']:6} {t['days']}d legs={t['leg_days']} slots/day={slot_counts} "
              f"schedules={len(t['schedules'])}  ← {t['source'][:60]}")
    print(f'\nWrote {len(templates)} templates to {OUT_PATH}')


if __name__ == '__main__':
    main()
