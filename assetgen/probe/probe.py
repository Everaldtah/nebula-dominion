import subprocess, sys, json, urllib.request
def sh(c):
    r = subprocess.run(c, shell=True, capture_output=True, text=True); return (r.stdout + r.stderr).strip()[-1500:]
info = {
 "python": sys.version, "nvidia": sh("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv"),
 "nvcc": sh("nvcc --version | tail -2; ls /usr/local | grep -i cuda"),
 "torch": sh("python -c 'import torch;print(torch.__version__, torch.version.cuda, torch.cuda.is_available())'"),
 "pkgs": sh("pip list 2>/dev/null | grep -iE '^(torch|torchvision|xformers|diffusers|transformers|accelerate|numpy|pillow|trimesh|open3d|rembg|onnxruntime|imageio|opencv|gcc|ninja) '"),
 "gcc": sh("gcc --version | head -1"), "disk": sh("df -h /kaggle/working | tail -1"), "ram": sh("free -g | head -2"),
}
print(json.dumps(info, indent=1))
body = json.dumps({"topic": "nd-assetgen-probe-7f3k", "message": json.dumps(info)[:3900]}).encode()
urllib.request.urlopen(urllib.request.Request("https://ntfy.sh", data=body, headers={"Content-Type": "application/json"}), timeout=15)
