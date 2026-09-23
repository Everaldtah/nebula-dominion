"""Pick the best concept per asset (same heuristic as the Kaggle job) and cut out HUD portraits."""
import json, glob
from pathlib import Path
import numpy as np
from PIL import Image
from rembg import remove, new_session
from scipy import ndimage

src = Path("out/concepts/concepts"); dst = Path("../public/portraits"); dst.mkdir(parents=True, exist_ok=True)
sess = new_session("u2net")
ids = sorted({p.stem.rsplit("_", 1)[0] for p in src.glob("*.png")})
picks = {}
for i in ids:
    best, bs, bimg = "0", -1e9, None
    for p in sorted(src.glob(f"{i}_*.png")):
        k = p.stem.rsplit("_", 1)[1]
        cut = remove(Image.open(p).convert("RGB"), session=sess)
        a = np.array(cut.resize((384, 384)))[..., 3] > 128
        cov = a.mean()
        lab, n = ndimage.label(a)
        sizes = np.bincount(lab.ravel())[1:] if n else np.array([0])
        main = sizes.max() / max(1, sizes.sum())
        big = (sizes > 0.05 * sizes.sum()).sum()
        edge = a[:6].mean() + a[-6:].mean() + a[:, :6].mean() + a[:, -6:].mean()
        score = main * 3 - (big - 1) * 2 - edge * 8 - abs(cov - 0.32) * 3
        if score > bs: bs, best, bimg = score, k, cut
    picks[i] = best
    bb = bimg.getbbox()
    crop = bimg.crop(bb)
    side = max(crop.size)
    sq = Image.new("RGBA", (side, side)); sq.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(dst / f"{i}.webp", quality=88)
    print(i, best, round(bs, 2), flush=True)
json.dump(picks, open("out/picks.json", "w"), indent=0)
