"""
Turn a frame a person grabbed from their own browser into the JPEG the documents load.

The capture harness shoots a fixed 1600x900 and every published picture is that shape. A frame
someone grabs by hand is whatever size their window was - 1917x1030, 1081x452, 1466x841 - and
dropped into the feature rail beside a dozen 16:9 pictures it is the one card that crops
differently from the rest.

So this does what the harness would have done and nothing more: crop to 16:9, resize to
1600x900, encode JPEG at the harness's own quality of 82. **It never retouches.** No colour
change, no sharpening, nothing painted out - a screenshot is the deck's proof, and cropping the
browser's own chrome away is the one operation that leaves it proof.

The crop keeps the **top-left**, because that is where the control panel is and the panel is half
of what these pictures are for: a card showing the water with the controls cut off is a picture
of some water.

`--no-crop` resizes to 1600 wide and keeps the source aspect instead. It exists for one real
case: a frame wider than 16:9 whose subject is on the right, where cropping to the left would
throw the subject away. The drift shot is that case - crop it and you keep the panel and lose the
pin, which is the thing the picture is of.

    ../.venv/Scripts/python scripts/normalise_screenshot.py <source> <theme> <name> [--no-crop]

writes `assets/screenshots/<theme>/<name>.jpg`, which is the single committed source every
document publishes from. See `PUBLISH_MAP` in `web/capture.mjs`.
"""

import sys
from pathlib import Path

from PIL import Image

WIDTH, HEIGHT = 1600, 900
QUALITY = 82
ROOT = Path(__file__).resolve().parent.parent
THEMES = ("light", "dark")


def normalise(source: Path, theme: str, name: str, crop: bool = True) -> Path:
    if theme not in THEMES:
        raise SystemExit(f"theme must be one of {THEMES}, not {theme}")

    image = Image.open(source).convert("RGB")

    if crop:
        wide = image.width / image.height
        target = WIDTH / HEIGHT
        if wide > target:
            # Too wide: keep the left, where the panel is.
            image = image.crop((0, 0, round(image.height * target), image.height))
        elif wide < target:
            # Too tall: keep the top. The bottom of a browser shot is the timeline and the
            # attribution strip, which every harness picture also loses to its own framing.
            image = image.crop((0, 0, image.width, round(image.width / target)))
        image = image.resize((WIDTH, HEIGHT), Image.LANCZOS)
    else:
        image = image.resize((WIDTH, round(WIDTH * image.height / image.width)), Image.LANCZOS)

    destination = ROOT / "assets" / "screenshots" / theme / f"{name}.jpg"
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "JPEG", quality=QUALITY, optimize=True)
    return destination


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--no-crop"]
    if len(args) != 3:
        print(__doc__)
        raise SystemExit(2)
    out = normalise(Path(args[0]), args[1], args[2], crop="--no-crop" not in sys.argv)
    done = Image.open(out)
    print(f"{out.relative_to(ROOT)}  {done.width}x{done.height}  {out.stat().st_size // 1024} KB")
