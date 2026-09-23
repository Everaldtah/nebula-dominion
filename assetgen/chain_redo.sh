#!/bin/bash
cd "$(dirname "$0")"
REDO="cavern hierophant mender skyport vindicator trooper quillden"
MAINLOG="$1"
until python -m kaggle kernels status everaldtah/nd-assetgen-concepts 2>&1 | grep -qE "COMPLETE|ERROR"; do sleep 30; done
rm -rf out/concepts_redo && mkdir -p out/concepts_redo
python -m kaggle kernels output everaldtah/nd-assetgen-concepts -p out/concepts_redo > /dev/null 2>&1
for i in $REDO; do rm -f out/concepts/concepts/${i}_*.png; done
cp out/concepts_redo/concepts/*.png out/concepts/concepts/
echo "redo concepts: $(ls out/concepts_redo/concepts | wc -l)"
python portraits.py > out/portraits.log 2>&1; grep -E "^($(echo $REDO | tr ' ' '|')) " out/portraits.log
# the main TRELLIS output must be downloaded before a new version replaces it
until [ "$(ls out/trellis/glb 2>/dev/null | wc -l)" -ge 60 ]; do sleep 20; done; sleep 30
python kaggle_run.py trellis --sources everaldtah/nd-assetgen-concepts 2>&1 | grep -E '"asset|done|error' | tail -12
python render_all.py --only "$(echo $REDO | tr ' ' ',')" --jobs 3 --samples 16
echo REDO_DONE
