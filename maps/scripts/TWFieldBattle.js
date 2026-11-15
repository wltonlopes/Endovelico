/**
 * Batalha de campo (Total Warfield).
 *
 * Configuração em InitAttributes.settings.TotalWarfield (a campanha monta,
 * ver gui/campaigns/grand_strategy/game/Battle.js):
 *   armies:     { "<jogador>": [{ "id", "template", "strength", "xp" }] }
 *   generals:   { "<jogador>": { "id", "template", "name" } }
 *   ai:         [jogadores comandados pelo "diretor" deste script]
 *   defender:   jogador que defende (espera o inimigo em posição)
 *   settlement: { "player", "civ", "level": "village"|"town"|"city",
 *                 "walls": "stone"|"palisade"|undefined }
 *   Entradas de exército com "siege": true são máquinas de cerco avulsas
 *   ("strength" máquinas do template), não batalhões.
 * Sem configuração (partida comum no mapa Field Battle), cada jogador
 * recebe um exército aleatório da sua civ e o diretor comanda as IAs.
 *
 * O jogador 1 desdobra ao sul, o 2 ao norte (as mesmas posições do mapa
 * maps/random/tw_battlefield.js). Perde quem ficar sem nenhum batalhão em
 * condição de lutar (todos mortos ou em fuga; o general sozinho não conta)
 * por alguns segundos: aí o exército inteiro foge para a borda do seu lado
 * e quem sai do campo volta, em parte, ao exército (TWStartFlight). Ou
 * perder o centro do assentamento que defende. No fim, a campanha recebe
 * os sobreviventes de cada batalhão (OnCampaignGameEnd).
 */

/** Distância das zonas de desdobramento ao centro (fração do mapa). */
var TW_DEPLOY_DISTANCE = 0.32;
/** Espaço entre batalhões e entre linhas (m). */
var TW_DEPLOY_GAP = 5;
var TW_DEPLOY_LINE_GAP = 12;
/** Largura máxima de uma linha (fração do mapa). */
var TW_DEPLOY_MAX_WIDTH = 0.6;
/** Intervalos do diretor e da checagem de vitória (ms). */
var TW_DIRECTOR_INTERVAL = 3000;
var TW_VICTORY_INTERVAL = 2000;
/** Segundos sem batalhões em condição de lutar até a derrota. */
var TW_ROUT_DEFEAT_TIME = 8;
/** Fuga do exército derrotado: tempo máximo até o fim da batalha (s). */
var TW_FLIGHT_TIME = 60;
/**
 * Fim decisivo: um lado reduzido a TW_CRUSHED_FRACTION dos soldados, diante
 * de um inimigo com TW_CRUSHED_ODDS vezes mais, debanda. Sem nenhum golpe
 * por TW_STALEMATE_TIME s depois de já ter havido combate, o lado que
 * perdeu TW_STALEMATE_LOSS dos soldados e tem TW_STALEMATE_ODDS vezes
 * menos também debanda: a batalha não fica parada esperando o último
 * batalhão (atrás dos muros, no acampamento ou longe da luta).
 */
var TW_CRUSHED_FRACTION = 0.25;
var TW_CRUSHED_ODDS = 2;
var TW_STALEMATE_TIME = 45;
var TW_STALEMATE_LOSS = 0.3;
var TW_STALEMATE_ODDS = 1.5;
/** Parte dos soldados que escaparam pela borda e voltam ao exército. */
var TW_ESCAPE_RETURN_MIN = 0.6;
var TW_ESCAPE_RETURN_MAX = 0.9;
/** Batalhão derrotado ainda no campo quando a batalha acaba: sobreviventes capturados/dispersos. */
var TW_CAUGHT_SURVIVAL = 0.25;
/** Tempo até a IA avançar (s), para o jogador poder se posicionar. */
var TW_AI_DEPLOY_TIME = 20;
var TW_ROSTER_PATH = "simulation/data/total_warfield/rosters/";

Trigger.prototype.TWSetup = function()
{
	if (this.twSetupDone)
		return;
	this.twSetupDone = true;

	// twTestSettings: só para tools/test/battletest.sh (TW_SETTINGS).
	const settings = this.twTestSettings || InitAttributes.settings.TotalWarfield || {};
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager.GetNumPlayers();
	this.twSettings = settings;
	this.twArmies = {};
	this.twGenerals = {};
	this.twInitial = {};
	this.twRoutTimers = {};
	this.twEscaped = {};
	this.twGeneralEscaped = {};
	this.twFlight = undefined;
	this.twFinished = false;
	this.twCampaign = !!settings.armies;

	this.twSiege = {};
	this.twWalls = {};
	this.twBreached = {};
	// Muralhas primeiro: os defensores desdobram dentro delas.
	if (settings.settlement && settings.settlement.walls)
		this.TWBuildWalls(settings.settlement);
	// A cidade antes dos exércitos (ninguém nasce dentro de um prédio).
	if (settings.settlement)
		this.TWBuildSettlement(settings.settlement);

	for (let playerID = 1; playerID < numPlayers; ++playerID)
	{
		const army = settings.armies ? settings.armies[playerID] || [] : this.TWRandomArmy(playerID);
		const general = settings.generals ? settings.generals[playerID] : this.TWRandomGeneral(playerID);
		this.TWDeployArmy(playerID, army, general);
	}

	this.twAI = settings.ai ? settings.ai.map(Number) :
		Array.from({ "length": numPlayers - 1 }, (_, i) => i + 1).filter(p => QueryPlayerIDInterface(p).IsAI());
	// Só o diretor comanda esses lados (a Petra fica sem efeito, ver
	// simulation/helpers/ZZ_TWCommands.js).
	this.twDirectorActive = false;

	this.DoRepeatedly(TW_VICTORY_INTERVAL, "TWCheckVictory", {});
	this.DoRepeatedly(TW_DIRECTOR_INTERVAL, "TWDirector", {});
};

// ------------------------------------------------ desdobramento

Trigger.prototype.TWGetDeployCenter = function(playerID)
{
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const south = playerID % 2 == 1;
	return {
		"x": mapSize / 2,
		"y": mapSize / 2 + (south ? -1 : 1) * mapSize * TW_DEPLOY_DISTANCE
	};
};

/** Para onde foge quem está em `pos`: a borda do mapa do próprio lado. */
Trigger.prototype.TWGetRetreatPoint = function(playerID, pos)
{
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const south = playerID % 2 == 1;
	return { "x": pos ? pos.x : mapSize / 2, "y": south ? 1 : mapSize - 1 };
};

/**
 * Batalhão saiu do campo pela borda (BattalionLeader.Escape): uma parte
 * dos soldados volta ao exército, o resto se dispersa.
 */
Trigger.prototype.TWBattalionEscaped = function(ent, id, strength, owner)
{
	if (id === undefined || !this.twEscaped)
		return;
	const returned = Math.round(strength * randFloat(TW_ESCAPE_RETURN_MIN, TW_ESCAPE_RETURN_MAX));
	const xp = Math.round(Engine.QueryInterface(ent, IID_BattalionLeader)?.GetCurrentXp() || 0);
	this.twEscaped[id] = { "player": owner, "strength": strength, "returned": returned, "xp": xp,
		"attachments": Engine.QueryInterface(ent, IID_BattalionLeader)?.escapedAttachments || [] };
	// Último do exército em fuga saindo: fecha a batalha antes de ele sumir
	// (senão a vitória por conquista termina a partida sem o resultado).
	if (this.twFlight && this.twFlight.player == owner && !this.twFinished &&
		!this.TWLeadersOf(owner).length && !this.TWGeneralAlive(owner))
		this.TWDefeat(owner, markForTranslation("%(player)s's army has been routed."));
	Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).PushNotification({
		"type": "text",
		"players": [owner],
		"message": markForTranslation("A routed battalion has left the field; some of its soldiers will rejoin the army."),
		"translateMessage": true
	});
};

Trigger.prototype.TWReadRoster = function(civ)
{
	if (!this.twRosters)
		this.twRosters = {};
	if (this.twRosters[civ] === undefined)
	{
		const path = TW_ROSTER_PATH + civ + ".json";
		this.twRosters[civ] = Engine.FileExists(path) ? Engine.ReadJSONFile(path) : null;
	}
	return this.twRosters[civ];
};

/** Exército de demonstração: linha de infantaria, atiradores, cavalaria e um campeão. */
Trigger.prototype.TWRandomArmy = function(playerID)
{
	const civ = QueryPlayerIDInterface(playerID, IID_Identity)?.GetCiv();
	const roster = this.TWReadRoster(civ);
	if (!roster)
		return [];
	const byCategory = category => roster.units.filter(u => u.category == category);
	const pick = (list, count) => list.length ? Array.from({ "length": count }, () => pickRandom(list)) : [];
	const units = [].concat(
		pick(byCategory("infantry_melee"), 4),
		pick(byCategory("infantry_ranged"), 2),
		pick(byCategory("cavalry_melee").concat(byCategory("cavalry_ranged")), 2),
		pick(byCategory("champion_infantry").concat(byCategory("champion_cavalry"), byCategory("elephant"), byCategory("chariot")), 1));
	const attachments = Object.keys(roster.attachments || {});
	return units.map((unit, i) => ({
		"id": "demo_" + playerID + "_" + i, "template": unit.template, "strength": unit.size, "xp": 0,
		// Demonstração: alguns batalhões levam um acompanhante.
		"attachments": attachments.length && i % 3 == 0 ? [{ "kind": attachments[i % attachments.length], "template": roster.attachments[attachments[i % attachments.length]].template }] : undefined
	}));
};

Trigger.prototype.TWRandomGeneral = function(playerID)
{
	const civ = QueryPlayerIDInterface(playerID, IID_Identity)?.GetCiv();
	const roster = this.TWReadRoster(civ);
	if (!roster || !roster.heroes.length)
		return undefined;
	const hero = pickRandom(roster.heroes);
	return { "id": "demo_general_" + playerID, "template": hero.template, "name": hero.name };
};

/**
 * Coloca o exército em linhas: atiradores à frente, infantaria pesada no
 * meio com a cavalaria nas pontas, reserva (elefantes e excedentes) atrás
 * e o general atrás do centro.
 */
Trigger.prototype.TWDeployArmy = function(playerID, army, general)
{
	const cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const center = this.TWGetDeployCenter(playerID);
	const angle = center.y < mapSize / 2 ? 0 : Math.PI;
	const forward = new Vector2D(Math.sin(angle), Math.cos(angle));
	const right = new Vector2D(Math.cos(angle), -Math.sin(angle));
	const maxWidth = mapSize * TW_DEPLOY_MAX_WIDTH;

	const walls = this.twWalls[playerID];
	const insideWalls = !!walls;
	const maxLineWidth = insideWalls ? walls.radius * 0.9 : maxWidth;
	const entries = [];
	const siegeEngines = [];
	for (const unit of army)
	{
		if (unit.siege)
		{
			if (cmpTemplateManager.TemplateExists(unit.template))
				siegeEngines.push(unit);
			continue;
		}
		const data = cmpTemplateManager.GetTemplate(unit.template);
		if (!data || !data.BattalionLeader)
		{
			warn("Total Warfield: unknown battalion template '" + unit.template + "'.");
			continue;
		}
		const columns = +data.BattalionLeader.Columns;
		const spacing = +data.BattalionLeader.Spacing;
		const size = Math.min(+data.BattalionLeader.Size, unit.strength || +data.BattalionLeader.Size);
		entries.push({
			"unit": unit,
			"category": data.BattalionLeader.Category || "infantry_melee",
			"width": Math.min(columns, size) * spacing,
			"depth": (Math.ceil((size - 1) / columns) + 1) * spacing
		});
	}

	const line = cats => entries.filter(e => cats.indexOf(e.category) != -1);
	const skirmish = line(["infantry_ranged"]);
	const main = line(["infantry_melee", "champion_infantry"]);
	const flanks = line(["cavalry_melee", "cavalry_ranged", "champion_cavalry", "chariot"]);
	const reserve = line(["elephant"]);

	// Linha principal com a cavalaria dividida entre as pontas.
	const left = flanks.filter((e, i) => i % 2 == 0);
	const rightFlank = flanks.filter((e, i) => i % 2 == 1);
	const mainLine = left.reverse().concat(main, rightFlank);

	const rows = [];
	const pushRows = list => {
		let row = [];
		let width = 0;
		for (const entry of list)
		{
			if (row.length && width + entry.width > maxLineWidth)
			{
				rows.push(row);
				row = [];
				width = 0;
			}
			row.push(entry);
			width += entry.width + TW_DEPLOY_GAP;
		}
		if (row.length)
			rows.push(row);
	};
	pushRows(skirmish);
	const mainStart = rows.length;
	pushRows(mainLine);
	pushRows(reserve);

	// Frente começa à frente do centro da zona; cada linha vai para trás.
	// Dentro de muralhas, mais perto do centro.
	let offset = insideWalls ? 25 : skirmish.length ? 30 : 15;
	let generalOffset = offset;
	rows.forEach((row, rowIndex) => {
		const total = row.reduce((sum, e) => sum + e.width, 0) + TW_DEPLOY_GAP * (row.length - 1);
		let side = -total / 2;
		for (const entry of row)
		{
			const middle = side + entry.width / 2;
			side += entry.width + TW_DEPLOY_GAP;
			let pos = new Vector2D(center.x, center.y).add(Vector2D.mult(forward, offset)).add(Vector2D.mult(right, middle));
			if (insideWalls)
			{
				// Longe do anel da muralha (senão nasce em cima dela).
				const fromCenter = Vector2D.sub(pos, walls.center);
				const limit = walls.radius - 14;
				if (fromCenter.length() > limit)
					pos = Vector2D.add(walls.center, fromCenter.normalize().mult(limit));
			}
			this.TWSpawnBattalion(playerID, entry.unit, pos, angle);
		}
		offset -= Math.max(...row.map(e => e.depth)) + TW_DEPLOY_LINE_GAP;
		if (rowIndex == mainStart)
			generalOffset = offset;
	});

	// Máquinas de cerco: atrás da linha principal, lado a lado.
	let siegeIndex = 0;
	const siegeTotal = siegeEngines.reduce((sum, unit) => sum + Math.max(1, Math.round(unit.strength || 1)), 0);
	for (const unit of siegeEngines)
	{
		const count = Math.max(1, Math.round(unit.strength || 1));
		this.twSiege[unit.id] = { "player": playerID, "base": this.TWSiegeBase(unit.template), "count": count };
		this.twInitial[unit.id] = { "player": playerID, "strength": count, "siege": true };
		for (let i = 0; i < count; ++i, ++siegeIndex)
		{
			const side = (siegeIndex - (siegeTotal - 1) / 2) * 16;
			const pos = new Vector2D(center.x, center.y).add(Vector2D.mult(forward, generalOffset - 20)).add(Vector2D.mult(right, side));
			const ent = this.TWSpawnEntity(unit.template, playerID, pos, angle);
			if (ent)
				Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
		}
	}

	if (general && general.template && cmpTemplateManager.TemplateExists(general.template))
	{
		const pos = new Vector2D(center.x, center.y).add(Vector2D.mult(forward, generalOffset - 6));
		const ent = this.TWSpawnEntity(general.template, playerID, pos, angle);
		if (ent)
		{
			Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
			this.twGenerals[playerID] = { "ent": ent, "id": general.id, "name": general.name };
		}
	}
};

Trigger.prototype.TWSpawnEntity = function(template, playerID, pos, angle)
{
	const ent = Engine.AddEntity(template);
	if (ent == INVALID_ENTITY)
	{
		warn("Total Warfield: could not create '" + template + "'.");
		return undefined;
	}
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition)
	{
		Engine.DestroyEntity(ent);
		return undefined;
	}
	cmpPosition.JumpTo(pos.x, pos.y);
	cmpPosition.SetYRotation(angle);
	return ent;
};

Trigger.prototype.TWSpawnBattalion = function(playerID, unit, pos, angle)
{
	const ent = this.TWSpawnEntity(unit.template, playerID, pos, angle);
	if (!ent)
		return;
	const cmpLeader = Engine.QueryInterface(ent, IID_BattalionLeader);
	if (cmpLeader)
	{
		cmpLeader.SetCampaignData({ "id": unit.id, "strength": unit.strength, "xp": unit.xp, "attachments": unit.attachments });
		this.twInitial[unit.id] = { "player": playerID, "strength": Math.min(unit.strength || cmpLeader.GetMaxStrength(), cmpLeader.GetMaxStrength()) };
	}
	// Receber o dono cria os soldados em volta do líder.
	Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
	// Desdobra na formação típica da cultura (falange, parede de escudos...).
	const cmpTactics = Engine.QueryInterface(ent, IID_BattalionTactics);
	const preferred = cmpTactics && cmpTactics.GetPreferredFormation();
	if (preferred)
		cmpTactics.SetPosture(preferred);
};

/**
 * IA: testudo sob chuva de projéteis (sem inimigo corpo a corpo perto);
 * fora disso, a formação típica da cultura.
 */
Trigger.prototype.TWChooseFormation = function(ent, targets)
{
	const cmpTactics = Engine.QueryInterface(ent, IID_BattalionTactics);
	if (!cmpTactics || cmpTactics.GetAvailablePostures().indexOf("testudo") == -1)
		return;
	const pos = this.TWPosition(ent);
	let missiles = false;
	let melee = false;
	for (const target of targets)
	{
		const other = this.TWPosition(target);
		if (!other)
			continue;
		const distance = pos.distanceTo(other);
		const types = Engine.QueryInterface(target, IID_Attack)?.GetAttackTypes() || [];
		if (types.indexOf("Ranged") != -1 && distance < 80)
			missiles = true;
		if (types.indexOf("Melee") != -1 && distance < 30)
			melee = true;
	}
	const wanted = missiles && !melee ? "testudo" : cmpTactics.GetPreferredFormation() || "normal";
	if (cmpTactics.posture != wanted)
		cmpTactics.SetPosture(wanted);
};

/** Raio do anel de muralha (m) por nível do assentamento. */
var TW_WALL_RADIUS = { "village": 82, "town": 96, "city": 112 };

/** Template de cerco sem a variação montada/desmontada (_packed/_unpacked). */
Trigger.prototype.TWSiegeBase = function(template)
{
	return template.replace(/_(packed|unpacked)$/, "");
};

/** Conjunto de muralha da civ: "stone" (primeiro wallset de pedra) ou paliçada. */
Trigger.prototype.TWWallSet = function(civ, type)
{
	const cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	const civData = Engine.ReadJSONFile("simulation/data/civs/" + civ + ".json");
	const sets = (civData && civData.WallSets || []).concat(["structures/wallset_palisade"]);
	const wanted = type == "stone" ? sets.find(set => set.indexOf("stone") != -1) : "structures/wallset_palisade";
	const set = wanted && cmpTemplateManager.GetTemplate(wanted);
	return set && set.WallSet ? set.WallSet.Templates : undefined;
};

/**
 * Anel de muralha em volta da zona do defensor: torres nas juntas, muros
 * longos entre elas, um portão virado para o atacante e outro atrás (por
 * onde os defensores podem fugir). Mesma geometria do rmgen
 * (placeCircularWall): ponto (R cos a, -R sin a), rotação a + π.
 */
Trigger.prototype.TWBuildWalls = function(settlement)
{
	const playerID = +settlement.player;
	const civ = settlement.civ || QueryPlayerIDInterface(playerID, IID_Identity)?.GetCiv();
	const pieces = this.TWWallSet(civ, settlement.walls);
	if (!pieces)
		return;
	const cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	const lengthOf = template => +(cmpTemplateManager.GetTemplate(template)?.WallPiece?.Length || 0);
	const wallLength = lengthOf(pieces.WallLong);
	const towerLength = lengthOf(pieces.Tower);
	if (!wallLength)
		return;

	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const deploy = this.TWGetDeployCenter(playerID);
	const center = new Vector2D(deploy.x, deploy.y);
	const radius = TW_WALL_RADIUS[settlement.level] || TW_WALL_RADIUS.town;
	const count = Math.max(6, Math.round(2 * Math.PI * radius / (wallLength + towerLength * 0.6)));
	const step = 2 * Math.PI / count;
	// Portão da frente no muro 0, virado para o centro do mapa (o atacante).
	const front = deploy.y < mapSize / 2 ? -Math.PI / 2 : Math.PI / 2;
	const start = front - step / 2;
	const back = Math.round(count / 2);

	const walls = { "center": center, "radius": radius, "player": playerID, "pieces": [], "gates": [] };
	const place = (template, angle) => {
		const pos = Vector2D.add(center, new Vector2D(radius * Math.cos(angle), -radius * Math.sin(angle)));
		const ent = this.TWSpawnEntity(template, playerID, pos, angle + Math.PI);
		if (!ent)
			return undefined;
		Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
		walls.pieces.push(ent);
		return ent;
	};
	for (let i = 0; i < count; ++i)
	{
		const angle = start + i * step;
		place(pieces.Tower, angle);
		const gate = i == 0 || i == back;
		const ent = place(gate && pieces.Gate ? pieces.Gate : pieces.WallLong, angle + step / 2);
		if (gate && ent)
			walls.gates.push(ent);
	}
	walls.initial = walls.pieces.length;
	this.twWalls[playerID] = walls;
};

/** Peças de muralha ainda de pé. */
Trigger.prototype.TWWallPieces = function(playerID)
{
	const walls = this.twWalls && this.twWalls[playerID];
	if (!walls)
		return [];
	return walls.pieces.filter(ent => (Engine.QueryInterface(ent, IID_Health)?.GetHitpoints() || 0) > 0 &&
		Engine.QueryInterface(ent, IID_Position)?.IsInWorld());
};

/** A muralha do defensor foi rompida (portão ou muro derrubado)? */
Trigger.prototype.TWIsBreached = function(playerID)
{
	const walls = this.twWalls && this.twWalls[playerID];
	if (!walls)
		return true;
	if (!this.twBreached[playerID] && this.TWWallPieces(playerID).length < walls.initial)
	{
		this.twBreached[playerID] = true;
		Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).PushNotification({
			"type": "text",
			"players": Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetAllPlayers(),
			"message": markForTranslation("The walls have been breached!"),
			"translateMessage": true
		});
	}
	return !!this.twBreached[playerID];
};

/** Máquinas de cerco vivas de um jogador. */
Trigger.prototype.TWSiegeOf = function(playerID)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	return cmpRangeManager.GetEntitiesByPlayer(playerID).filter(ent =>
		Engine.QueryInterface(ent, IID_Identity)?.HasClass("Siege") && Engine.QueryInterface(ent, IID_UnitAI) &&
		(Engine.QueryInterface(ent, IID_Health)?.GetHitpoints() || 0) > 0 && Engine.QueryInterface(ent, IID_Position)?.IsInWorld());
};

/**
 * Construções da campanha (province_buildings.json) -> estruturas da civ
 * que aparecem na cidade da batalha.
 */
var TW_SETTLEMENT_STRUCTURES = {
	"farmland": ["farmstead", "field", "field"],
	"barracks": ["barracks"],
	"range": ["range"],
	"market": ["market"],
	"stable": ["stable"],
	"temple": ["temple"],
	"philosopher_academy": ["gymnasium", "library", "theater"],
	"siege_workshop": ["arsenal"],
	"elephant_stable": ["elephant_stable"],
	"fortress": ["fortress"],
	"watchtower": ["defense_tower"],
	"port": ["storehouse"]
};
/** Cidade padrão por nível (batalha avulsa, ou além do que a campanha manda). */
var TW_SETTLEMENT_DEFAULT = {
	"village": { "houses": 6, "extra": ["storehouse", "farmstead", "corral", "field", "field"], "towers": 2 },
	"town": { "houses": 10, "extra": ["storehouse", "farmstead", "market", "temple", "forge", "field", "field"], "towers": 3 },
	"city": { "houses": 14, "extra": ["storehouse", "market", "temple", "forge", "barracks", "gymnasium", "theater", "library", "field"], "towers": 4 }
};

/**
 * Cidade do defensor: centro cívico e, em anéis em volta dele, casas e as
 * construções da província (ou as típicas do nível). Ficam livres a praça
 * diante do centro (onde o exército se posta) e as ruas até os portões;
 * cada prédio só fica onde o jogo aceitaria construí-lo (sem sobrepor
 * nada, em terreno bom). Sem muralha, torres guardam a frente e os campos
 * ficam por fora.
 */
Trigger.prototype.TWBuildSettlement = function(settlement)
{
	const playerID = +settlement.player;
	const civ = settlement.civ || QueryPlayerIDInterface(playerID, IID_Identity)?.GetCiv();
	const level = TW_SETTLEMENT_DEFAULT[settlement.level] ? settlement.level : "village";
	const cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const deploy = this.TWGetDeployCenter(playerID);
	const back = deploy.y < mapSize / 2 ? -1 : 1;
	const walls = this.twWalls[playerID];
	const town = new Vector2D(deploy.x, deploy.y + back * (walls ? walls.radius * 0.3 : 70));
	const forward = new Vector2D(0, -back);
	const templateOf = name => {
		const template = "structures/" + civ + "/" + name;
		return cmpTemplateManager.TemplateExists(template) ? template : undefined;
	};
	const sizeOf = template => {
		const footprint = cmpTemplateManager.GetTemplate(template)?.Footprint;
		if (footprint?.Square)
			return Math.max(+footprint.Square["@width"], +footprint.Square["@depth"]);
		return footprint?.Circle ? 2 * +footprint.Circle["@radius"] : 16;
	};

	// Lugar livre e permitido? Ruas, praça, muralha e borda ficam de fora.
	const allowed = (pos, size) => {
		const rel = Vector2D.sub(pos, town);
		const along = rel.dot(forward);
		const across = Math.abs(rel.x * forward.y - rel.y * forward.x);
		if (across < size / 2 + 8)
			return false; // rua principal (frente e fundos)
		if (walls)
		{
			if (pos.distanceTo(walls.center) > walls.radius - size / 2 - 7)
				return false;
			// Praça do exército: frente da cidade até o portão, na largura
			// da linha (TWDeployArmy usa no máximo 0,9 R de frente).
			if (along > 6 && across < walls.radius * 0.5 + size / 2)
				return false;
		}
		else if (along > 12 && across < 70)
			return false; // frente: lugar do exército
		return pos.x > size && pos.y > size && pos.x < mapSize - size && pos.y < mapSize - size;
	};

	const placed = [];
	const tryPlace = (template, pos, angle) => {
		const ent = this.TWSpawnEntity(template, playerID, pos, angle);
		if (!ent)
			return undefined;
		const cmpObstruction = Engine.QueryInterface(ent, IID_Obstruction);
		const check = cmpObstruction ? cmpObstruction.CheckFoundation("building-land", false) : "success";
		if (check !== "success")
		{
			Engine.DestroyEntity(ent);
			return undefined;
		}
		Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
		placed.push(ent);
		return ent;
	};
	// Procura um lugar em anéis cada vez maiores, virado para o centro.
	const placeAround = (template, radii) => {
		const size = sizeOf(template);
		for (const radius of radii)
		{
			const steps = Math.max(8, Math.floor(2 * Math.PI * radius / (size + 4)));
			const offset = randFloat(0, 2 * Math.PI);
			for (let k = 0; k < steps; ++k)
			{
				const a = offset + k * 2 * Math.PI / steps;
				const pos = Vector2D.add(town, new Vector2D(Math.cos(a) * radius, Math.sin(a) * radius));
				if (!allowed(pos, size))
					continue;
				const facing = Math.atan2(town.x - pos.x, town.y - pos.y);
				if (tryPlace(template, pos, facing))
					return true;
			}
		}
		return false;
	};

	// Centro cívico virado para o portão da frente.
	const centreTemplate = templateOf("civil_centre") || templateOf("military_colony");
	const centre = centreTemplate && tryPlace(centreTemplate, town, back > 0 ? Math.PI : 0) ||
		centreTemplate && this.TWSpawnEntity(centreTemplate, playerID, town, back > 0 ? Math.PI : 0);
	if (centre)
	{
		Engine.QueryInterface(centre, IID_Ownership).SetOwner(playerID);
		this.twSettlementCentre = { "ent": centre, "player": playerID };
	}

	// O que a província construiu aparece na cidade; completa com o típico.
	const plan = TW_SETTLEMENT_DEFAULT[level];
	let names = [];
	for (const id of settlement.buildings || [])
		names.push(...(TW_SETTLEMENT_STRUCTURES[id] || []));
	if (!(settlement.buildings || []).length)
		names = plan.extra.slice();
	else
		names.push("storehouse");
	// Campos só fora da muralha (sem muralha, por fora da cidade).
	const fields = names.filter(n => n == "field");
	names = names.filter(n => n != "field");
	const big = [...new Set(names)].map(templateOf).filter(Boolean).sort((a, b) => sizeOf(b) - sizeOf(a));

	const maxRadius = walls ? walls.radius * 1.2 : 80;
	const radii = [];
	for (let r = 40; r <= maxRadius; r += 12)
		radii.push(r);
	for (const template of big)
		placeAround(template, radii);
	const house = templateOf("house") || templateOf("apartment");
	if (house)
		for (let i = 0; i < plan.houses; ++i)
			if (!placeAround(house, radii))
				break;

	const field = templateOf("field");
	if (field && !walls)
		for (let i = 0; i < Math.max(fields.length, 1); ++i)
			placeAround(field, [maxRadius + 24, maxRadius + 44]);

	// Sem muralha: torres na frente da cidade.
	const tower = templateOf("defense_tower") || templateOf("sentry_tower");
	if (tower && !walls)
	{
		const towers = plan.towers + (settlement.buildings || []).filter(id => id == "watchtower").length;
		for (let i = 0; i < towers; ++i)
		{
			const a = Math.PI * (0.2 + 0.6 * i / Math.max(1, towers - 1));
			const pos = Vector2D.add(town, Vector2D.mult(forward, Math.sin(a) * 50)).add(new Vector2D(Math.cos(a) * 75 * forward.y, 0));
			tryPlace(tower, pos, Math.atan2(forward.x, forward.y));
		}
	}
	this.twSettlementEntities = placed;
};

// ------------------------------------------------ situação da batalha

Trigger.prototype.TWLeadersOf = function(playerID)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	return cmpRangeManager.GetEntitiesByPlayer(playerID).filter(ent => {
		const cmpLeader = Engine.QueryInterface(ent, IID_BattalionLeader);
		return cmpLeader && !cmpLeader.escaped && Engine.QueryInterface(ent, IID_Position)?.IsInWorld();
	});
};

/** Unidades vivas no campo (qualquer coisa com UnitAI) de um jogador. */
Trigger.prototype.TWUnitsOf = function(playerID)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	return cmpRangeManager.GetEntitiesByPlayer(playerID).filter(ent => {
		if (!Engine.QueryInterface(ent, IID_UnitAI) || Engine.QueryInterface(ent, IID_BattalionLeader)?.escaped)
			return false;
		if ((Engine.QueryInterface(ent, IID_Health)?.GetHitpoints() || 0) <= 0)
			return false;
		return !!Engine.QueryInterface(ent, IID_Position)?.IsInWorld();
	});
};

Trigger.prototype.TWIsRouting = function(ent)
{
	return !!Engine.QueryInterface(ent, IID_BattalionTactics)?.IsRouting();
};

Trigger.prototype.TWGeneralAlive = function(playerID)
{
	const general = this.twGenerals[playerID];
	const cmpHealth = general && Engine.QueryInterface(general.ent, IID_Health);
	return !!cmpHealth && cmpHealth.GetHitpoints() > 0 &&
		Engine.QueryInterface(general.ent, IID_Ownership)?.GetOwner() == playerID &&
		!!Engine.QueryInterface(general.ent, IID_Position)?.IsInWorld();
};

/** Sobreviventes por id da campanha (de qualquer dono: derrotados viram gaia). */
Trigger.prototype.TWCollectSurvivors = function()
{
	const survivors = {};
	const xp = {};
	const attachments = {};
	for (const id in this.twInitial)
	{
		survivors[id] = 0;
		attachments[id] = [];
	}
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
	for (let playerID = 0; playerID < numPlayers; ++playerID)
		for (const ent of cmpRangeManager.GetEntitiesByPlayer(playerID))
		{
			const cmpLeader = Engine.QueryInterface(ent, IID_BattalionLeader);
			const id = cmpLeader && !cmpLeader.escaped ? cmpLeader.GetCampaignId() : undefined;
			if (id === undefined || survivors[id] === undefined)
				continue;
			survivors[id] += cmpLeader.GetStrength();
			xp[id] = Math.round(cmpLeader.GetCurrentXp());
			attachments[id] = cmpLeader.GetAttachmentKinds();
		}
	// Máquinas de cerco: as vivas de cada tipo, repartidas entre os grupos.
	const alive = {};
	for (const id in this.twSiege || {})
	{
		const group = this.twSiege[id];
		const key = group.player + ":" + group.base;
		if (alive[key] === undefined)
			alive[key] = this.TWSiegeOf(group.player).filter(ent =>
				this.TWSiegeBase(Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager).GetCurrentTemplateName(ent)) == group.base).length;
		survivors[id] = Math.min(group.count, alive[key]);
		alive[key] -= survivors[id];
	}
	for (const id in this.twEscaped || {})
		if (survivors[id] !== undefined)
		{
			survivors[id] += this.twEscaped[id].returned;
			xp[id] = Math.max(xp[id] || 0, this.twEscaped[id].xp);
			attachments[id] = this.twEscaped[id].attachments;
		}
	return { "strength": survivors, "xp": xp, "attachments": attachments };
};

Trigger.prototype.TWResult = function(winner)
{
	const survivors = this.TWCollectSurvivors();
	const generals = {};
	for (const playerID in this.twGenerals)
		generals[this.twGenerals[playerID].id] = this.TWGeneralAlive(+playerID) || !!this.twGeneralEscaped[playerID];
	return {
		"totalWarfield": true,
		"winner": winner,
		"battalions": survivors.strength,
		"xp": survivors.xp,
		"attachments": survivors.attachments,
		"conquestChoice": this.twConquestChoice,
		"generals": generals,
		"duration": Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime()
	};
};

/** Placar para a interface. */
Trigger.prototype.TWGetBattleStatus = function()
{
	if (!this.twInitial)
		return undefined;
	const sides = {};
	const survivors = this.TWCollectSurvivors().strength;
	for (const id in this.twInitial)
	{
		const info = this.twInitial[id];
		const side = sides[info.player] || (sides[info.player] = { "initial": 0, "alive": 0, "battalions": 0, "routing": 0, "escaped": 0 });
		side.initial += info.strength;
		const escaped = this.twEscaped?.[id];
		side.alive += (survivors[id] || 0) - (escaped ? escaped.returned : 0);
		if (escaped)
			side.escaped += escaped.strength;
	}
	for (const playerID in sides)
		for (const ent of this.TWLeadersOf(+playerID))
		{
			++sides[playerID].battalions;
			if (this.TWIsRouting(ent))
				++sides[playerID].routing;
		}
	return { "sides": sides, "finished": this.twFinished, "flight": this.twFlight && this.twFlight.player,
		"awaitingChoice": this.twFlight && this.twFlight.awaiting,
		// Província que o jogador 1 toma se vencer (a campanha manda) e o
		// destino que ele já escolheu para ela.
		"conquest": this.twSettings && this.twSettings.conquest,
		"conquestChoice": this.twConquestChoice,
		"winner": this.twFinalResult && this.twFinalResult.winner };
};

/**
 * Derrota quem não tem batalhões em condição de lutar por
 * TW_ROUT_DEFEAT_TIME, ou perdeu o centro do assentamento que defendia.
 */
Trigger.prototype.TWCheckVictory = function()
{
	if (this.twFinished)
		return;
	// Todos os jogadores ativos (não só os que trouxeram batalhões).
	const numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
	const alive = [];
	for (let p = 1; p < numPlayers; ++p)
		if (QueryPlayerIDInterface(p)?.GetState() == "active")
			alive.push(p);
	if (alive.length < 2)
	{
		// Sobrou um lado só (o outro perdeu por outro motivo): ele vence.
		if (alive.length == 1 && Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() > 3000)
		{
			this.twFinalResult = this.TWResult(alive[0]);
			this.twFinished = true;
			QueryPlayerIDInterface(alive[0])?.Win(markForTranslation("%(player)s has won the battle."));
		}
		return;
	}

	// Lado sem nenhuma tropa viva (batalhões, general, máquinas, soldados
	// soltos): derrota na hora, sem esperar a fuga.
	if (Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() > 3000)
		for (const playerID of alive)
			if (!this.TWUnitsOf(playerID).length)
			{
				this.TWDefeat(playerID, markForTranslation("%(player)s has no troops left."));
				return;
			}

	const centre = this.twSettlementCentre;
	if (centre && Engine.QueryInterface(centre.ent, IID_Ownership)?.GetOwner() != centre.player)
	{
		this.TWDefeat(centre.player, markForTranslation("%(player)s has lost the settlement."));
		return;
	}

	if (this.twFlight)
	{
		this.TWUpdateFlight();
		return;
	}

	const broken = this.TWDecisiveLoser(alive);
	if (broken !== undefined)
	{
		this.TWStartFlight(broken);
		return;
	}

	for (const playerID of alive)
	{
		// O general sozinho não segura o campo.
		const fighting = this.TWLeadersOf(playerID).filter(ent => !this.TWIsRouting(ent)).length;
		if (fighting)
		{
			this.twRoutTimers[playerID] = 0;
			continue;
		}
		this.twRoutTimers[playerID] = (this.twRoutTimers[playerID] || 0) + TW_VICTORY_INTERVAL / 1000;
		if (this.twRoutTimers[playerID] >= TW_ROUT_DEFEAT_TIME)
		{
			this.TWStartFlight(playerID);
			return;
		}
	}
};

/** Lado que perdeu de forma decisiva (TW_CRUSHED_*, TW_STALEMATE_*), ou undefined. */
Trigger.prototype.TWDecisiveLoser = function(alive)
{
	if (alive.length != 2)
		return undefined;
	const sides = this.TWGetBattleStatus()?.sides || {};
	const [a, b] = alive;
	if (!sides[a] || !sides[b] || !sides[a].initial || !sides[b].initial)
		return undefined;
	const now = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime();
	let lastHit = -Infinity;
	for (const p of alive)
		for (const ent of this.TWLeadersOf(p))
			lastHit = Math.max(lastHit, Engine.QueryInterface(ent, IID_BattalionTactics)?.lastHitTime ?? -Infinity);
	if (lastHit > -Infinity)
		this.twHadCombat = true;
	const quiet = this.twHadCombat && (now - lastHit) / 1000 >= TW_STALEMATE_TIME;
	for (const [loser, winner] of [[a, b], [b, a]])
	{
		const mine = Math.max(0, sides[loser].alive);
		const theirs = Math.max(0, sides[winner].alive);
		if (mine <= sides[loser].initial * TW_CRUSHED_FRACTION && theirs >= mine * TW_CRUSHED_ODDS)
			return loser;
		if (quiet && mine <= sides[loser].initial * (1 - TW_STALEMATE_LOSS) && theirs >= mine * TW_STALEMATE_ODDS)
			return loser;
	}
	return undefined;
};

/**
 * Exército vencido: todos os batalhões e o general fogem para a borda do
 * seu lado; quem chega lá escapa (parte volta ao exército). A batalha
 * acaba quando ninguém do lado vencido sobra no campo, ou depois de
 * TW_FLIGHT_TIME segundos (os que ficaram são pegos).
 */
Trigger.prototype.TWStartFlight = function(playerID)
{
	this.twFlight = { "player": playerID, "start": Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() };
	// Vencedor humano escolhe: encerrar (os fugitivos escapam) ou perseguir.
	const numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
	for (let p = 1; p < numPlayers; ++p)
		if (p != playerID && this.twAI.indexOf(p) == -1 && QueryPlayerIDInterface(p)?.GetState() == "active")
			this.twFlight.awaiting = p;
	for (const ent of this.TWLeadersOf(playerID))
		Engine.QueryInterface(ent, IID_BattalionTactics)?.ForceRout();
	Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).PushNotification({
		"type": "text",
		"players": Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetAllPlayers(),
		"message": markForTranslation("An army has been broken and is fleeing the field!"),
		"translateMessage": true
	});
	this.TWUpdateFlight();
};

Trigger.prototype.TWUpdateFlight = function()
{
	const playerID = this.twFlight.player;
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const nearEdge = pos => Math.min(pos.x, pos.y, mapSize - pos.x, mapSize - pos.y) < 14;

	// Batalhões que chegaram agora ao campo também fogem.
	for (const ent of this.TWLeadersOf(playerID))
		if (!this.TWIsRouting(ent))
			Engine.QueryInterface(ent, IID_BattalionTactics)?.ForceRout();

	// O general corre para a borda; chegando lá, escapa vivo.
	const general = this.twGenerals[playerID];
	if (general && this.TWGeneralAlive(playerID))
	{
		const pos = this.TWPosition(general.ent);
		if (nearEdge(pos))
		{
			this.twGeneralEscaped[playerID] = true;
			const ent = general.ent;
			general.ent = INVALID_ENTITY;
			if (!this.TWLeadersOf(playerID).length)
				this.TWDefeat(playerID, markForTranslation("%(player)s's army has been routed."));
			Engine.DestroyEntity(ent);
			return;
		}
		else
		{
			const exit = this.TWGetRetreatPoint(playerID, pos);
			Engine.QueryInterface(general.ent, IID_UnitAI)?.Walk(exit.x, exit.y, false, false);
		}
	}

	const remaining = this.TWLeadersOf(playerID).length + (this.TWGeneralAlive(playerID) ? 1 : 0);
	const elapsed = (Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() - this.twFlight.start) / 1000;
	if (!remaining)
		this.TWDefeat(playerID, markForTranslation("%(player)s's army has been routed."));
	else if (this.twFlight.awaiting !== undefined)
	{
		// Sem resposta em TW_FLIGHT_TIME, persegue.
		if (elapsed >= TW_FLIGHT_TIME)
			this.TWBattleChoice(this.twFlight.awaiting, "pursue");
	}
	else if (elapsed >= TW_FLIGHT_TIME)
		this.TWDefeat(playerID, markForTranslation("%(player)s's army has been routed."));
};

/**
 * Escolha do vencedor (comando "tw-battle-choice", gui/session/tw_battle_status.js):
 *  - "end": a batalha acaba; quem ainda foge escapa (parte volta ao
 *    exército dele), o general inimigo também;
 *  - "pursue": a perseguição continua por até TW_FLIGHT_TIME segundos.
 */
Trigger.prototype.TWBattleChoice = function(player, choice, conquestChoice)
{
	// Destino da província (ocupar, saquear, vassalo): vale mesmo se a
	// perseguição já começou sozinha ou a batalha já acabou.
	if (player == 1 && ["occupy", "sack", "vassal"].indexOf(conquestChoice) != -1 && this.twSettings?.conquest)
	{
		this.twConquestChoice = conquestChoice;
		if (this.twFinalResult)
			this.twFinalResult.conquestChoice = conquestChoice;
	}
	if (choice == "none")
		return;
	const flight = this.twFlight;
	if (!flight || flight.awaiting != player || this.twFinished)
		return;
	flight.awaiting = undefined;
	if (choice != "end")
	{
		flight.start = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime();
		return;
	}
	for (const ent of this.TWLeadersOf(flight.player))
		Engine.QueryInterface(ent, IID_BattalionLeader).Escape();
	if (this.TWGeneralAlive(flight.player))
	{
		this.twGeneralEscaped[flight.player] = true;
		const general = this.twGenerals[flight.player];
		const ent = general.ent;
		general.ent = INVALID_ENTITY;
		Engine.DestroyEntity(ent);
	}
	this.TWDefeat(flight.player, markForTranslation("%(player)s's army has been routed."));
};

Trigger.prototype.TWDefeat = function(playerID, reason)
{
	if (this.twFinished)
		return;
	const numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
	const winners = [];
	for (let p = 1; p < numPlayers; ++p)
		if (p != playerID && QueryPlayerIDInterface(p)?.GetState() == "active")
			winners.push(p);
	// Guarda o resultado antes: a derrota passa as unidades para gaia.
	this.twFinalResult = this.TWResult(winners[0]);
	// Máquinas de cerco do vencido ficam no campo (perdidas).
	for (const id in this.twSiege || {})
		if (this.twSiege[id].player == playerID && !this.twSiege[id].naval)
			this.twFinalResult.battalions[id] = 0;
	// Batalhões do vencido que não conseguiram sair do campo: a maioria é
	// morta ou capturada na perseguição.
	for (const ent of this.TWLeadersOf(playerID))
	{
		const id = Engine.QueryInterface(ent, IID_BattalionLeader).GetCampaignId();
		if (id !== undefined && this.twFinalResult.battalions[id] !== undefined)
			this.twFinalResult.battalions[id] = Math.round((this.twFinalResult.battalions[id] - (this.twEscaped[id]?.returned || 0)) * TW_CAUGHT_SURVIVAL) +
				(this.twEscaped[id]?.returned || 0);
	}
	this.twFinished = true;
	QueryPlayerIDInterface(playerID)?.Defeat(reason);
	// A campanha joga sem condições de vitória (partida "sem fim"): quem
	// sobrou precisa ser declarado vencedor para a partida acabar.
	for (const winner of new Set(winners))
	{
		const cmpWinner = QueryPlayerIDInterface(winner);
		if (cmpWinner && cmpWinner.GetState() == "active")
			cmpWinner.Win(markForTranslation("%(player)s has won the battle."));
	}
};

Trigger.prototype.TWBattalionDestroyed = function(ent, id)
{
	// Os sobreviventes são contados no fim; nada a guardar por enquanto.
};

/**
 * Chamado pela interface da campanha no fim da partida
 * (GuiInterface.GetCampaignGameEndData, sem `this` do componente).
 */
Trigger.prototype.OnCampaignGameEnd = function()
{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	if (!cmpTrigger.twInitial)
		return {};
	return cmpTrigger.twFinalResult || cmpTrigger.TWResult(undefined);
};

// ------------------------------------------------ diretor (IA)

Trigger.prototype.TWPosition = function(ent)
{
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	return cmpPosition && cmpPosition.IsInWorld() ? cmpPosition.GetPosition2D() : undefined;
};

Trigger.prototype.TWCenterOf = function(ents)
{
	const positions = ents.map(ent => this.TWPosition(ent)).filter(Boolean);
	if (!positions.length)
		return undefined;
	return positions.reduce((sum, pos) => sum.add(pos), new Vector2D(0, 0)).div(positions.length);
};

Trigger.prototype.TWIsBusy = function(ent)
{
	const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
	const order = cmpUnitAI && cmpUnitAI.order;
	if (!order || order.type != "Attack")
		return false;
	const cmpHealth = Engine.QueryInterface(order.data.target, IID_Health);
	return !!cmpHealth && cmpHealth.GetHitpoints() > 0;
};

Trigger.prototype.TWNearest = function(pos, ents, filter = () => true)
{
	let best;
	let bestDistance = Infinity;
	for (const ent of ents)
	{
		if (!filter(ent))
			continue;
		const other = this.TWPosition(ent);
		const distance = other ? pos.distanceTo(other) : Infinity;
		if (distance < bestDistance)
		{
			best = ent;
			bestDistance = distance;
		}
	}
	return { "ent": best, "distance": bestDistance };
};

/**
 * A cada poucos segundos, para cada jogador da IA:
 *  - espera o desdobramento; o defensor segura posição até o inimigo chegar;
 *  - a infantaria avança em linha (um comando para todos) e carrega
 *    quando o inimigo está perto;
 *  - atiradores atacam o que estiver ao alcance e não passam da linha;
 *  - a cavalaria flanqueia: caça atiradores, depois quem já está lutando;
 *  - o general fica atrás do centro, e só luta se o inimigo chegar nele.
 */
Trigger.prototype.TWDirector = function()
{
	if (this.twFinished)
		return;
	this.twDirectorActive = true;
	try
	{
		this.TWDirectorTick();
	}
	finally
	{
		this.twDirectorActive = false;
	}
};

Trigger.prototype.TWDirectorTick = function()
{
	const time = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() / 1000;
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager.GetNumPlayers();

	for (const playerID of this.twAI)
	{
		const cmpPlayer = QueryPlayerIDInterface(playerID);
		if (!cmpPlayer || cmpPlayer.GetState() != "active" || this.twFlight && this.twFlight.player == playerID)
			continue;
		const cmpDiplomacy = QueryPlayerIDInterface(playerID, IID_Diplomacy);
		// Batalhões escondidos (furtividade) não entram nas contas da IA.
		const enemies = [];
		for (let other = 1; other < numPlayers; ++other)
			if (other != playerID && cmpDiplomacy?.IsEnemy(other))
				enemies.push(...this.TWLeadersOf(other).filter(ent =>
					!Engine.QueryInterface(ent, IID_Visibility)?.IsTWHiddenFrom?.(playerID)));
		const enemyHeroes = [];
		for (let other = 1; other < numPlayers; ++other)
			if (other != playerID && cmpDiplomacy?.IsEnemy(other) && this.TWGeneralAlive(other))
				enemyHeroes.push(this.twGenerals[other].ent);
		const targets = enemies.concat(enemyHeroes);

		const mine = this.TWLeadersOf(playerID).filter(ent => !this.TWIsRouting(ent));
		if (!mine.length || !targets.length)
			continue;

		const myCenter = this.TWCenterOf(mine);
		const enemyCenter = this.TWCenterOf(targets);
		const gap = myCenter.distanceTo(enemyCenter);
		const toEnemy = Vector2D.sub(enemyCenter, myCenter).normalize();
		const order = (ents, cmd) => {
			if (!ents.length)
				return;
			cmd.entities = ents;
			ProcessCommand(playerID, cmd);
		};
		const attack = (ent, target) => order([ent], { "type": "attack", "target": target, "allowCapture": false, "queued": false });

		const defending = this.twSettings.defender == playerID;
		// Cerco: o defensor espera dentro dos muros até o inimigo entrar; o
		// atacante segura a infantaria até romper a muralha.
		const myWalls = this.twWalls[playerID];
		const enemyWallsOwner = Object.keys(this.twWalls).map(Number).find(p => p != playerID && cmpDiplomacy?.IsEnemy(p));
		const enemyWalls = enemyWallsOwner !== undefined ? this.twWalls[enemyWallsOwner] : undefined;
		const besieging = !!enemyWalls && !this.TWIsBreached(enemyWallsOwner);
		const enemiesInside = myWalls && targets.some(ent => this.TWPosition(ent).distanceTo(myWalls.center) < myWalls.radius + 5);
		const waiting = time < TW_AI_DEPLOY_TIME || defending && (myWalls ? !enemiesInside : gap > 140);
		if (besieging && time >= TW_AI_DEPLOY_TIME)
		{
			this.TWDirectSiege(playerID, enemyWallsOwner, mine, targets, order, attack);
			continue;
		}

		// Atirador = tem ataque à distância e não corpo a corpo (inclui
		// campeões arqueiros); cavalaria de choque flanqueia.
		const category = ent => Engine.QueryInterface(ent, IID_BattalionLeader).GetCategory();
		const isRangedUnit = ent => {
			const types = Engine.QueryInterface(ent, IID_Attack)?.GetAttackTypes() || [];
			return types.indexOf("Ranged") != -1 && types.indexOf("Melee") == -1;
		};
		const ranged = mine.filter(isRangedUnit);
		const cavalry = mine.filter(ent => !isRangedUnit(ent) && ["cavalry_melee", "champion_cavalry"].indexOf(category(ent)) != -1);
		const infantry = mine.filter(ent => ranged.indexOf(ent) == -1 && cavalry.indexOf(ent) == -1);
		// Exércitos já misturados (centros próximos): cada um caça o seu.
		const engaged = gap < 100;

		// Infantaria: carga quando perto; senão avança em linha (ou, com os
		// exércitos misturados, vai atrás do inimigo mais próximo).
		const advancing = [];
		for (const ent of infantry)
		{
			this.TWChooseFormation(ent, targets);
			if (this.TWIsBusy(ent))
				continue;
			const pos = this.TWPosition(ent);
			const nearest = this.TWNearest(pos, targets);
			if (nearest.ent && (nearest.distance < (defending ? 45 : 70) || engaged && !waiting))
				attack(ent, nearest.ent);
			else if (!waiting)
				advancing.push(ent);
		}
		if (!this.twLastAdvance)
			this.twLastAdvance = {};
		if (advancing.length && !(time - (this.twLastAdvance[playerID] || -Infinity) < 8))
		{
			this.twLastAdvance[playerID] = time;
			const from = this.TWCenterOf(advancing);
			const goalCenter = this.TWCenterOf(targets);
			const step = Math.min(from.distanceTo(goalCenter) - 40, 60);
			if (step > 5)
			{
				const goal = Vector2D.add(from, Vector2D.mult(Vector2D.sub(goalCenter, from).normalize(), step));
				order(advancing, { "type": "walk", "x": goal.x, "z": goal.y, "queued": false, "pushFront": false });
			}
			else
				for (const ent of advancing)
				{
					const nearest = this.TWNearest(this.TWPosition(ent), targets);
					if (nearest.ent)
						attack(ent, nearest.ent);
				}
		}

		// Atiradores: atiram no mais próximo ao alcance; senão se aproximam dele.
		for (const ent of ranged)
		{
			if (this.TWIsBusy(ent))
				continue;
			const pos = this.TWPosition(ent);
			const range = Engine.QueryInterface(ent, IID_Attack)?.GetRange("Ranged")?.max || 40;
			const nearest = this.TWNearest(pos, targets);
			if (!nearest.ent)
				continue;
			if (nearest.distance < range + 15 || engaged && !waiting)
				attack(ent, nearest.ent);
			else if (!waiting)
			{
				const toTarget = Vector2D.sub(this.TWPosition(nearest.ent), pos).normalize();
				const goal = Vector2D.add(pos, Vector2D.mult(toTarget, Math.min(40, nearest.distance - range + 5)));
				order([ent], { "type": "walk", "x": goal.x, "z": goal.y, "queued": false, "pushFront": false });
			}
		}

		// Cavalaria: flanqueia (atiradores primeiro, depois quem já luta).
		for (const ent of cavalry)
		{
			if (this.TWIsBusy(ent))
				continue;
			const pos = this.TWPosition(ent);
			if (waiting)
			{
				const nearest = this.TWNearest(pos, targets);
				if (nearest.ent && nearest.distance < 50)
					attack(ent, nearest.ent);
				continue;
			}
			const isRanged = e => ["infantry_ranged", "cavalry_ranged"].indexOf(Engine.QueryInterface(e, IID_BattalionLeader)?.GetCategory()) != -1;
			let target = this.TWNearest(pos, enemies, isRanged);
			if (!target.ent)
				target = this.TWNearest(pos, enemies, e => this.TWIsBusy(e));
			if (!target.ent)
				target = this.TWNearest(pos, targets);
			if (!target.ent)
				continue;
			// Longe: contorna pelo lado (ponto ao lado do alvo) antes de carregar.
			const targetPos = this.TWPosition(target.ent);
			if (target.distance > 120)
			{
				const side = Vector2D.sub(pos, myCenter).dot(new Vector2D(toEnemy.y, -toEnemy.x)) >= 0 ? 1 : -1;
				const flank = Vector2D.add(targetPos, Vector2D.mult(new Vector2D(toEnemy.y, -toEnemy.x), 60 * side));
				order([ent], { "type": "walk", "x": flank.x, "z": flank.y, "queued": false, "pushFront": false });
			}
			else
				attack(ent, target.ent);
		}

		// General: atrás do centro.
		const general = this.twGenerals[playerID];
		if (general && this.TWGeneralAlive(playerID) && !this.TWIsBusy(general.ent))
		{
			const pos = this.TWPosition(general.ent);
			const nearest = this.TWNearest(pos, targets);
			if (nearest.ent && nearest.distance < 25)
				attack(general.ent, nearest.ent);
			else
			{
				const goal = Vector2D.sub(myCenter, Vector2D.mult(toEnemy, 25));
				if (pos.distanceTo(goal) > 15)
					order([general.ent], { "type": "walk", "x": goal.x, "z": goal.y, "queued": false, "pushFront": false });
			}
		}
	}
};

/**
 * Atacante diante de muralha inteira: aríetes (e quem estiver de mãos
 * vazias, sem máquinas) contra o portão da frente; catapultas e balistas
 * contra os muros e torres; atiradores alvejam quem estiver ao alcance; a
 * infantaria espera em formação diante do portão. Rompida a muralha, o
 * diretor volta ao ataque normal.
 */
Trigger.prototype.TWDirectSiege = function(playerID, wallsOwner, mine, targets, order, attack)
{
	const walls = this.twWalls[wallsOwner];
	const pieces = this.TWWallPieces(wallsOwner);
	if (!pieces.length)
		return;
	const gates = walls.gates.filter(ent => pieces.indexOf(ent) != -1);
	const nearestOf = (pos, list) => this.TWNearest(pos, list).ent;
	const engines = this.TWSiegeOf(playerID);
	const isRam = ent => Engine.QueryInterface(ent, IID_Identity).HasClass("Ram");

	const myCenter = this.TWCenterOf(mine.concat(engines)) || walls.center;
	const frontGate = nearestOf(myCenter, gates.length ? gates : pieces);
	for (const ent of engines)
	{
		if (this.TWIsBusy(ent))
			continue;
		const pos = this.TWPosition(ent);
		const target = isRam(ent) ? (frontGate || nearestOf(pos, pieces)) : nearestOf(pos, pieces);
		if (target)
			attack(ent, target);
	}

	// Sem aríetes vivos, a infantaria de choque tenta derrubar o portão.
	const rams = engines.filter(isRam);
	const gatePos = frontGate ? this.TWPosition(frontGate) : walls.center;
	const outward = Vector2D.sub(myCenter, walls.center).normalize();
	const waitPoint = Vector2D.add(gatePos, Vector2D.mult(outward, 45));
	const waiting = [];
	for (const ent of mine)
	{
		if (this.TWIsBusy(ent))
			continue;
		const pos = this.TWPosition(ent);
		const types = Engine.QueryInterface(ent, IID_Attack)?.GetAttackTypes() || [];
		const ranged = types.indexOf("Ranged") != -1 && types.indexOf("Melee") == -1;
		if (ranged)
		{
			const range = Engine.QueryInterface(ent, IID_Attack).GetRange("Ranged").max || 40;
			const nearest = this.TWNearest(pos, targets);
			if (nearest.ent && nearest.distance < range + 5)
				attack(ent, nearest.ent);
			else
				waiting.push(ent);
		}
		else if (!rams.length && !engines.length && frontGate && Engine.QueryInterface(ent, IID_Identity).HasClass("TWCharger"))
			attack(ent, frontGate);
		else
		{
			// Quem sai para atacar defensores fora dos muros pode lutar.
			const nearest = this.TWNearest(pos, targets);
			if (nearest.ent && nearest.distance < 40 && this.TWPosition(nearest.ent).distanceTo(walls.center) > walls.radius)
				attack(ent, nearest.ent);
			else if (pos.distanceTo(waitPoint) > 40)
				waiting.push(ent);
		}
	}
	if (waiting.length && !(Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() / 1000 - (this.twLastSiegeMove?.[playerID] || -Infinity) < 8))
	{
		if (!this.twLastSiegeMove)
			this.twLastSiegeMove = {};
		this.twLastSiegeMove[playerID] = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() / 1000;
		order(waiting, { "type": "walk", "x": waitPoint.x, "z": waitPoint.y, "queued": false, "pushFront": false });
	}
};

{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.DoAfterDelay(0, "TWSetup", {});
}
