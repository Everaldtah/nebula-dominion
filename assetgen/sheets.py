"""Contact sheets of concept candidates: 8 assets per sheet, 3 candidates each, labelled."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw
src = Path("out/concepts/concepts"); dst = Path("out/sheets"); dst.mkdir(parents=True, exist_ok=True)
ids = sorted({p.stem.rsplit("_", 1)[0] for p in src.glob("*.png")})
T = 220
for si in range(0, len(ids), 8):
    chunk = ids[si:si + 8]
    sheet = Image.new("RGB", (3 * T + 150, len(chunk) * T), (30, 30, 36))
    d = ImageDraw.Draw(sheet)
    for r, aid in enumerate(chunk):
        d.text((6, r * T + 8), aid, fill=(255, 220, 120))
        for k in range(3):
            p = src / f"{aid}_{k}.png"
            if p.exists():
                sheet.paste(Image.open(p).convert("RGB").resize((T, T)), (150 + k * T, r * T))
                d.text((150 + k * T + 4, r * T + 4), str(k), fill=(255, 60, 60))
    sheet.save(dst / f"sheet{si // 8}.png")
print(len(ids), "assets")
