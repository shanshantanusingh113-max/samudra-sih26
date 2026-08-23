"""Inline the screenshots into the one-pager so the published artifact is self-contained."""

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "web" / "shots"

IMAGES = {
    "{{IMG_VOLUME}}": "02-volume.jpg",
    "{{IMG_GLOBE}}": "01-globe.jpg",
    "{{IMG_ISO}}": "04-isosurface.jpg",
    "{{IMG_COLLOCATION}}": "03-collocation.jpg",
}


def data_uri(path: Path) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


html = (ROOT / "scripts" / "onepager_template.html").read_text(encoding="utf-8")
for token, name in IMAGES.items():
    source = SHOTS / name
    if not source.exists():
        raise SystemExit(f"missing screenshot {source}")
    html = html.replace(token, data_uri(source))

if "{{" in html:
    raise SystemExit("a placeholder was left unreplaced")

out = ROOT / "docs" / "samudra-onepager.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size / 1024 / 1024:.2f} MB)")
