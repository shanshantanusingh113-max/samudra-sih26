"""Write `web/public/data/tests.json`: what the suite covers, module by module.

`provenance.html`'s whole claim is that every figure on it is read live from the build. It was
true of the data figures and false of the test ones: the page hand-wrote "67 passed" in a code
block a reader is invited to run, listed 11 of the 25 test modules, and claimed 123 tests
between them against a suite of 377. A visitor who ran the command saw a number five times
larger than the page promised, which is the good direction and is still a page contradicting
itself.

So the counts come from pytest's own collector and the descriptions come from each module's own
docstring, which is where they were already written. Run it after adding or removing tests:

    cd pipeline && ../.venv/Scripts/python scripts/collect_tests.py
"""

from __future__ import annotations

import ast
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent
TESTS = PIPELINE / "tests"
OUT = PIPELINE.parent / "web" / "public" / "data" / "tests.json"


def counts() -> Counter:
    """One entry per test module, from pytest's own collection rather than from a regex."""
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "--no-header"],
        cwd=PIPELINE,
        capture_output=True,
        text=True,
    )
    tally: Counter = Counter()
    for line in result.stdout.splitlines():
        if "::" not in line:
            continue
        module = line.split("::", 1)[0].replace("\\", "/").rsplit("/", 1)[-1]
        if module.endswith(".py"):
            tally[module] += 1
    if not tally:
        raise SystemExit(f"pytest collected nothing:\n{result.stdout}\n{result.stderr}")
    return tally


def summary(path: Path) -> str:
    """The module's own first sentence. Where the answer to "what does this defend" already is."""
    doc = ast.get_docstring(ast.parse(path.read_text(encoding="utf-8"))) or ""
    first = doc.strip().split("\n\n", 1)[0].replace("\n", " ").strip()
    if not first:
        return "Covered by this module."
    # One sentence, and never a trailing full stop that a table would show twice.
    for stop in (". ", "? "):
        if stop in first:
            first = first.split(stop, 1)[0] + stop.strip()
            break
    return first


def main() -> None:
    tally = counts()
    rows = []
    for module, count in sorted(tally.items(), key=lambda item: (-item[1], item[0])):
        path = TESTS / module
        rows.append(
            {
                "module": module,
                "tests": count,
                "defends": summary(path) if path.exists() else "",
            }
        )
    OUT.write_text(
        json.dumps({"total": sum(tally.values()), "modules": rows}, indent=1),
        encoding="utf-8",
    )
    print(f"{sum(tally.values())} tests across {len(rows)} modules -> {OUT}")


if __name__ == "__main__":
    main()
