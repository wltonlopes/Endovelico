#!/bin/sh
# Simula a campanha sem o jogo (regras, IA, batalhas automáticas, salvar e
# carregar). Precisa do gjs e do public extraído (feito na primeira vez).
# Uso (na pasta do mod):  sh tools/test/campaign_sim.sh [turnos] [civ] [província]
MOD=$(cd "$(dirname "$0")/../../.." && pwd)
REV=$(echo "$MOD" | sed -n 's|.*/snap/0ad/\([0-9]*\)/.*|\1|p')
PUB=${TW_PUBLIC_DIR:-${TMPDIR:-/tmp}/tw_public_$REV}
if [ ! -d "$PUB/simulation/data/civs" ] || [ ! -f "$PUB/gui/common/campaigns/utils.js" ]; then
	mkdir -p "$PUB"
	python3 -c "
import zipfile, sys
z = zipfile.ZipFile('/snap/0ad/$REV/binaries/data/mods/public/public.zip')
z.extractall(sys.argv[1], [n for n in z.namelist() if n.startswith(('simulation/data/', 'globalscripts/', 'gui/common/'))])
" "$PUB"
fi
gjs "$MOD/tools/warfield/test/campaign_sim.js" "$MOD" "$PUB" "$@"
