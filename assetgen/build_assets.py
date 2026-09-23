#!/usr/bin/env python3
"""Rig + animate + render every generated model (Blender, parallel), compress rigged GLBs for the gallery.

    python build_assets.py [--only id1,id2] [--jobs 3] [--samples 32] [--src out/trellis_hq/glb]
Outputs: ../public/sprites/<id>.png|json + manifest.json, ../public/models/<id>.glb (Draco/WebP, rigged, animated).
"""
import argparse, json, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPR = HERE.parent / "public" / "sprites"
MOD = HERE.parent / "public" / "models"
RIG = HERE / "out" / "rigged"
SCRIPT = HERE / "blender" / "rig_render.py"

# id: (collision radius, gait, hover altitude)
UNITS = {
    "rigger": (0.375, "biped", 0), "trooper": (0.375, "biped", 0), "breacher": (0.5625, "biped", 0), "mender": (0.4, "biped", 0),
    "scorcher": (0.5, "vehicle", 0), "juggernaut": (0.875, "vehicle", 0), "juggernaut_sieged": (0.875, "static", 0),
    "wasp": (0.625, "hover", 1.1), "dreadnought": (1.25, "hover", 1.5), "titan": (1.3, "biped", 0),
    "grub": (0.375, "hexa", 0), "drover": (0.9, "hover", 1.3), "skitterling": (0.35, "quad", 0), "carapid": (0.625, "hexa", 0),
    "quillback": (0.625, "serpent", 0), "wyvern": (0.6, "flyer", 1.2), "behemoth": (1.0, "quad", 0), "matron": (0.6, "hexa", 0),
    "gravemaw": (1.3, "flyer", 1.7),
    "acolyte": (0.375, "hover", 0.45), "vindicator": (0.5, "biped", 0), "seeker": (0.625, "quad", 0), "bulwark": (0.75, "quad", 0),
    "strider": (1.0, "quad", 0), "radiant": (0.9, "hover", 1.2), "empyrean": (1.4, "hover", 1.6), "hierophant": (1.2, "biped", 0),
}
YAW = {"juggernaut_sieged": 180}      # TRELLIS puts the concept's front toward -Y; units turn +90 to face east
BUILD5 = {"bastion", "citadel", "stronghold", "nest", "sanctum", "throne", "core", "radiantcore", "exaltedcore"}
BUILD2 = {"habitat", "turret", "thorn", "obelisk", "spire"}
KYRRH_B = {"nest", "sanctum", "throne", "siphon", "mire", "mutagen", "warren", "quillden", "aerie", "elderaerie", "cavern", "thorn"}


def args_for(aid):
    if aid in UNITS:
        r, gait, air = UNITS[aid]
        fit = r * 2 * 1.35
        frames = 1 if gait == "static" else (4 if fit > 2.2 else 6)
        return ["--kind", "unit", "--gait", gait, "--fit", f"{fit:.3f}", "--air", str(air), "--frames", str(frames), "--dirs", "16", "--yaw", str(YAW.get(aid, 90))]
    if aid == "mineral":
        return ["--kind", "resource", "--fit", "2.1", "--depth", "1.3", "--frames", "1", "--dirs", "1"]
    if aid == "geyser":
        return ["--kind", "resource", "--fit", "3.1", "--frames", "1", "--dirs", "1"]
    size = 5 if aid in BUILD5 else 2 if aid in BUILD2 else 3
    return ["--kind", "building", "--gait", "building" if aid in KYRRH_B else "static", "--fit", f"{size * 0.98:.2f}", "--frames", "2", "--dirs", "1"]


def build(aid, src, samples):
    t = time.time()
    cmd = ["blender", "-b", "-P", str(SCRIPT), "--", "--glb", str(src / f"{aid}.glb"), "--id", aid, "--samples", str(samples),
           "--out-glb", str(RIG / f"{aid}.glb"), "--out-sprites", str(SPR), *args_for(aid)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    ok = "SPRITE_DONE" in r.stdout
    if ok and (RIG / f"{aid}.glb").exists():
        c = subprocess.run(["npx", "--yes", "@gltf-transform/cli", "optimize", str(RIG / f"{aid}.glb"), str(MOD / f"{aid}.glb"),
                            "--compress", "draco", "--texture-compress", "webp", "--texture-size", "2048"], capture_output=True, text=True, shell=True, encoding="utf-8", errors="replace")
        ok = c.returncode == 0
        if not ok: print(c.stdout[-600:], c.stderr[-600:])
    if ok:
        # high-quality WebP (alpha) is ~4x smaller than PNG for the same sheet
        from PIL import Image
        for stem in (aid, f"{aid}_turn"):
            png = SPR / f"{stem}.png"
            if png.exists():
                Image.open(png).save(SPR / f"{stem}.webp", "WEBP", quality=92, method=6)
                png.unlink()
    print(f"{'ok ' if ok else 'ERR'} {aid:18s} {time.time() - t:6.1f}s", flush=True)
    if not ok: print((r.stdout + r.stderr)[-1500:])
    return aid, ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=""); ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--samples", type=int, default=32); ap.add_argument("--src", default="out/trellis/glb")
    a = ap.parse_args()
    src = (HERE / a.src).resolve()
    for d in (SPR, MOD, RIG): d.mkdir(parents=True, exist_ok=True)
    ids = sorted(p.stem for p in src.glob("*.glb"))
    if a.only: ids = [i for i in ids if i in a.only.split(",")]
    # biggest jobs first so the pool stays busy
    ids.sort(key=lambda i: -(UNITS[i][0] if i in UNITS else 0.2))
    with ThreadPoolExecutor(a.jobs) as ex:
        results = list(ex.map(lambda i: build(i, src, a.samples), ids))
    manifest = {p.stem: json.loads(p.read_text()) for p in sorted(SPR.glob("*.json")) if p.name != "manifest.json"}
    (SPR / "manifest.json").write_text(json.dumps(manifest))
    print(f"manifest: {len(manifest)} sheets; failed: {[i for i, ok in results if not ok]}")


if __name__ == "__main__":
    main()
