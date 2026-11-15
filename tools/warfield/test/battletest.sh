#!/bin/sh
# Batalha de teste sem interface: Field Battle (exércitos aleatórios das
# civs, as duas pela IA do diretor) com o trigger tools/test/zz_twtest.js,
# que registra a situação a cada 15 s e o resultado. Mostra o registro e
# os erros do jogo. Arquivos temporários são apagados no fim.
#
# Uso (na pasta do mod):  sh tools/test/battletest.sh [segundos de espera]
# TW_CIV1/TW_CIV2 trocam as civs; TW_TERRAIN o terreno (plains, river...).
# Nunca rode dois testes ao mesmo tempo (o log é o mesmo).
MOD=$(cd "$(dirname "$0")/../../.." && pwd)
NAME=$(basename "$MOD")
REV=$(echo "$MOD" | sed -n 's|.*/snap/0ad/\([0-9]*\)/.*|\1|p')
LOG="$HOME/snap/0ad/$REV/.local/state/0ad/log/interestinglog.html"
WAIT=${1:-300}

cp "$MOD/tools/warfield/test/zz_twtest.js" "$MOD/maps/scripts/zz_twtest.js"
# TW_SETTINGS=<json>: configuração de batalha (como a campanha monta); os
# dois lados ficam com o diretor.
if [ -n "$TW_SETTINGS" ]; then
	python3 - "$TW_SETTINGS" "$MOD/maps/scripts/zz_twtest.js" <<'PY'
import json, os, sys
settings = json.load(open(sys.argv[1]))
settings["ai"] = [int(x) for x in os.environ.get("TW_AI", "1,2").split(",") if x]
code = open(sys.argv[2]).read()
open(sys.argv[2], "w").write("Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger).twTestSettings = " + json.dumps(settings) + ";\n" + code)
PY
fi
sed -e 's|"scripts/TWFieldBattle.js"|"scripts/TWFieldBattle.js", "scripts/zz_twtest.js"|' \
	-e 's|"Name" : "Field Battle"|"Name" : "zz test"|' \
	"$MOD/maps/random/tw_battlefield.json" > "$MOD/maps/random/zz_twtest.json"
if [ -n "$TW_TERRAIN" ]; then
	sed -i "s|tw.terrain) != -1 ? tw.terrain|tw.terrain) != -1 ? tw.terrain : \"$TW_TERRAIN\"; const _x = 0 ? 0|" "$MOD/maps/random/zz_twtest.json"
fi
sed -i 's|"Script" : "tw_battlefield.js"|"Script" : "tw_battlefield.js"|' "$MOD/maps/random/zz_twtest.json"
if [ -n "$TW_STEALTH" ]; then
	sed -i "s|^var TW_STEALTH_TEST = false;|var TW_STEALTH_TEST = true;|" "$MOD/maps/scripts/zz_twtest.js"
fi
if [ -n "$TW_CHOICE" ]; then
	sed -i "s|^var TW_TEST_CHOICE = \"\";|var TW_TEST_CHOICE = \"$TW_CHOICE\";|" "$MOD/maps/scripts/zz_twtest.js"
fi
trap 'rm -f "$MOD/maps/scripts/zz_twtest.js" "$MOD/maps/random/zz_twtest.json"' EXIT

(cd /tmp && timeout "$WAIT" snap run 0ad -mod=public -mod="$NAME" \
	-autostart="random/zz_twtest" -autostart-biome=generic/temperate -autostart-size=${TW_SIZE:-192} -autostart-players=2 \
	-autostart-civ=1:${TW_CIV1:-rome} -autostart-civ=2:${TW_CIV2:-mace} -autostart-ai=1:petra -autostart-ai=2:petra \
	-autostart-victory=endless -autostart-nonvisual -autostart-disable-replay > /dev/null 2>&1)

sed 's/<[^>]*>//g' "$LOG" | grep -E 'twtest|ERROR|WARNING|JavaScript' | grep -v "Petra error: it does not know" | sed 's/^WARNING: \[twtest\] /  /' | cut -c1-700
