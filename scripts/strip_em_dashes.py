"""Replace em and en dashes with plain ASCII dashes across our own source and docs.

Scoped deliberately: the virtualenv, node_modules and build output are third-party or
generated, and rewriting them would be both pointless and destructive.

Rules:
  " - "  for an em dash used as a parenthetical break
  "-"    for an em dash inside a compound or standing for "no value"
  "-"    for en dashes in ranges (5-2000 m)
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ["pipeline", "api", "web/src", "docs", "plan", "ppt", "scripts"]
ROOT_FILES = ["README.md", "CLAUDE.md", "CONTEXT.md"]
SUFFIXES = {".py", ".ts", ".tsx", ".md", ".css", ".html", ".mjs", ".yml", ".json"}
# Only skip generated or third-party trees. "data" is deliberately absent: it would also
# match web/src/data, which is our own source.
SKIP_PARTS = {".venv", "node_modules", "dist", "__pycache__", "images", "shots"}
SKIP_DIRS = {ROOT / "web" / "public" / "data", ROOT / "data"}


def targets():
    for name in ROOT_FILES:
        path = ROOT / name
        if path.exists():
            yield path
    for folder in INCLUDE:
        base = ROOT / folder
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in SUFFIXES:
                continue
            if SKIP_PARTS & set(path.parts):
                continue
            if any(folder in path.parents for folder in SKIP_DIRS):
                continue
            yield path


def convert(text: str) -> str:
    # " - " reads as a parenthetical break, so it becomes " - ".
    text = text.replace(" - ", " - ").replace(" - ", " - ")
    # A trailing em dash at a line break is the same break, just wrapped.
    text = text.replace(" -\n", " -\n").replace(" -\n", " -\n")
    # Anything left is a compound, a range, or a "no value" placeholder.
    return text.replace("-", "-").replace("-", "-")


changed = 0
for path in targets():
    try:
        original = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    updated = convert(original)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        changed += 1
        print(f"  {path.relative_to(ROOT)}")

print(f"\nrewrote {changed} files")
