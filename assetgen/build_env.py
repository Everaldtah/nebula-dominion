#!/usr/bin/env python3
"""FPS environment props: clean TRELLIS GLBs in Blender (floaters, normalise, concept-faithful material),
then compress to ../public/env/<id>.glb (Draco + WebP).

    python build_env.py [--src out/trellis_env/glb] [--jobs 3]
"""
import argparse, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "env"
TMP = HERE / "out" / "env_clean"
SCRIPT = HERE / "blender" / "rig_render.py"
BIG = {"prop_flagship", "prop_dropship", "prop_rifle", "prop_wreck"}   # seen up close / in the cinematic: 2K textures


def build(glb: Path):
    aid, t = glb.stem, time.time()
    r = subprocess.run(["blender", "-b", "-P", str(SCRIPT), "--", "--glb", str(glb), "--id", aid, "--kind", "building", "--gait", "static",
                        "--fit", "1", "--no-sprites", "--out-glb", str(TMP / f"{aid}.glb"), "--teams", "000000"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    src = TMP / f"{aid}.glb"
    if not src.exists():
        print(f"ERR blender {aid}\n{(r.stdout + r.stderr)[-1200:]}")
        src = glb   # fall back to the raw TRELLIS mesh
    c = subprocess.run(["npx", "--yes", "@gltf-transform/cli", "optimize", str(src), str(OUT / f"{aid}.glb"), "--compress", "draco",
                        "--texture-compress", "webp", "--texture-size", "2048" if aid in BIG else "1024"],
                       capture_output=True, text=True, shell=True, encoding="utf-8", errors="replace")
    ok = c.returncode == 0
    print(f"{'ok ' if ok else 'ERR'} {aid:16s} {time.time() - t:5.1f}s {(OUT / f'{aid}.glb').stat().st_size // 1024 if ok else 0} KB", flush=True)
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="out/trellis_env/glb"); ap.add_argument("--jobs", type=int, default=3)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True); TMP.mkdir(parents=True, exist_ok=True)
    glbs = sorted((HERE / a.src).glob("prop_*.glb"))
    with ThreadPoolExecutor(a.jobs) as ex:
        res = list(ex.map(build, glbs))
    print(f"built {sum(res)}/{len(glbs)}")


if __name__ == "__main__":
    main()
