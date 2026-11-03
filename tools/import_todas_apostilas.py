#!/usr/bin/env python3
"""Importa a coleção do Index geral sem executar scripts JavaScript da página."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,120}$")
ARRAY_ASSIGNMENT = re.compile(
    r"window\.(?:BANCO_PARTES|BANCO_BIZUS)\s*=\s*\(\s*window\.(?:BANCO_PARTES|BANCO_BIZUS)\s*\|\|\s*\[\s*\]\s*\)\.concat\s*\("
)
SOURCE_URL = "https://github.com/vilsonLoverthink/Quest-es-todas-apostilas-/blob/main/index%20%281%29.html"
SOURCE_COMMIT = "f23dc9e56b079400c6dfa89d8de9d48117124f14"
COLLECTION = "Todas as Apostilas"


def load_list(path: Path) -> list[dict]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError(f"{path}: esperado um array JSON de questões")
    return value


def extract_questions(source: Path) -> list[dict]:
    text = source.read_text(encoding="utf-8")
    decoder = json.JSONDecoder()
    extracted = []
    cursor = 0
    blocks = 0
    while match := ARRAY_ASSIGNMENT.search(text, cursor):
        start = match.end()
        while start < len(text) and text[start].isspace():
            start += 1
        try:
            value, end = decoder.raw_decode(text, start)
        except json.JSONDecodeError as error:
            raise ValueError(f"Array BANCO_PARTES inválido no offset {start}: {error}") from error
        if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
            raise ValueError(f"Array BANCO_PARTES inválido no offset {start}")
        extracted.extend(value)
        blocks += 1
        cursor = end
    if not blocks:
        raise ValueError("Nenhum array JSON de window.BANCO_PARTES foi encontrado")
    return extracted


def comparable(question: dict) -> dict:
    fields = ("id", "disc", "assunto", "enunciado", "alts", "resolucao", "base")
    return {field: question.get(field) for field in fields}


def validate(question: dict, source: Path) -> None:
    qid = question.get("id")
    if not isinstance(qid, str) or not ID_RE.fullmatch(qid):
        raise ValueError(f"{source}: ID inválido: {qid!r}")
    if not isinstance(question.get("enunciado"), str) or not question["enunciado"].strip():
        raise ValueError(f"{qid}: enunciado ausente")
    if not isinstance(question.get("alts"), list) or len(question["alts"]) not in (2, 4):
        raise ValueError(f"{qid}: esperado item com duas ou quatro alternativas")
    if any(not isinstance(alt, dict) or not isinstance(alt.get("t"), str) or not alt["t"].strip() for alt in question["alts"]):
        raise ValueError(f"{qid}: alternativa vazia ou malformada")
    if sum(alt.get("ok") is True for alt in question["alts"]) != 1:
        raise ValueError(f"{qid}: esperado exatamente um gabarito marcado")
    if not isinstance(question.get("resolucao"), str) or not question["resolucao"].strip():
        raise ValueError(f"{qid}: resolução ausente")
    if not isinstance(question.get("base"), str) or not question["base"].strip():
        raise ValueError(f"{qid}: referência da apostila ausente")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("index (1).html"))
    parser.add_argument("--base", type=Path, default=Path("data/questions.json"))
    parser.add_argument("--cfs30", type=Path, default=Path("data/questions_cfs30.json"))
    parser.add_argument("--output", type=Path, default=Path("data/questions_todas_apostilas.json"))
    args = parser.parse_args()

    source_questions = extract_questions(args.source)
    base_questions = load_list(args.base)
    cfs30_questions = load_list(args.cfs30) if args.cfs30.exists() else []
    existing = {}
    for item in [*base_questions, *cfs30_questions]:
        qid = item.get("id")
        if not isinstance(qid, str) or qid in existing:
            raise ValueError(f"ID existente inválido ou duplicado: {qid!r}")
        existing[qid] = item

    source_ids = set()
    imported = []
    duplicates = 0
    for question in source_questions:
        validate(question, args.source)
        qid = question["id"]
        if qid in source_ids:
            raise ValueError(f"ID duplicado no Index: {qid}")
        source_ids.add(qid)
        if qid in existing:
            if comparable(existing[qid]) != comparable(question):
                raise ValueError(f"Conflito de conteúdo com questão já existente: {qid}")
            duplicates += 1
            continue
        imported_question = dict(question)
        imported_question["colecao"] = COLLECTION
        imported_question["keyStatus"] = "imported"
        imported_question["source_url"] = SOURCE_URL
        imported_question["origem"] = (
            f"Index Todas as Apostilas; commit {SOURCE_COMMIT}; "
            f"SHA-256 do HTML {hashlib.sha256(args.source.read_bytes()).hexdigest()}"
        )
        imported.append(imported_question)

    if len(source_questions) != 2466 or duplicates != 570 or len(imported) != 1896:
        raise ValueError(
            f"Contagem inesperada: Index={len(source_questions)}, cópias idênticas={duplicates}, "
            f"novas={len(imported)}; esperado 2466/570/1896."
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(imported, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = {}
    for question in imported:
        count = len(question["alts"])
        counts[count] = counts.get(count, 0) + 1
    print(
        f"Importadas {len(imported)} questões; {duplicates} cópias-base ignoradas; "
        f"alternativas={counts}; saída={args.output}"
    )


if __name__ == "__main__":
    main()
