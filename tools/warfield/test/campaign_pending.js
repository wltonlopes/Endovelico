/**
 * Lê um save de campanha (.0adcampaign) e monta, com os scripts reais
 * (TWBattle.launch), a configuração da batalha pendente dele. Grava em
 * <saída> {settings, civs, size}; use com battletest.sh (TW_SETTINGS) ou
 * campaign_battle.sh.
 * Uso: gjs campaign_pending.js <campaign_sim.js> <mod> <public extraído> <save> <saída>
 */
const GLib = imports.gi.GLib;
const SIM = ARGV[0], MOD = ARGV[1], PUB = ARGV[2], RUNFILE = ARGV[3]; globalThis.OUT = ARGV[4];
let src = imports.byteArray.toString(GLib.file_get_contents(SIM)[1]);
src = src.slice(0, src.indexOf("let battles = 0;"));
src = src.replace("const MOD = ARGV[0];", "const MOD = '" + MOD + "';").replace("const PUBLIC = ARGV[1];", "const PUBLIC = '" + PUB + "';");
src += `
const saved = JSON.parse(readText(${JSON.stringify(RUNFILE)}));
runData.data = saved.data;
const gd = typeof saved.data.gameData == "string" ? JSON.parse(saved.data.gameData) : saved.data.gameData;
globalThis.g_GameData = new GameData();
g_GameData.Deserialize(gd);
let launched;
globalThis.GameSettings = class {
	init() {
		const value = () => ({ "value": undefined, "setValue": function(v) { this.value = v; } });
		this.map = { "setType": () => {}, "selectMap": () => {} };
		this.mapSize = { "setSize": s => { this.size = s; } };
		this.biome = { "available": new Set(["generic/temperate"]), "setBiome": () => {} };
		this.playerCount = { "setNb": () => {} };
		this.playerCiv = { "civs": [], "setValue": (i, c) => { this.playerCiv.civs[i] = c; } };
		this.nomad = { "setEnabled": () => {} };
		this.victoryConditions = { "fromList": () => {} };
		this.totalWarfield = value(); this.campaignData = value();
		return this;
	}
	launchGame() { launched = this; this.finalizedAttributes = {}; }
};
Engine.openRequest = "openRequest";
const battle = saved.data.pendingBattle;
TWBattle.launch(battle, () => {});
const tw = launched.totalWarfield.value;
print("civs " + launched.playerCiv.civs.join("/") + " size " + launched.size + " defender " + tw.defender + " settlement " + JSON.stringify(tw.settlement && { level: tw.settlement.level, walls: tw.settlement.walls }) + " armies " + tw.armies[1].length + "/" + tw.armies[2].length);
GLib.file_set_contents(OUT, JSON.stringify({ "settings": tw, "civs": launched.playerCiv.civs, "size": launched.size }));
`;
(0, eval)(src);
