"""Kaggle job: SDXL environment art for the FPS campaign (textures, sky, planet, 3D-prop concepts).
Outputs /kaggle/working/concepts/<prop>_<k>.png (for TRELLIS) and /kaggle/working/env/<name>.png (textures/sky)."""
import json, os, time, urllib.request, threading, traceback, zlib

TOPIC = os.environ.get("NTFY_TOPIC", "nd-env")


def publish(phase, **extra):
    print("PHASE", phase, extra, flush=True)
    try:
        body = json.dumps({"topic": TOPIC, "message": json.dumps({"phase": phase, **extra})[:3800]}).encode()
        urllib.request.urlopen(urllib.request.Request("https://ntfy.sh", data=body, headers={"Content-Type": "application/json"}), timeout=15).read()
    except Exception as e:
        print("ntfy failed", e)


publish("boot")
import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

OUT_C, OUT_E = "/kaggle/working/concepts", "/kaggle/working/env"
os.makedirs(OUT_C, exist_ok=True); os.makedirs(OUT_E, exist_ok=True)
PROP_STYLE = ("highly detailed 3D game asset render, single object, centered, entire object fully visible with empty space around, "
              "three-quarter view from slightly above, plain white background, soft studio lighting, PBR materials, no text, isolated")
NEG = "text, watermark, logo, multiple objects, cropped, cut off, blurry, lowres, frame, border, collage, turnaround, multiple views, character sheet"
KYRRH = "organic alien hive world biology, glossy purple chitin, pink flesh, glowing lime green bioluminescence"
DIR = "industrial military sci-fi, weathered steel and gunmetal, orange hazard stripes, amber lights"
TEX = "seamless tileable texture, perfectly flat top-down orthographic view, even flat lighting, no shadows, no perspective, high detail, 4k material"

JOBS = [
    # (name, kind, prompt, w, h, candidates)
    ("tex_creep", "env", f"{TEX}, alien organic creep biomass ground, purple fleshy membrane with glowing green veins", 1024, 1024, 1),
    ("tex_rock", "env", f"{TEX}, dark volcanic alien rock ground with small purple crystal shards and cracks", 1024, 1024, 1),
    ("tex_mire", "env", f"{TEX}, toxic alien swamp mud ground with glowing green slime puddles and organic debris", 1024, 1024, 1),
    ("tex_bone", "env", f"{TEX}, alien ground of fossilized bone fragments and chitin plates in dark soil", 1024, 1024, 1),
    ("sky", "env", "ultra wide panoramic alien sky at dusk, violet and magenta nebula clouds, huge ringed gas giant on the horizon, two small moons, spores in the air, epic sci-fi matte painting, no ground, no horizon line objects", 1536, 640, 1),
    ("planet", "env", "equirectangular texture map of an alien hive planet surface seen from orbit, purple and dark green organic continents, glowing veins, swirling clouds, flat projection map", 1024, 512, 1),
    ("prop_fungus", "prop", f"giant alien bioluminescent mushroom tree with glowing pink caps and twisted stalk, {KYRRH}", 1024, 1024, 2),
    ("prop_spire", "prop", f"tall twisted organic bone spire rising from the ground with chitin plates, {KYRRH}", 1024, 1024, 2),
    ("prop_eggs", "prop", f"cluster of glowing alien egg sacs on a fleshy mound, {KYRRH}", 1024, 1024, 2),
    ("prop_rock", "prop", "jagged alien rock formation with glowing purple crystals, dark basalt, sci-fi environment asset", 1024, 1024, 2),
    ("prop_arch", "prop", f"giant alien ribcage bone arch half buried in the ground, {KYRRH}", 1024, 1024, 2),
    ("prop_pod", "prop", f"pulsating alien spore pod plant with tendrils and glowing sacs, {KYRRH}", 1024, 1024, 2),
    ("prop_crystal", "prop", "cluster of large glowing magenta and cyan crystals growing from rock, sci-fi environment asset", 1024, 1024, 2),
    ("prop_wreck", "prop", f"crashed military dropship wreckage broken in half, smoking, {DIR}", 1024, 1024, 2),
    ("prop_beacon", "prop", f"military supply drop pod beacon with antenna, landing legs and glowing orange lights, {DIR}", 1024, 1024, 2),
    ("prop_dropship", "prop", f"heavy military dropship spacecraft with four landing thrusters and a rear ramp, {DIR}", 1024, 1024, 2),
    ("prop_flagship", "prop", f"gigantic military space carrier battleship, very long armored hull, hangar bays, command tower, engine clusters, {DIR}", 1024, 1024, 2),
    ("prop_rifle", "prop", f"sci-fi heavy assault rifle weapon, side view, chunky magazine, {DIR}", 1024, 1024, 2),
]


def gen(dev, jobs, done):
    try:
        with LOCK:
            pipe = StableDiffusionXLPipeline.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
            pipe.to(f"cuda:{dev}")
        pipe.set_progress_bar_config(disable=True)
        for name, kind, prompt, w, h, n in jobs:
            for k in range(n):
                g = torch.Generator(device=f"cuda:{dev}").manual_seed(7000 + k * 131 + zlib.crc32(name.encode()) % 1000)
                full = prompt if kind == "env" else f"{prompt}, {PROP_STYLE}"
                img = pipe(prompt=full, negative_prompt=NEG, num_inference_steps=30, guidance_scale=6.5, width=w, height=h, generator=g).images[0]
                img.save(f"{OUT_E}/{name}.png" if kind == "env" else f"{OUT_C}/{name}_{k}.png")
            done.append(name)
            publish("progress", done=len(done), total=len(JOBS), last=name)
    except Exception:
        publish("error", dev=dev, trace=traceback.format_exc()[-1500:])


LOCK = threading.Lock()
t0 = time.time(); done = []
threads = [threading.Thread(target=gen, args=(i, JOBS[i::2], done)) for i in range(2)]
for t in threads: t.start()
for t in threads: t.join()
publish("done", made=len(done), minutes=round((time.time() - t0) / 60, 1))
