"""Kaggle job A: SDXL concept renders for every asset (3 candidates each), both T4s in parallel.
Progress is reported to ntfy; outputs land in /kaggle/working/concepts/<id>_<k>.png."""
import json, os, sys, time, subprocess, urllib.request, threading, traceback, zlib

TOPIC = os.environ.get("NTFY_TOPIC", "nd-assetgen-7f3k")


def publish(phase, **extra):
    print("PHASE", phase, extra, flush=True)
    try:
        body = json.dumps({"topic": TOPIC, "title": "concepts " + phase, "message": json.dumps({"phase": phase, **extra})[:3800]}).encode()
        urllib.request.urlopen(urllib.request.Request("https://ntfy.sh", data=body, headers={"Content-Type": "application/json"}), timeout=15).read()
    except Exception as e:
        print("ntfy failed", e)


publish("boot")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from assets import ASSETS, STYLE, NEG, RACE
except ImportError:
    # kernel scripts are single files: assets.py content is appended below by the launcher
    pass

import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

OUT = "/kaggle/working/concepts"
os.makedirs(OUT, exist_ok=True)
N_CAND = int(os.environ.get("N_CAND", "3"))
ONLY = [s for s in os.environ.get("ONLY", "").split(",") if s]

jobs = [(aid, spec) for aid, spec in ASSETS.items() if not ONLY or aid in ONLY]


def prompt_for(aid, spec):
    race, kind, subject = spec
    style = RACE.get(race, "realistic sci-fi")
    if kind == "building":
        return f"sci-fi RTS game building: {subject}, standing on a flat base platform, {style}, isometric three-quarter view from above, {STYLE}"
    if kind == "resource":
        return f"{subject}, isometric three-quarter view from above, {STYLE}"
    return f"one single {subject}, {style}, one character only, three-quarter front view, {STYLE}"


LOAD_LOCK = threading.Lock()


def worker(dev, items, done):
    try:
        with LOAD_LOCK:
          pipe = StableDiffusionXLPipeline.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
          pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
          pipe.to(f"cuda:{dev}")
        pipe.set_progress_bar_config(disable=True)
        for aid, spec in items:
            for k in range(N_CAND):
                g = torch.Generator(device=f"cuda:{dev}").manual_seed(1000 + k * 7919 + zlib.crc32(aid.encode()) % 1000)
                img = pipe(prompt=prompt_for(aid, spec), negative_prompt=NEG, num_inference_steps=28, guidance_scale=6.5, width=1024, height=1024, generator=g).images[0]
                img.save(f"{OUT}/{aid}_{k}.png")
            done.append(aid)
            if len(done) % 4 == 0:
                publish("progress", done=len(done), total=len(jobs))
    except Exception:
        publish("error", dev=dev, trace=traceback.format_exc()[-1500:])


t0 = time.time()
done = []
halves = [jobs[0::2], jobs[1::2]]
threads = [threading.Thread(target=worker, args=(i, halves[i], done)) for i in range(2)]
for t in threads: t.start()
for t in threads: t.join()
publish("done", assets=len(done), minutes=round((time.time() - t0) / 60, 1))
