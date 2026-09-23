#!/bin/bash
# wait for the full TRELLIS batch, download the GLBs, render sprite sheets on the local GPU
cd "$(dirname "$0")"
until python -m kaggle kernels status everaldtah/nd-assetgen-trellis 2>&1 | grep -qE "COMPLETE|ERROR"; do sleep 30; done
python -m kaggle kernels status everaldtah/nd-assetgen-trellis 2>&1 | tail -1
rm -rf out/trellis_full && mkdir -p out/trellis_full
python -m kaggle kernels output everaldtah/nd-assetgen-trellis -p out/trellis_full > /dev/null 2>&1
mkdir -p out/trellis/glb && cp out/trellis_full/glb/*.glb out/trellis/glb/
echo "glbs: $(ls out/trellis_full/glb | wc -l)"
SKIP="cavern hierophant mender skyport vindicator trooper quillden"
ONLY=$(ls out/trellis_full/glb | sed 's/.glb//' | grep -vxF -f <(echo $SKIP | tr ' ' '\n') | paste -sd, -)
python render_all.py --only "$ONLY" --jobs 3 --samples 16
echo CHAIN_DONE
