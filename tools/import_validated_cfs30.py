#!/usr/bin/env python3
"""Merge independently validated CFS 30 questions without changing the source bank."""
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REVIEWS = Path('/home/ubuntu/Downloads/cfs30-inputs/review')
DEFAULT_MANIFEST = Path('/home/ubuntu/Downloads/cfs30-inputs/candidate_items.json')


def norm(value: Any) -> str:
    text = unicodedata.normalize('NFKD', str(value or ''))
    text = ''.join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def signature(question: dict[str, Any]) -> str:
    parts = [question.get('enunciado', '')]
    parts.extend(option.get('t', '') for option in question.get('alts', []))
    return ' | '.join(norm(part) for part in parts)


def safe_source_url(value: Any) -> bool:
    parsed = urlsplit(str(value or '').strip())
    return parsed.scheme in {'http', 'https'} and bool(parsed.netloc) and not any(ch.isspace() for ch in str(value or ''))


def sanitize_reference(value: Any) -> str:
    text = str(value or '').strip()
    text = text.replace('/home/ubuntu/Downloads/cfs30-inputs/material_text/all_materials_corpus.txt', 'corpus textual das apostilas')
    text = text.replace('/home/ubuntu/Downloads/cfs30-inputs/Provao_CFS30_link1.docx', 'Provão CFS 30 (DOCX, arquivo 1)')
    text = text.replace('/home/ubuntu/Downloads/cfs30-inputs/Provao_CFS30_link1.txt', 'transcrição OCR do Provão CFS 30 (arquivo 1)')
    text = text.replace('/home/ubuntu/Downloads/cfs30-inputs/Provao_CFS30_link2.docx', 'Banco do Provão CFS 30 (DOCX, arquivo 2)')
    text = re.sub(r'/home/ubuntu/(?:[^\s,;()]+/)*([^/\s,;()]+)', r'\1', text)
    return text


def origin_for(item: dict[str, Any]) -> str:
    if item.get('file') == 'file1':
        return f"Provão CFS 30 · 100 questões · {item.get('year') or 'ano a confirmar'} · questão {item.get('question_number')}"
    year = item.get('year') or 'ano a confirmar'
    return f"Prova CFS 30 nº {int(item.get('proof', 0)):02d} · {year} · questão {item.get('question_number')}"


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise ValueError('o JSON da revisão não é um objeto')
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=ROOT / 'data/questions.json')
    parser.add_argument('--reviews', type=Path, default=DEFAULT_REVIEWS)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/questions_cfs30.json')
    parser.add_argument('--report', type=Path, default=ROOT / 'reports/cfs30-validation.csv')
    args = parser.parse_args()

    base = json.loads(args.base.read_text(encoding='utf-8'))
    if not isinstance(base, list):
        raise SystemExit('O banco-base precisa ser uma lista JSON.')
    manifest = json.loads(args.manifest.read_text(encoding='utf-8')) if args.manifest.exists() else []
    by_id = {item['item_id']: item for item in manifest if item.get('item_id')}
    review_paths = {path.stem: path for path in args.reviews.glob('*.json')} if args.reviews.exists() else {}

    new_questions: list[dict[str, Any]] = []
    seen_ids = {str(question.get('id', '')) for question in base}
    seen_signatures = {signature(question) for question in base}
    report_rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()

    for item_id, item in by_id.items():
        path = review_paths.get(item_id)
        if path is None:
            report_rows.append({'item_id': item_id, 'status': 'not_reviewed', 'letter': '', 'confidence': '', 'discipline': '', 'source': '', 'url': '', 'note': 'Ainda não há arquivo de revisão.'})
            counts['not_reviewed'] += 1
            continue
        try:
            question = load_object(path)
        except Exception as exc:  # retain failures in the audit report
            report_rows.append({'item_id': item_id, 'status': 'invalid_json', 'letter': '', 'confidence': '', 'discipline': '', 'source': '', 'url': '', 'note': str(exc)})
            counts['invalid_json'] += 1
            continue

        validation = question.get('validation') if isinstance(question.get('validation'), dict) else {}
        status = str(validation.get('status', 'pending'))
        confidence = validation.get('confidence', 0)
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 0.0
        correct_indexes = [i for i, option in enumerate(question.get('alts', [])) if isinstance(option, dict) and option.get('ok') is True]
        reasons: list[str] = []
        if status != 'validated':
            reasons.append('A revisão não classificou o item como validado.')
        if confidence < 0.80:
            reasons.append('Confiança inferior a 0,80.')
        required = ('disc', 'assunto', 'enunciado', 'resolucao')
        if any(not str(question.get(key, '')).strip() for key in required):
            reasons.append('Falta disciplina, assunto, enunciado ou resolução.')
        if len(question.get('alts', [])) != 4:
            reasons.append('Não há exatamente quatro alternativas.')
        if len(correct_indexes) != 1:
            reasons.append('Não há exatamente uma alternativa marcada como correta.')
        source_url_candidate = str(validation.get('source_url', '')).strip()
        local_source = bool(source_url_candidate) and source_url_candidate.startswith(('/home/', '/tmp/', 'file://'))
        source_url = source_url_candidate if safe_source_url(source_url_candidate) else ''
        if source_url_candidate and not source_url and not local_source:
            reasons.append('A URL da referência não é HTTP/HTTPS válida.')
        if not (validation.get('source_title') or validation.get('source_url') or question.get('base')):
            reasons.append('Falta referência verificável.')

        if reasons:
            row_status = status if status in {'pending', 'unusable'} else 'pending_validation'
            report_rows.append({'item_id': item_id, 'status': row_status, 'letter': '', 'confidence': confidence, 'discipline': question.get('disc', ''), 'source': validation.get('source_title', ''), 'url': source_url, 'note': ' '.join(reasons)})
            counts[row_status] += 1
            continue

        question = dict(question)
        question['id'] = 'cfs30-' + item_id
        if question['id'] in seen_ids:
            report_rows.append({'item_id': item_id, 'status': 'duplicate_id', 'letter': '', 'confidence': confidence, 'discipline': question.get('disc', ''), 'source': validation.get('source_title', ''), 'url': validation.get('source_url', ''), 'note': 'ID repetido; não foi anexado.'})
            counts['duplicate_id'] += 1
            continue
        question['colecao'] = 'CFS 30 · Provas anteriores'
        question['origem'] = origin_for(by_id[item_id])
        source_title = str(validation.get('source_title', '')).strip()
        source_location = sanitize_reference(validation.get('source_location', ''))
        reference = ' — '.join(part for part in (source_title, source_location) if part)
        if source_url and source_url not in reference:
            reference = (reference + ' — ' if reference else '') + source_url
        question['base'] = sanitize_reference(question.get('base') or reference)
        if source_url:
            question['source_url'] = source_url
        question['validation'] = {
            'status': 'validated',
            'confidence': confidence,
            'source_title': source_title,
            'source_location': source_location,
            'source_url': source_url,
            'candidate_mark': validation.get('candidate_mark', item.get('candidate_key')),
            'candidate_mark_agrees': validation.get('candidate_mark_agrees'),
            'ocr_corrections': validation.get('ocr_corrections', ''),
            'note': validation.get('note', '')
        }
        invalid_fragments = []
        for option in question['alts']:
            option.setdefault('erro', '')
            option.setdefault('motivo', '')
            fragment = str(option.get('erro') or '').strip()
            text = str(option.get('t') or '')
            if fragment and fragment.casefold() not in text.casefold():
                option['erro'] = ''
                invalid_fragments.append(fragment)
        sig = signature(question)
        if sig in seen_signatures:
            report_rows.append({'item_id': item_id, 'status': 'duplicate_question', 'letter': '', 'confidence': confidence, 'discipline': question.get('disc', ''), 'source': source_title, 'url': source_url, 'note': 'Enunciado e alternativas duplicam item já existente; não foi anexado.'})
            counts['duplicate_question'] += 1
            continue
        new_questions.append(question)
        seen_ids.add(question['id'])
        seen_signatures.add(sig)
        correct_letter = 'ABCD'[correct_indexes[0]]
        note = 'Incluída após validação.'
        if local_source:
            note += ' Referência local mantida como texto; nenhum caminho privado foi publicado como link.'
        if invalid_fragments:
            note += ' Fragmento de erro não literal removido: ' + '; '.join(invalid_fragments)
        report_rows.append({'item_id': item_id, 'status': 'imported', 'letter': correct_letter, 'confidence': confidence, 'discipline': question['disc'], 'source': source_title, 'url': source_url, 'note': note})
        counts['imported'] += 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(new_questions, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=['item_id', 'status', 'letter', 'confidence', 'discipline', 'source', 'url', 'note'], lineterminator='\n')
        writer.writeheader()
        writer.writerows(report_rows)
    print(json.dumps({'base_questions': len(base), 'supplemental_questions': len(new_questions), 'total_questions': len(base) + len(new_questions), 'review_files': len(review_paths), 'results': dict(counts), 'output': str(args.output), 'report': str(args.report)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
