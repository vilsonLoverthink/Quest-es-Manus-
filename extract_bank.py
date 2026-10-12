#!/usr/bin/env python3
"""Extract question arrays from the submitted index HTML without executing JavaScript."""
from __future__ import annotations
import json
import re
import sys
from collections import Counter
from pathlib import Path


def extract_concat_arrays(source: str) -> list[dict]:
    questions: list[dict] = []
    count_blocks = 0
    for match in re.finditer(r"\.concat\s*\(", source):
        i = match.end()
        while i < len(source) and source[i].isspace():
            i += 1
        if i >= len(source) or source[i] != "[":
            continue
        start = i
        depth = 0
        in_string = False
        escaped = False
        end = None
        for j in range(start, len(source)):
            char = source[j]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break
        if end is None:
            raise ValueError("Array JSON sem fechamento correspondente.")
        block = json.loads(source[start:end])
        if not isinstance(block, list) or any(not isinstance(item, dict) for item in block):
            raise ValueError("Um bloco extraído não é uma lista de objetos.")
        questions.extend(block)
        count_blocks += 1
    if not count_blocks:
        raise ValueError("Nenhum array de questões foi encontrado.")
    return questions


def main() -> int:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/upload/index-1.html")
    destination = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).parent / "data/questions.json")
    questions = extract_concat_arrays(source.read_text(encoding="utf-8", errors="strict"))
    required = ("id", "disc", "assunto", "enunciado", "alts", "resolucao")
    for n, question in enumerate(questions, 1):
        missing = [key for key in required if key not in question]
        if missing:
            raise ValueError(f"Questão {n} sem campos: {', '.join(missing)}")
        if not isinstance(question["alts"], list) or len(question["alts"]) != 4:
            raise ValueError(f"Questão {question['id']} não tem 4 alternativas.")
        correct_count = sum(option.get("ok") is True for option in question["alts"])
        if correct_count != 1:
            raise ValueError(f"Questão {question['id']} deve ter exatamente uma alternativa correta; encontradas: {correct_count}.")
    ids = [q["id"] for q in questions]
    if len(set(ids)) != len(ids):
        raise ValueError("Há IDs duplicados no banco.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Questões: {len(questions)}")
    print("Disciplinas:", json.dumps(dict(Counter(q['disc'] for q in questions)), ensure_ascii=False))
    print(f"Arquivo: {destination} ({destination.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
