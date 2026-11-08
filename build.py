"""Gera data/ a partir das pastas de exercícios do editor local (~/poo-editor/exercises por padrão)."""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "poo-editor" / "exercises"
# Exercícios que entram no site. Sem nenhum na linha de comando, entra só o dojo
ONLY = sys.argv[2:] or ["dojo-kanban"]
OUT = ROOT / "data"
LABELS = {"heranca": "Herança", "polimorfismo": "Polimorfismo", "interface": "Interface", "excecoes": "Exceções", "dojo": "Dojo"}
ASSETS = {".png", ".svg", ".jpg"}


def label(ex):
    topic, rest = ex.split("-", 1)
    return f"{LABELS.get(topic, topic)} {int(rest)}" if rest.isdigit() else f"{LABELS.get(topic, topic)} {rest.capitalize()}"


def java_files(folder):
    return {p.relative_to(folder).as_posix(): p.read_text() for p in sorted(folder.rglob("*.java"))} if folder.exists() else {}


def tests_of(folder):
    tests = folder / "tests"
    if not tests.exists():
        return []
    # Exemplos primeiro, depois os testes extras, cada grupo em ordem numérica
    names = sorted((p.stem for p in tests.glob("*.in")), key=lambda n: (not n.startswith("exemplo"), int(n.split("-")[-1]), n))
    return [{"name": n, "input": (tests / f"{n}.in").read_text(), "output": (tests / f"{n}.out").read_text()} for n in names]


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir()
    exercises = sorted((p.name for p in SRC.iterdir() if p.is_dir() and p.name in ONLY), key=lambda e: (list(LABELS).index(e.split("-")[0]), e))
    index = []
    for ex in exercises:
        folder = SRC / ex
        (OUT / ex).mkdir()
        for asset in folder.iterdir():
            if asset.suffix in ASSETS:
                shutil.copy(asset, OUT / ex / asset.name)
        statement = (folder / "statement.html").read_text()
        # Cada imagem leva o hash do conteúdo no endereço, para o navegador não mostrar uma versão antiga do cache
        for asset in folder.iterdir():
            if asset.suffix in ASSETS:
                digest = hashlib.md5(asset.read_bytes()).hexdigest()[:8]
                statement = statement.replace(f"asset:{asset.name}", f"data/{ex}/{asset.name}?v={digest}")
        example = folder / "example.in"
        tests = tests_of(folder)
        checker = java_files(folder / "checker")
        data = {
            "id": ex,
            "label": label(ex),
            "statement": statement,
            "files": java_files(folder / "base"),
            "input": example.read_text() if example.exists() else (tests[0]["input"] if tests else ""),
            "tests": tests,
            "checker": checker,
            "visual": java_files(folder / "visual"),
        }
        text = json.dumps(data, ensure_ascii=False)
        (OUT / ex / "exercise.json").write_text(text)
        index.append({"id": ex, "label": label(ex), "v": hashlib.md5(text.encode()).hexdigest()[:8]})
        kind = f"{len(tests)} testes" if tests else f"verificador com {len(re.findall(r'teste\(\"', ''.join(checker.values())))} verificações"
        print(f"{ex}: {len(data['files'])} arquivos, {kind}")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False))


if __name__ == "__main__":
    main()
