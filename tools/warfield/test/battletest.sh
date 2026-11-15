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
# TW_MAP=tw_naval: batalha naval (o script de teste entra por último).
python3 - "$MOD/maps/random/${TW_MAP:-tw_battlefield}.json" "$MOD/maps/random/zz_twtest.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
data["settings"]["Name"] = "zz test"
data["settings"]["TriggerScripts"].append("scripts/zz_twtest.js")
json.dump(data, open(sys.argv[2], "w"), indent="\t")
PY
if [ -n "$TW_TERRAIN" ]; then
	echo "TW_TERRAIN: use TW_SETTINGS com \"terrain\" (o mapa lê settings.TotalWarfield.terrain)" >&2
fi

if [ -n "$TW_STEALTH" ]; then
	sed -i "s|^var TW_STEALTH_TEST = false;|var TW_STEALTH_TEST = true;|" "$MOD/maps/scripts/zz_twtest.js"
fi
if [ -n "$TW_CRUSH" ]; then
	sed -i "s|^var TW_CRUSH_TEST = false;|var TW_CRUSH_TEST = true;|" "$MOD/maps/scripts/zz_twtest.js"
fi
if [ -n "$TW_CHOICE" ]; then
	sed -i "s|^var TW_TEST_CHOICE = \"\";|var TW_TEST_CHOICE = \"$TW_CHOICE\";|" "$MOD/maps/scripts/zz_twtest.js"
fi
# TW_CAMPAIGN_RUN=<nome>: partida de campanha de verdade (campaignData com o
# save <nome>.0adcampaign), como a campanha lança: no fim a sessão roda a
# página endgame da campanha, que grava o resultado no save.
CUR_RUN=""
if [ -n "$TW_CAMPAIGN_RUN" ]; then
	# A página endgame grava na campanha "atual" (user.cfg): guarda uma
	# cópia dela e devolve no fim.
	CFG="$HOME/snap/0ad/$REV/.config/0ad/config/user.cfg"
	CUR_RUN=$(sed -n 's/^currentcampaign = "\(.*\)"/\1/p' "$CFG" 2>/dev/null)
	SAVES="$HOME/snap/0ad/$REV/.local/share/0ad/saves/campaigns"
	[ -n "$CUR_RUN" ] && cp "$SAVES/$CUR_RUN.0adcampaign" "/tmp/tw_current_run_backup.0adcampaign"
	mkdir -p "$MOD/autostart"
	python3 - "$TW_CAMPAIGN_RUN" "$MOD/autostart/autostart.js" <<'PY'
import json, sys
open(sys.argv[2], "w").write("""async function autoStart(cmdLineArgs)
{
	const playerAssignments = { "local": { "player": 1, "name": "tester" } };
	const settings = new GameSettings().init();
	settings.cheats.setEnabled(true);
	parseCmdLineArgs(settings, cmdLineArgs);
	settings.victoryConditions.fromList([]);
	settings.campaignData.value = { "run": %s, "province": "test", "totalWarfield": true };
	settings.launchGame(playerAssignments, false);
	return ["page_loading.xml", { "attribs": settings.finalizedAttributes, "playerAssignments": playerAssignments }];
}
""" % json.dumps(sys.argv[1]))
PY
fi
trap 'rm -f "$MOD/maps/scripts/zz_twtest.js" "$MOD/maps/random/zz_twtest.json" "$MOD/autostart/autostart.js"; rmdir "$MOD/autostart" 2>/dev/null; if [ -n "$CUR_RUN" ]; then cp "$SAVES/$CUR_RUN.0adcampaign" "/tmp/tw_endgame_result.0adcampaign"; mv "/tmp/tw_current_run_backup.0adcampaign" "$SAVES/$CUR_RUN.0adcampaign"; fi' EXIT

(cd /tmp && timeout "$WAIT" snap run 0ad -mod=public -mod="$NAME" \
	-autostart="random/zz_twtest" -autostart-biome=generic/temperate -autostart-size=${TW_SIZE:-192} -autostart-players=2 \
	-autostart-civ=1:${TW_CIV1:-rome} -autostart-civ=2:${TW_CIV2:-mace} ${TW_VISUAL:+-autostart-player=1} -autostart-ai=1:petra -autostart-ai=2:petra \
	-autostart-victory=endless ${TW_VISUAL:+-xres=1024 -yres=700}${TW_VISUAL:--autostart-nonvisual} -autostart-disable-replay > /dev/null 2>&1)

sed 's/<[^>]*>//g' "$LOG" | grep -E 'twtest|ERROR|WARNING|JavaScript' | grep -v "Petra error: it does not know" | sed 's/^WARNING: \[twtest\] /  /' | cut -c1-700
