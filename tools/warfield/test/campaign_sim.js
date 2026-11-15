/**
 * Simulação da campanha sem o jogo (gjs): carrega os scripts de regra da
 * campanha (gui/campaigns/grand_strategy/game, eventos, estatísticas) com
 * um Engine falso e joga N turnos. O "jogador" recruta, ataca vizinhos e
 * resolve as batalhas automaticamente; a IA joga normalmente.
 *
 * Uso (na pasta do mod):  sh tools/test/campaign_sim.sh [turnos] [civ] [província]
 * Erros de execução aparecem com a pilha; no fim, um resumo por tribo.
 */
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const MOD = ARGV[0];
const PUBLIC = ARGV[1];
const TURNS = +(ARGV[2] || 30);
const CIV = ARGV[3] || "rome";
const START = ARGV[4] || "latium";

function readText(path)
{
	const [ok, data] = GLib.file_get_contents(path);
	// Sem a marca de BOM (o jogo aceita arquivos com ela; JSON.parse não).
	return ok ? ByteArray.toString(data).replace(/^\uFEFF/, "") : null;
}
function findFile(vfsPath)
{
	for (const base of [MOD, PUBLIC])
	{
		const full = base + "/" + vfsPath;
		if (GLib.file_test(full, GLib.FileTest.EXISTS))
			return full;
	}
	return null;
}

const warnings = [];
globalThis.warn = msg => { warnings.push("WARN " + msg); };
globalThis.error = msg => { warnings.push("ERROR " + msg); print("ERROR " + msg); };
globalThis.uneval = v => JSON.stringify(v);
globalThis.translate = s => s;
globalThis.translateWithContext = (c, s) => s;
globalThis.markForTranslation = s => s;
globalThis.coloredText = (s, c) => s;
globalThis.sprintf = (fmt, args) => fmt.replace(/%\((\w+)\)s/g, (m, k) => args && args[k] !== undefined ? args[k] : m).replace(/%%/g, "%");
globalThis.translateObjectKeys = (obj, keys) => {
	for (const k in obj)
		if (obj[k] && typeof obj[k] == "object")
		{
			for (const key of keys)
				if (obj[k][key] && typeof obj[k][key] == "object")
					obj[k][key] = obj[k][key]._string;
			globalThis.translateObjectKeys(obj[k], keys);
		}
};

globalThis.Engine = {
	"openRequest": "openRequest",
	"ReadJSONFile": path => {
		const file = findFile(path);
		return file ? JSON.parse(readText(file)) : undefined;
	},
	"FileExists": path => !!findFile(path),
	"ListDirectoryFiles": (dir, filter, recurse) => {
		const result = [];
		for (const base of [MOD, PUBLIC])
		{
			const full = base + "/" + dir;
			if (!GLib.file_test(full, GLib.FileTest.IS_DIR))
				continue;
			const d = GLib.Dir.open(full, 0);
			let name;
			while ((name = d.read_name()) !== null)
				if (name.endsWith(".json"))
					result.push(dir + name);
		}
		return [...new Set(result)].sort();
	},
	"GetSystemUsername": () => "tester",
	"ConfigDB_GetValue": () => "",
	"GetGUIObjectByName": () => ({}),
	"TryGetGUIObjectByName": () => undefined
};

globalThis.loadCivFiles = () => {
	const civs = {};
	for (const file of Engine.ListDirectoryFiles("simulation/data/civs/", "*.json", false))
	{
		const data = Engine.ReadJSONFile(file);
		// Como no jogo: o nome vem do template, como objeto com contexto.
		data.Name = { "_string": data.Code.toUpperCase(), "context": "civilization" };
		civs[data.Code] = data;
	}
	return civs;
};

const runData = { "data": {}, "filename": "sim", "save": () => {} };
globalThis.CampaignRun = { "getCurrentRun": () => runData };
globalThis.g_CampaignMenu = undefined;

function load(path)
{
	const code = readText(path);
	try
	{
		// Classes e funções de topo viram globais, como na página da GUI.
		(0, eval)(code.replace(/^class (\w+)/mg, "globalThis.$1 = class $1"));
	}
	catch (e)
	{
		print("LOAD ERROR " + path + ": " + e + "\n" + e.stack);
	}
}

load(PUBLIC + "/globalscripts/random.js");
load(PUBLIC + "/globalscripts/utility.js");
const G = MOD + "/gui/campaigns/grand_strategy/";
for (const f of ["game/Army.js", "game/Hero.js", "game/Province.js", "game/Tribe.js", "game/GameData.js"])
	load(G + f);
const listJs = dir => {
	const d = GLib.Dir.open(dir, 0);
	const files = [];
	let name;
	while ((name = d.read_name()) !== null)
		if (name.endsWith(".js"))
			files.push(dir + name);
	return files.sort();
};
for (const f of listJs(G + "game/"))
	load(f);
for (const f of listJs(G + "game/events/"))
	load(f);
load(G + "CampaignStatistics.js");

function summary()
{
	const lines = [];
	for (const code in g_GameData.tribes)
	{
		const t = g_GameData.tribes[code];
		if (!t.controlledProvinces.length && !t.generals.length)
			continue;
		const soldiers = t.generals.reduce((sum, h) => sum + twArmySoldiers(h.battalions), 0);
		lines.push(`  ${code.padEnd(14)} prov ${String(t.controlledProvinces.length).padStart(3)} gold ${String(Math.floor(t.money)).padStart(6)} gen ${t.generals.length} bat ${t.generals.reduce((s, h) => s + h.battalions.length, 0)} soldiers ${soldiers}`);
	}
	return lines.join("\n");
}

let battles = 0;
const captures = {};
const eventCounts = {};
let played = 0;
try
{
	GameData.createNewGame({ "civ": CIV, "tribeName": "Player", "startProvince": START }, "medium");
	print("Início: " + g_GameData.playerHero.getArmySummary() + " em " + START);
	for (let turn = 0; turn < TURNS; ++turn)
	{
		// Jogador: recruta o mais barato disponível e ataca um vizinho fraco.
		const hero = g_GameData.playerHero;
		if (hero && g_GameData.tribes.player.generals.indexOf(hero) != -1)
		{
			const here = g_GameData.provinces[hero.location];
			if (here.ownerTribe == "player")
			{
				const options = twRecruitOptions(here, g_GameData.tribes.player).filter(o => !o.unavailable);
				if (options.length && g_GameData.tribes.player.money > options[0].cost + 200)
					twRecruit(hero, options[0].unit.key);
				if (!here.buildQueue.length)
				{
					const build = here.getBuildableStructures().find(d => here.canBuild(d.id) && here.getBuildingCost(d.id) < g_GameData.tribes.player.money - 400);
					if (build)
						here.startBuilding(build.id);
				}
			}
			const target = here.getLinks().find(code => hero.canAttack(code));
			if (target && hero.battalions.length >= 4)
			{
				const battle = hero.doAttack(target);
				const chance = TWBattle.getPlayerChance(battle);
				const outcome = TWBattle.autoResolve(battle);
				++battles;
				if (g_GameData.pendingCapture)
				{
					const capture = g_GameData.pendingCapture;
					const choice = TWConquest.canVassalize(capture) ? "vassal" : ["occupy", "sack"][battles % 2];
					captures[choice] = (captures[choice] || 0) + 1;
					TWConquest.resolve(capture, choice);
				}
				if (turn % 5 == 0)
					print(`  t${turn} ${outcome.title} (chance ${Math.round(100 * chance)}%)`);
			}
			else if (here.ownerTribe == "player")
			{
				const next = here.getLinks().find(code => hero.canMove(code) && g_GameData.provinces[code].ownerTribe == "player");
				if (next && randBool(0.3))
					hero.doMove(next);
			}
		}
		else if (g_GameData.tribes.player.generals.length)
			g_GameData.playerHero = g_GameData.tribes.player.generals[0];
		else if (g_GameData.tribes.player.controlledProvinces.length)
			g_GameData.recruitGeneral("player");

		let guard = 0;
		while (!g_GameData.doFinishTurn() && ++guard < 100)
			;
		for (const ev of g_GameData.turnEvents)
			eventCounts[ev.type + (ev.data?.target == "player" || ev.data?.from == "player" ? "*" : "")] =
				(eventCounts[ev.type + (ev.data?.target == "player" || ev.data?.from == "player" ? "*" : "")] || 0) + 1;
		// Eventos que pedem o jogador: ataques são resolvidos na hora.
		for (const ev of g_GameData.turnEvents)
			if (ev.needUserInput() && !ev.processed)
			{
				if (ev.type == "attack")
				{
					ev.autoResolve();
					++played;
				}
				else if (ev.type == "revolt" && ev.autoResolve)
					ev.autoResolve();
				ev.processed = true;
			}
		// Salvar e recarregar no meio do teste (serialização).
		if (turn == Math.floor(TURNS / 2))
		{
			const saved = JSON.parse(JSON.stringify(g_GameData.Serialize()));
			const reloaded = new GameData();
			g_GameData = reloaded;
			reloaded.Deserialize(saved);
			print("  t" + turn + " salvo e recarregado: " + g_GameData.playerHero?.getArmySummary());
		}
		if (g_GameData.hasPlayerLost())
		{
			print("Jogador derrotado no turno " + turn);
			break;
		}
	}
}
catch (e)
{
	print("RUNTIME ERROR: " + e + "\n" + e.stack);
}

print(`Turno ${g_GameData.turn}: ${battles} ataques do jogador, ${played} ataques da IA ao jogador.`);
const player = g_GameData.tribes.player;
const capital = g_GameData.provinces[player.getCapital()];
if (capital)
	print(`Capital ${capital.getName()}: ${TW_LEVEL_NAMES[capital.getSettlementLevel()]}, pop ${Math.round(capital.population)}, construções ${capital.buildings.join(",")}`);
print(summary());
print("Eventos (* = envolve o jogador): " + JSON.stringify(eventCounts));
print("Sítios em andamento: " + Object.keys(g_GameData.provinces).filter(c => g_GameData.provinces[c].siege).map(c => c + "(" + g_GameData.provinces[c].siege.tribe + ", t" + g_GameData.provinces[c].siege.turns + ")").join(" ") +
	"; muralhas: " + Object.keys(g_GameData.provinces).filter(c => g_GameData.provinces[c].getWallType() == "stone").length +
	"; sieges=" + (g_GameData.statistics?.GetData?.().timeline || []).filter(e => /siege|surrender/.test(e.text)).length);
const wars = Object.keys(g_GameData.tribes).filter(c => c != "player" && g_GameData.tribes[c].getDiplomacy("player").status === GSDiplomacy.prototype.WAR);
print("Em guerra com o jogador: " + wars.join(", "));
print("Conquistas do jogador: " + JSON.stringify(captures) + "; vassalos: " +
	Object.keys(g_GameData.tribes).filter(c => g_GameData.tribes[c].vassalOf).map(c => c + "->" + g_GameData.tribes[c].vassalOf).join(" "));
const errors = warnings.filter(w => w.startsWith("ERROR"));
const others = [...new Set(warnings.filter(w => !w.startsWith("ERROR")))];
print(`${errors.length} erros, ${others.length} avisos distintos`);
for (const w of others.slice(0, 15))
	print("  " + w.slice(0, 200));

// ------------------------------------------------ acesso militar, melhoramentos, treino
try
{
	const hero = g_GameData.playerHero;
	const upgrades = Object.values(g_GameData.tribes).reduce((n, t) => n + t.generals.reduce((m, h) => m + h.battalions.reduce((k, b) => k + (b.upgrades || []).length, 0), 0), 0);
	print("Acompanhantes comprados (todas as tribos): " + upgrades + "; treino do general do jogador: " + (hero?.drilling || 0));
	if (hero)
	{
		const battalion = hero.battalions[0];
		const options = battalion ? twAttachmentOptions(hero, battalion) : [];
		print("Opções de melhoramento: " + options.map(o => o.kind + (o.unavailable ? "(" + o.unavailable + ")" : "")).join(", "));
		g_GameData.tribes.player.money += 5000;
		const buyable = options.find(o => !o.unavailable);
		if (buyable)
			print("Compra " + buyable.kind + ": " + twBuyAttachment(hero, battalion, buyable.kind) + " -> " + JSON.stringify(battalion.upgrades));
		// Vizinho em paz: entra só com acesso.
		let tested = false;
		for (const next of g_GameData.provinces[hero.location].getLinks())
		{
			const owner = g_GameData.provinces[next]?.ownerTribe;
			if (!owner || owner == "player" || twAtWar("player", owner) || TWConquest.isVassalPair("player", owner) ||
				g_GameData.tribes.player.getDiplomacy(owner).treaties.alliance)
				continue;
			hero.actionsLeft = 5;
			const diplo = g_GameData.tribes.player.getDiplomacy(owner);
			const before = hero.canMove(next);
			const ev = g_GameData.pushTurnEvent(diplo.proposeAccess());
			if (!diplo.treaties.militaryAccess)
			{
				// IA recusou: força para testar o movimento.
				diplo.acceptAccess();
				g_GameData.tribes[owner].getDiplomacy("player").acceptAccess();
			}
			const withAccess = hero.canMove(next);
			const route = twPlanRoute(hero, next);
			g_GameData.pushTurnEvent(diplo.cancelAccess());
			const after = hero.canMove(next);
			print(`Acesso a ${next} (${owner}): sem=${before} proposta aceita=${ev.data.accepted} com=${withAccess} rota=${!!route && !route.battle} revogado=${after} outro lado=${g_GameData.tribes[owner].getDiplomacy("player").treaties.militaryAccess}`);
			tested = true;
			break;
		}
		if (!tested)
			print("Acesso: nenhum vizinho em paz para testar");
		// Treino: dois turnos parado na capital.
		const capitalCode = g_GameData.tribes.player.getCapital();
		if (capitalCode)
		{
			hero.location = capitalCode;
			const xp = hero.battalions.map(b => b.xp || 0).reduce((a, b) => a + b, 0);
			twDrillArmy(hero);
			const gain = twDrillArmy(hero);
			print("Treino na capital: +" + gain + " xp/batalhão, total " + xp + " -> " + hero.battalions.map(b => b.xp || 0).reduce((a, b) => a + b, 0));
			const temple = !hero.battalions.length ? [] : twAttachmentOptions(hero, hero.battalions[0]).map(o => o.kind + (o.unavailable ? "(" + o.unavailable + ")" : ""));
			print("Opções na capital: " + temple.join(", "));
		}
		const saved = JSON.parse(JSON.stringify(g_GameData.Serialize()));
		const events = saved.turnEvents?.length;
		new GameData().Deserialize(saved);
		print("Salvo com eventos novos ok (" + events + " eventos)");
	}
}
catch (e)
{
	print("RUNTIME ERROR (acesso): " + e + "\n" + e.stack);
}

// ------------------------------------------------ conquista: escolha vinda da batalha, vassalo em qualquer província
try
{
	const hero = g_GameData.playerHero;
	const target = hero && g_GameData.provinces[hero.location].getLinks().find(code => {
		const p = g_GameData.provinces[code];
		return p && !p.isSea() && p.ownerTribe != "player" && !g_GameData.getGeneralAtProvince(code, "player");
	});
	if (target && hero.battalions.length)
	{
		const province = g_GameData.provinces[target];
		const owner = province.ownerTribe;
		if (owner)
		{
			g_GameData.tribes.player.getDiplomacy(owner).declareWar();
			g_GameData.tribes[owner].getDiplomacy("player").declareWar();
			delete g_GameData.tribes[owner].vassalOf;
		}
		hero.actionsLeft = 3;
		const battle = TWBattle.create(hero, target);
		battle.playerSide = "attacker";
		const strengths = {};
		for (const b of hero.battalions)
			strengths[b.id] = b.strength;
		for (const b of battle.garrison || [])
			strengths[b.id] = 0;
		const outcome = TWBattle.applyPlayedBattle(battle, { "custom": { "winner": 1, "battalions": strengths, "xp": {}, "generals": {}, "conquestChoice": "vassal" } });
		const newOwner = province.ownerTribe;
		print("Batalha jogada com escolha 'vassal' em " + target + " (dono " + (owner || "nativos") + "): novo dono " + newOwner +
			", vassalo de " + g_GameData.tribes[newOwner]?.vassalOf + ", pendente " + !!g_GameData.pendingCapture + " | " + outcome.report.replace(/\n/g, " / ").slice(-220));
		const saved = JSON.parse(JSON.stringify(g_GameData.Serialize()));
		const reloaded = new GameData();
		reloaded.Deserialize(saved);
		print("Depois de recarregar: " + reloaded.provinces[target].ownerTribe + " vassalo de " + reloaded.tribes[newOwner]?.vassalOf + ", nome " + reloaded.tribes[newOwner]?.getName());
		g_GameData = reloaded;
	}
	else
		print("Conquista: sem província vizinha para testar");
}
catch (e)
{
	print("RUNTIME ERROR (conquista): " + e + "\n" + e.stack);
}

// ------------------------------------------------ modo gui: janelas da campanha
if (ARGV[5] == "gui")
{
	const objects = {};
	Engine.GetGUIObjectByName = name => {
		if (!objects[name])
			objects[name] = {
				"name": name, "hidden": false, "caption": "", "tooltip": "", "sprite": "", "size": "",
				"list": [], "list_data": [], "selected": -1, "enabled": true, "children": [],
				"getComputedSize": () => ({ "left": 0, "top": 0, "right": 1280, "bottom": 800 }),
				"addItem": function(x) { this.list.push(x); }, "parent": {}, "removeItem": function(i) { this.list.splice(i, 1); }, "focus": () => {}, "blur": () => {}
			};
		return objects[name];
	};
	Engine.TryGetGUIObjectByName = Engine.GetGUIObjectByName;
	Engine.SetGlobalHotkey = () => {};
	Engine.TextureExists = () => true;
	Engine.GetPlayerID = () => 1;
	globalThis.handleInputAfterGui = undefined;
	let launched;
	globalThis.GameSettings = class
	{
		init()
		{
			const value = () => ({ "value": undefined, "setValue": function(v) { this.value = v; }, "setValue2": () => {} });
			this.map = { "setType": t => { this.mapType = t; }, "selectMap": m => { this.mapPath = m; } };
			this.mapSize = { "setSize": s => { this.size = s; } };
			this.biome = { "available": new Set(["generic/temperate", "generic/arid", "generic/autumn"]), "setBiome": b => { this.biomeName = b; } };
			this.playerCount = { "setNb": n => { this.players = n; } };
			this.playerCiv = { "civs": [], "setValue": (i, c) => { this.playerCiv.civs[i] = c; } };
			this.nomad = { "setEnabled": () => {} };
			this.victoryConditions = { "fromList": l => { this.victory = l; } };
			this.totalWarfield = value();
			this.campaignData = value();
			return this;
		}
		launchGame() { launched = this; this.finalizedAttributes = {}; }
	};

	load(PUBLIC + "/gui/common/campaigns/utils.js");
	for (const f of ["CivEmblem.js", "EventPanel.js", "InfoTicker.js", "GeneralRecruitment.js"])
		load(G + f);
	for (const f of listJs(G + "windows/"))
		load(f);
	for (const f of ["CampaignWindows.js", "MapAnimator.js", "CampaignMenu.js"])
		load(G + f);

	try
	{
		runData.data.gameData = g_GameData.Serialize();
		let closed;
		const menu = new CampaignMenu(runData, request => { closed = request; });
		menu.initialise();
		menu.render();
		const hero = g_GameData.playerHero;
		const tilesShown = () => Object.keys(objects).filter(n => n.startsWith("mapTile[") && !objects[n].hidden).length;
		menu.zoom = 1;
		menu.render();
		const far = tilesShown();
		menu.zoom = 3;
		menu.clampCamera();
		menu.render();
		print("GUI mapa: blocos visíveis com zoom 1x = " + far + ", com zoom 3x = " + tilesShown() + " (" + (Object.keys(objects).find(n => n.startsWith("mapTile[") && !objects[n].hidden) ? objects[Object.keys(objects).find(n => n.startsWith("mapTile[") && !objects[n].hidden)].sprite : "-") + ")");
		print("GUI: menu ok, general em " + hero.location + ", " + hero.getArmySummary());

		menu.windows.Army.open();
		const visible = prefix => Object.keys(objects).filter(n => n.startsWith(prefix + "Slot[") && !objects[n].hidden).length;
		print("GUI: janela do exército, " + visible("armyBattalion") + " ícones de batalhão, " + visible("armyRecruit") + " ícones de recruta; " +
			"1º recruta: " + Engine.GetGUIObjectByName("armyRecruitIcon[0]").sprite + " / " + Engine.GetGUIObjectByName("armyRecruitCost[0]").caption);
		// Recruta numa província do jogador (a atual pode ter virado vassala).
		if (g_GameData.provinces[hero.location].ownerTribe != "player")
		{
			hero.location = g_GameData.tribes.player.getCapital() || hero.location;
			menu.windows.Army.refresh();
		}
		const index = menu.windows.Army.options.findIndex(o => !o.unavailable);
		if (index != -1)
		{
			Engine.GetGUIObjectByName("armyRecruitSlot[" + index + "]").onPress();
			Engine.GetGUIObjectByName("armyRecruitSlot[" + index + "]").onDoublePress();
		}
		print("GUI: recrutar (duplo clique) -> " + menu.windows.Army.message + "; batalhão 0: " + Engine.GetGUIObjectByName("armyBattalionText[0]").caption +
			" barra " + Engine.GetGUIObjectByName("armyBattalionBar[0]").size);
		menu.windows.Army.close();

		menu.selectedProvince = hero.location;
		menu.windows.Province.display();
		menu.windows.Province.showBuildOptions(g_GameData.provinces[hero.location]);
		print("GUI: província: " + Engine.GetGUIObjectByName("provinceDetailsText").caption.split("\n").slice(0, 4).join(" | "));
		// Província sem dono: linha dos nativos não pode ter "[object".
		const native = Object.keys(g_GameData.provinces).find(c => !g_GameData.provinces[c].ownerTribe && !g_GameData.provinces[c].isSea());
		menu.selectedProvince = native;
		menu.windows.Province.display();
		const nativeText = Engine.GetGUIObjectByName("provinceDetailsText").caption;
		print("GUI: nativos: " + (nativeText.split("\n").find(l => l.startsWith("Natives")) || "?") + (nativeText.indexOf("[object") != -1 ? "  ERRO [object]" : ""));

		// Ataque a um vizinho.
		const here = g_GameData.provinces[hero.location];
		hero.actionsLeft = 2;
		let target = here.getLinks().find(code => hero.canAttack(code));
		if (!target)
		{
			// Força um alvo: província vizinha sem dono.
			target = here.getLinks().find(code => !g_GameData.provinces[code].isSea());
			g_GameData.provinces[target].setOwner(undefined);
		}
		menu.selectedProvince = target;
		menu.windows.Hero.render();
		print("GUI: botão de ataque: " + Engine.GetGUIObjectByName("doAttack").caption + " enabled=" + Engine.GetGUIObjectByName("doAttack").enabled);
		Engine.GetGUIObjectByName("doAttack").onPress();
		print("GUI: janela de batalha: " + Engine.GetGUIObjectByName("battleTitle").caption + " / " + Engine.GetGUIObjectByName("battleOdds").caption.split("\n")[0]);
		menu.windows.Battle.fight();
		const tw = launched && launched.totalWarfield.value;
		if (!tw)
			print("GUI ERRO: a batalha não foi lançada");
		else
		{
			const templates = [].concat(tw.armies["1"], tw.armies["2"]).map(e => e.template);
			const missing = templates.filter(t => !GLib.file_test(MOD + "/simulation/templates/" + t + ".xml", GLib.FileTest.EXISTS));
			print("GUI: batalha lançada: mapa " + launched.mapPath + " tamanho " + launched.size + " civs " + launched.playerCiv.civs.join("/") +
				" terreno " + tw.terrain + ", " + tw.armies["1"].length + " x " + tw.armies["2"].length + " batalhões, generais " +
				JSON.stringify(tw.generals) + (tw.settlement ? ", assentamento " + JSON.stringify(tw.settlement) : "") +
				", templates faltando: " + missing.length);
			if (GLib.getenv("TW_SAVE_BATTLE"))
				GLib.file_set_contents(GLib.getenv("TW_SAVE_BATTLE"), JSON.stringify(tw));
			print("GUI: página aberta: " + JSON.stringify(closed && closed.openRequest && closed.openRequest.page));

			// Volta da batalha: resultado inventado (o jogador vence com metade das tropas).
			const battle = runData.data.pendingBattle;
			const custom = { "totalWarfield": true, "winner": 1, "battalions": {}, "xp": {}, "generals": {} };
			for (const e of tw.armies["1"])
				custom.battalions[e.id] = Math.ceil(e.strength / 2);
			for (const e of tw.armies["2"])
				custom.battalions[e.id] = 0;
			g_GameData.processEndedGame({ "won": true, "custom": custom, "initData": {} });
			print("GUI: depois da batalha: " + g_GameData.lastBattleReport.report.replace(/\n/g, " | ") + " / general em " + hero.location + ", " + hero.getArmySummary());
		}

		// Evento de ataque inimigo no painel de eventos.
		const enemy = Object.values(g_GameData.tribes).find(t => t.code != "player" && t.generals.length);
		if (enemy)
		{
			const ev = new GSAttack({ "attacker": enemy.code, "target": hero.location, "battle": TWBattle.create(enemy.generals[0], hero.location) });
			g_GameData.turnEvents.push(ev);
			menu.eventPanel.renderEvents(g_GameData.turnEvents);
			print("GUI: evento de ataque: " + Engine.GetGUIObjectByName("eventPanelDesc").caption.split("\n").slice(0, 2).join(" "));
		}
		menu.displayEnemyGeneral(enemy.generals[0]);
		const tokens = Object.keys(objects).filter(n => n.startsWith("heroToken[") && !objects[n].hidden);
		print("GUI estandartes: " + tokens.length + " visíveis; 0: " + Engine.GetGUIObjectByName("heroRing[0]").sprite + " / selo " +
			Engine.GetGUIObjectByName("heroBadgeText[0]").caption + " / halo " + !Engine.GetGUIObjectByName("heroGlow[0]").hidden +
			" / tamanho " + Engine.GetGUIObjectByName("heroToken[0]").size + " / " + Engine.GetGUIObjectByName("heroButton[0]").tooltip.replace(/\n/g, " | "));

		// Conquista de capital: janela de escolha e vassalagem.
		{
			const victim = Object.values(g_GameData.tribes).find(t => t.code != "player" && t.controlledProvinces.length >= 2 && !t.vassalOf);
			const capitalCode = victim.getCapital();
			for (const h of victim.generals)
				if (h.location == capitalCode)
					h.location = victim.controlledProvinces.find(c => c != capitalCode);
			g_GameData.provinces[capitalCode].garrison = 0;
			victim.getDiplomacy("player").declareWar();
			g_GameData.tribes.player.getDiplomacy(victim.code).declareWar();
			const strong = twStartingArmy("rome", 8);
			const saved = hero.battalions;
			hero.battalions = strong.concat(saved);
			hero.location = g_GameData.provinces[capitalCode].getLinks()[0];
			hero.actionsLeft = 2;
			const battle = TWBattle.create(hero, capitalCode);
			menu.windows.Battle.open(battle);
			menu.windows.Battle.autoResolve();
			print("GUI capital: relatório \"" + Engine.GetGUIObjectByName("battleReportTitle").caption + "\", pendente=" + !!g_GameData.pendingCapture +
				", fim de turno liberado=" + (menu.render(), Engine.GetGUIObjectByName("finishTurn").enabled));
			if (g_GameData.pendingCapture)
			{
				Engine.GetGUIObjectByName("battleReportClose").onPress();
				print("GUI capital: janela \"" + Engine.GetGUIObjectByName("captureTitle").caption + "\" vassalo habilitado=" + Engine.GetGUIObjectByName("captureVassal").enabled +
					" | " + Engine.GetGUIObjectByName("captureSackText").caption.split("\n")[1]);
				Engine.GetGUIObjectByName("captureVassal").onPress();
				print("GUI capital: " + Engine.GetGUIObjectByName("battleReportText").caption.trim());
				print("GUI capital: dono " + g_GameData.provinces[capitalCode].ownerTribe + ", vassalOf=" + victim.vassalOf +
					", aliança=" + victim.getDiplomacy("player").treaties.alliance + ", status=" + victim.getDiplomacy("player").status);
				const gold = g_GameData.tribes.player.money;
				victim.lastBalance = 200;
				TWConquest.processVassals();
				print("GUI capital: tributo do turno " + (g_GameData.tribes.player.money - gold) + " gold");
				menu.selectedProvince = capitalCode;
				menu.windows.Province.display();
				print("GUI capital: " + Engine.GetGUIObjectByName("provinceDetailsText").caption.split("\n")[1]);
				// Salvar/carregar mantém a vassalagem.
				const saved2 = JSON.parse(JSON.stringify(g_GameData.Serialize()));
				const reloaded = new GameData();
				reloaded.Deserialize(saved2);
				print("GUI capital: depois de recarregar vassalOf=" + reloaded.tribes[victim.code].vassalOf);
			}
			hero.battalions = saved;
		}

		// Cerco: província vizinha inimiga com muralha de pedra.
		const here2 = g_GameData.provinces[hero.location];
		const walledCode = here2.getLinks().find(code => !g_GameData.provinces[code].isSea());
		const walled = g_GameData.provinces[walledCode];
		// Inimiga que não seja vassala (vassalos são aliados: não se sitia).
		const besieged = Object.values(g_GameData.tribes).find(t => t.code != "player" && !t.vassalOf && t.generals.length) || enemy;
		walled.setOwner(besieged.code);
		walled.buildings = ["palisade", "walls"];
		walled.garrison = 3;
		delete walled.siege;
		besieged.getDiplomacy("player").declareWar();
		g_GameData.tribes.player.getDiplomacy(besieged.code).declareWar();
		for (const h of besieged.generals)
			if (h.location == walledCode)
				h.location = besieged.getCapital();
		hero.actionsLeft = 2;
		menu.selectedProvince = walledCode;
		menu.windows.Hero.render();
		Engine.GetGUIObjectByName("doAttack").onPress();
		print("GUI cerco: " + Engine.GetGUIObjectByName("battleOdds").caption.replace(/\n/g, " | ") + " / botão sitiar visível=" + !Engine.GetGUIObjectByName("battleSiege").hidden);
		Engine.GetGUIObjectByName("battleSiege").onPress();
		for (let t = 0; t < 8 && walled.ownerTribe != "player"; ++t)
		{
			if (t == 2)
			{
				// Assalto com os aríetes já feitos: confere o que vai para a batalha.
				hero.actionsLeft = 2;
				const battle = TWBattle.create(hero, walledCode);
				const before = launched;
				TWBattle.launch(battle, () => {});
				const tw2 = launched.totalWarfield.value;
				print("GUI cerco: assalto turno " + walled.siege.turns + ": aríetes " + battle.siegeRams + ", defesa +" + TWBattle.getForces(battle).defender.defenseBonus +
					"%, máquinas enviadas " + JSON.stringify(tw2.armies["1"].filter(e => e.siege)) + ", assentamento " + JSON.stringify(tw2.settlement));
				delete runData.data.pendingBattle;
			}
			const report = TWBattle.processSiege(walledCode);
			print("GUI cerco: turno " + (walled.siege ? walled.siege.turns : "-") + " aríetes " + (walled.siege ? walled.siege.rams : "-") + " guarnição " + walled.garrison + (report ? " -> " + report : ""));
			if (!walled.siege)
				break;
		}
		menu.selectedProvince = walledCode;
		menu.windows.Province.display();
		print("GUI cerco: dono final " + walled.ownerTribe);

		// ---------------------------------------- mapa animado (MapAnimator.js, Routes.js)
		{
			const visibleIn = pool => Object.keys(objects).filter(n => n.startsWith(pool + "[") && !objects[n].hidden);
			const animator = menu.animator;
			menu.zoom = 1.5;
			Engine.GetGUIObjectByName("techTreeWindow").hidden = true;
			// Um sítio em andamento, com fome, para as tendas e o fogo.
			const siegeCode = Object.keys(g_GameData.provinces).find(c => g_GameData.provinces[c].ownerTribe == "player");
			const siegeFrom = g_GameData.provinces[siegeCode].getLinks()[0];
			g_GameData.provinces[siegeCode].siege = { "tribe": enemy.code, "heroId": 0, "turns": 3, "rams": 2, "from": siegeFrom };
			// Marcadores: a batalha e o sítio acima deixaram marcas.
			menu.render();
			print("Mapa: batalhas registradas " + g_TWMapEvents.length + ", marcadores visíveis " + visibleIn("battleMarker").length +
				", fumaça " + visibleIn("mapSmoke").length + ", tendas " + visibleIn("siegeTent").length + ", fogo " + visibleIn("siegeFire").length);
			delete g_GameData.provinces[siegeCode].siege;
			const figures = visibleIn("armyFigure");
			print("Mapa: figuras " + figures.length + " (ex.: " + (figures[0] && objects[figures[0]].sprite) + "), bandeiras " +
				visibleIn("armyFlagCloth").length + ", nuvens " + visibleIn("mapCloud").length + ", estação " +
				Engine.GetGUIObjectByName("seasonText").caption);

			// Rota até uma província a 3+ passos, por terra própria ou sem dono.
			const general = g_GameData.playerHero;
			general.route = [];
			general.actionsLeft = 1;
			const distance = { [general.location]: 0 };
			const queue = [general.location];
			let far;
			while (queue.length && !far)
			{
				const code = queue.shift();
				for (const next of g_GameData.provinces[code].getLinks())
					if (!(next in distance))
					{
						distance[next] = distance[code] + 1;
						queue.push(next);
						const plan = distance[next] >= 3 && twPlanRoute(general, next);
						if (plan && !plan.battle && plan.path.length >= 3)
						{
							far = next;
							break;
						}
					}
			}
			if (!far)
				print("Mapa: sem província distante alcançável para testar a rota");
			else
			{
				const plan = twPlanRoute(general, far);
				animator.setHover(far);
				menu.render();
				print("Mapa: prévia até " + far + ": " + plan.path.join(">") + " turnos " + JSON.stringify(plan.turns) +
					", pontos " + visibleIn("routeDot").length + ", rótulo \"" + Engine.GetGUIObjectByName("routeEndText[0]").caption + "\"");
				animator.clearHover(far);
				menu.displayContextualPanel(far);
				print("Mapa: menu: " + Engine.GetGUIObjectByName("contextPanelButton[0]").caption + " enabled=" + Engine.GetGUIObjectByName("contextPanelButton[0]").enabled);
				const before = general.location;
				Engine.GetGUIObjectByName("contextPanelButton[0]").onPress();
				menu.render();
				const track = animator.tracks[general.id];
				print("Mapa: marcha " + before + " -> " + general.location + ", falta " + JSON.stringify(general.route) +
					", animando=" + !!(track && track.seg) + ", fila " + (track ? track.queue.length : "-"));
				// Próximos turnos: segue sozinho até chegar.
				for (let t = 0; t < 12 && general.route.length; ++t)
				{
					general.actionsLeft = Math.min(g_GameData.tribes.player.techs.getMoveCap(), general.actionsLeft + g_GameData.tribes.player.techs.getMoveRegen());
					const messages = twAdvancePlayerRoutes();
					print("Mapa: turno+" + (t + 1) + ": em " + general.location + ", falta " + general.route.length + (messages.length ? " / " + messages.join(" ") : ""));
				}
				print("Mapa: chegou=" + (general.location == far) + "; rota salva=" + JSON.stringify(general.Serialize().route));
				// Cancelar: ordem para longe e a mesma ordem de novo.
				const back = twPlanRoute(general, before);
				if (back)
				{
					general.actionsLeft = 0;
					twOrderMarch(general, before);
					menu.displayContextualPanel(before);
					const caption = Engine.GetGUIObjectByName("contextPanelButton[0]").caption;
					Engine.GetGUIObjectByName("contextPanelButton[0]").onPress();
					print("Mapa: cancelar: \"" + caption + "\" -> rota " + JSON.stringify(general.route));
				}
			}

			// Troca de dono: transição de cor e anel.
			const someCode = Object.keys(g_GameData.provinces).find(c => !g_GameData.provinces[c].isSea() && g_GameData.provinces[c].ownerTribe != "player");
			const some = g_GameData.provinces[someCode];
			const oldOwner = some.ownerTribe;
			some.setOwner("player");
			menu.render();
			print("Mapa: conquista de " + someCode + ": transição=" + !!animator.colorFades[someCode] + ", anéis " + visibleIn("mapRing").length);
			some.setOwner(oldOwner);

			// Inverno: neve nas terras frias.
			g_GameData.turn = 4;
			const cold = Object.values(g_GameData.provinces).find(p => (p.data.mapTypes || []).indexOf("cold") != -1);
			print("Mapa: " + animator.getSeasonName() + ", neve em " + cold?.code + " = " + animator.snowAmount(cold));
			menu.zoom = 0.5;
			menu.render();
			print("Mapa: zoom 50%: figuras " + visibleIn("armyFigure").length);
		}
		print("GUI: general inimigo: " + Engine.GetGUIObjectByName("battleReportTitle").caption);
	}
	catch (e)
	{
		print("GUI RUNTIME ERROR: " + e + "\n" + e.stack);
	}
	const errors = warnings.filter(w => w.startsWith("ERROR"));
	print("GUI: " + errors.length + " erros");
}
