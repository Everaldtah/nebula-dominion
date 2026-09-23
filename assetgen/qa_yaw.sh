#!/bin/bash
cd "$(dirname "$0")"
mkdir -p test/yaw
for f in out/trellis/glb/*.glb; do
  id=$(basename $f .glb)
  python -c "import render_all,sys; sys.exit(0 if '$id' in render_all.UNITS else 1)" || continue
  [ -f test/yaw/$id.png ] && continue
  blender -b -P blender/render_sprites.py -- --glb $f --id $id --kind unit --fit 1.6 --anim none --frames 1 --dirs 4 --teams 3d9bff --samples 6 --ppt 40 --out test/yaw > /dev/null 2>&1 && echo "qa $id"
done
