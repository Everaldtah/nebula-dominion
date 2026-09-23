#!/bin/bash
# Draco + WebP compress every generated GLB into ../public/models for the in-browser Unit Gallery
cd "$(dirname "$0")"
mkdir -p ../public/models
for f in out/trellis/glb/*.glb; do
  id=$(basename "$f" .glb)
  npx --yes @gltf-transform/cli optimize "$f" "../public/models/$id.glb" --compress draco --texture-compress webp --texture-size 1024 > /dev/null 2>&1 && echo "ok $id $(stat -c %s ../public/models/$id.glb)" || echo "FAIL $id"
done
