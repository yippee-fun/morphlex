#!/bin/bash
# usage: vg.sh <scenario> <run 0|1>
D=$(dirname $(find ~/.cache/ms-playwright -name headless_shell.real | head -1))
cd "$(dirname "$0")"
LD_LIBRARY_PATH=$D valgrind --tool=cachegrind --cache-sim=no --smc-check=all-non-file --cachegrind-out-file=/dev/null $D/headless_shell.real --no-sandbox --single-process --no-zygote --disable-gpu --allow-file-access-from-files --js-flags=--single-threaded --dump-dom "file://$PWD/m.html?s=$1&run=$2" 2>&1 | grep -E "I *refs|ran<|skipped<" | tr '\n' ' '
echo " $1 run=$2"
