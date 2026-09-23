#!/bin/bash
cd "$(dirname "$0")"
until python -m kaggle kernels status everaldtah/nd-assetgen-trellis 2>&1 | grep -qE "COMPLETE|ERROR"; do sleep 60; done
python -m kaggle kernels status everaldtah/nd-assetgen-trellis 2>&1 | tail -1
rm -rf out/trellis_hq && mkdir -p out/trellis_hq
python -m kaggle kernels output everaldtah/nd-assetgen-trellis -p out/trellis_hq > /dev/null 2>&1
echo "HQ glbs: $(ls out/trellis_hq/glb | wc -l)"
rm -f ../public/sprites/* ../public/models/*
python build_assets.py --src out/trellis_hq/glb --jobs 3 --samples 32
cd .. && npx vite build 2>&1 | tail -1
echo FINAL_CHAIN_DONE
