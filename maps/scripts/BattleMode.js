/**
 * Battle Mode (modo batalha). Portado do Mars Wars.
 *
 * O mapa (um mapa aleatório padrão do 0 A.D.) gera as bases normalmente: é o
 * jeito de ter as posições de início planejadas pelo mapa. No primeiro turno
 * este script:
 *  - guarda onde cada jogador começou (centro das suas entidades);
 *  - remove a base e as unidades iniciais;
 *  - cria o exército escolhido na tela do modo batalha, em formação e
 *    virado para o inimigo (infantaria na frente, cerco e heróis atrás).
 * Depois, a cada alguns segundos, o "diretor" comanda a IA: a infantaria
 * disputa os pontos de controle (vencer segurando a maioria deles é uma das
 * condições de vitória), e o resto escolta ou caça o inimigo.
 *
 * Reforços: cada jogador tem uma zona de desdobramento no ponto de início.
 * Os pontos não gastos na tela do modo batalha viram pontos de reforço, e
 * cada ponto de controle rende mais pontos e dá população. Selecionando a
 * zona, o painel de reforços (gui/battle_mode/reinforce) compra tropas, que
 * entram pela borda do mapa mais próxima do ponto de início (a mais próxima
 * com caminho por terra) e marcham até a zona. A IA também compra reforços.
 *
 * Configuração: InitAttributes.settings.BattleMode (ver
 * gamesettings/attributes/BattleMode.js).
 */

/** Distância entre unidades na mesma fileira e entre fileiras, por categoria (m). */
const BATTLE_MODE_SPACING = {
	"infantry": { "side": 3, "row": 3 },
	"ranged": { "side": 3, "row": 3 },
	"champion": { "side": 3.5, "row": 3.5 },
	"cavalry": { "side": 5, "row": 6 },
	"siege": { "side": 10, "row": 10 },
	"hero": { "side": 6, "row": 6 }
};
/** Ordem das faixas, da frente para trás. */
const BATTLE_MODE_ORDER = ["infantry", "champion", "ranged", "cavalry", "hero", "siege"];
/** Unidades por fileira antes de começar outra atrás. */
const BATTLE_MODE_PER_ROW = 10;
/** Intervalo do "diretor" que comanda a IA (ms). */
const BATTLE_MODE_DIRECTOR_INTERVAL = 5000;
/** Catálogo de unidades e custos (o mesmo da tela do modo batalha). */
const BATTLE_MODE_CATALOG = "simulation/data/battle_mode/army_catalog.json";
/** População dada por ponto de controle ao dono. */
const BATTLE_MODE_CONTROL_POINT_POP = 30;
/** Pontos de reforço por ponto de controle a cada intervalo. */
const BATTLE_MODE_POINTS_PER_CONTROL_POINT = 10;
/** Intervalo da renda de pontos de reforço (ms). */
const BATTLE_MODE_INCOME_INTERVAL = 20000;
/** Inimigos a esta distância de um ponto de controle da IA o ameaçam (m). */
const BATTLE_MODE_THREAT_RADIUS = 60;
/** Zona de desdobramento (a mesma para todas as civs). */
const BATTLE_MODE_DEPLOY_POINT = "special/battle_deploy_point";
/** Marcador invisível na borda por onde entram os reforços. */
const BATTLE_MODE_ENTRY_POINT = "special/battle_entry_point";
/** Intervalo entre unidades do mesmo pedido entrando pela borda (ms). */
const BATTLE_MODE_ENTRY_INTERVAL = 400;
/** Nome do modificador que tira a construção das unidades no modo batalha. */
const BATTLE_MODE_NO_BUILDING = "battle_mode/no_building";
/** Espera entre a unidade entrar no mapa e começar a marchar (ms). */
const BATTLE_MODE_MARCH_DELAY = 1000;
/** Distância mínima entre o ponto de entrada e a borda do mapa (m). */
const BATTLE_MODE_EDGE_MARGIN = 40;
/** Tamanho das células da grade usada na busca pela borda mais próxima (m). */
const BATTLE_MODE_EDGE_CELL = 4;
/** Maior inclinação vencível entre células (altura / distância) e água rasa aceitável (m). */
const BATTLE_MODE_EDGE_MAX_SLOPE = 0.9;
const BATTLE_MODE_EDGE_MAX_WATER = 1.2;

Trigger.prototype.BattleModeSetup = function()
{
	if (this.battleModeDone)
		return;
	this.battleModeDone = true;

	const settings = InitAttributes.settings.BattleMode;
	if (!settings || !settings.armies)
		return;

	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const numPlayers = cmpPlayerManager.GetNumPlayers();
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();

	// Onde cada jogador começou. As unidades iniciais só são removidas
	// depois de criar os exércitos: a vitória por conquista derrotaria na
	// hora um jogador que ficasse sem unidades.
	const spawns = {};
	const startingEntities = [];
	for (let playerID = 1; playerID < numPlayers; ++playerID)
	{
		let x = 0;
		let z = 0;
		let count = 0;
		for (const ent of cmpRangeManager.GetEntitiesByPlayer(playerID))
		{
			const cmpPosition = Engine.QueryInterface(ent, IID_Position);
			if (!cmpPosition || !cmpPosition.IsInWorld())
				continue;
			const pos = cmpPosition.GetPosition2D();
			x += pos.x;
			z += pos.y;
			++count;
			startingEntities.push(ent);
		}
		if (count)
			spawns[playerID] = { "x": x / count, "z": z / count };
		else
		{
			// Sem unidades iniciais: lados opostos do mapa.
			const side = playerID % 2 ? 0.25 : 0.75;
			spawns[playerID] = { "x": mapSize * side, "z": mapSize * side };
		}
	}
	const center = { "x": mapSize / 2, "z": mapSize / 2 };
	for (let playerID = 1; playerID < numPlayers; ++playerID)
	{
		const army = settings.armies[playerID];
		if (!army || !army.length)
			continue;

		// Virado para a média dos inimigos (ou para o centro do mapa).
		let target = center;
		const enemies = Object.keys(spawns).map(Number).filter(p => p != playerID);
		if (enemies.length)
			target = {
				"x": enemies.reduce((sum, p) => sum + spawns[p].x, 0) / enemies.length,
				"z": enemies.reduce((sum, p) => sum + spawns[p].z, 0) / enemies.length
			};
		this.BattleModeSpawnArmy(playerID, army, spawns[playerID], target, mapSize);
	}

	// Zona de desdobramento, ponto de entrada dos reforços e pontos iniciais.
	this.battleModePoints = {};
	this.battleModeDeployPoints = {};
	this.battleModeEntryPoints = {};
	for (let playerID = 1; playerID < numPlayers; ++playerID)
	{
		this.battleModePoints[playerID] = Math.max(0, +(settings.reinforcements?.[playerID] || 0));

		const ent = Engine.AddEntity(BATTLE_MODE_DEPLOY_POINT);
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		cmpPosition.JumpTo(spawns[playerID].x, spawns[playerID].z);
		cmpPosition.SetYRotation(Math.PI);
		Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
		this.battleModeDeployPoints[playerID] = ent;

		const entry = this.BattleModeFindEntry(spawns[playerID], mapSize);
		const marker = Engine.AddEntity(BATTLE_MODE_ENTRY_POINT);
		Engine.QueryInterface(marker, IID_Position).JumpTo(entry.x, entry.z);
		Engine.QueryInterface(marker, IID_Ownership).SetOwner(playerID);
		this.battleModeEntryPoints[playerID] = marker;
	}

	// Sem construção no modo batalha: esvazia a lista do que as unidades de
	// cada jogador podem construir (também vale para os reforços).
	const cmpModifiersManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ModifiersManager);
	for (let playerID = 1; playerID < numPlayers; ++playerID)
		cmpModifiersManager.AddModifiers(BATTLE_MODE_NO_BUILDING, {
			"Builder/Entities/_string": [{ "affects": [], "replace": "" }]
		}, cmpPlayerManager.GetPlayerByID(playerID));

	for (const ent of startingEntities)
		Engine.DestroyEntity(ent);

	this.DoRepeatedly(BATTLE_MODE_INCOME_INTERVAL, "BattleModeIncome", {});
	if (settings.aiAttack !== false)
		this.DoRepeatedly(BATTLE_MODE_DIRECTOR_INTERVAL, "BattleModeDirector", {});
};

// ------------------------------------------------ borda do mapa

/**
 * Ponto da borda do mapa mais próximo de `origin` por caminho de terra.
 * Faz uma busca em largura numa grade do terreno a partir da origem, só
 * atravessando células sem água funda e sem encostas íngremes demais, e
 * para na primeira célula que encosta na borda: é a borda alcançável mais
 * perto andando (contorna mar, lagos e penhascos). Funciona em mapas
 * quadrados e circulares. Sem nenhum caminho, os reforços entram na
 * própria zona de desdobramento.
 */
Trigger.prototype.BattleModeFindEntry = function(origin, mapSize)
{
	const cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
	const cmpWaterManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_WaterManager);
	const circular = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).GetLosCircular();
	const half = mapSize / 2;
	const inside = (x, z) => circular ?
		(x - half) * (x - half) + (z - half) * (z - half) <= (half - BATTLE_MODE_EDGE_MARGIN) * (half - BATTLE_MODE_EDGE_MARGIN) :
		x >= BATTLE_MODE_EDGE_MARGIN && z >= BATTLE_MODE_EDGE_MARGIN &&
		x <= mapSize - BATTLE_MODE_EDGE_MARGIN && z <= mapSize - BATTLE_MODE_EDGE_MARGIN;

	const cell = BATTLE_MODE_EDGE_CELL;
	const size = Math.ceil(mapSize / cell);
	const toX = i => (i % size + 0.5) * cell;
	const toZ = i => (Math.floor(i / size) + 0.5) * cell;
	const height = new Float32Array(size * size).fill(NaN);
	const heightOf = i => {
		if (isNaN(height[i]))
		{
			const x = toX(i);
			const z = toZ(i);
			const ground = cmpTerrain.GetGroundLevel(x, z);
			const water = cmpWaterManager ? cmpWaterManager.GetWaterLevel(x, z) : -Infinity;
			// Água funda conta como intransponível.
			height[i] = water - ground > BATTLE_MODE_EDGE_MAX_WATER ? Infinity : ground;
		}
		return height[i];
	};
	const maxClimb = BATTLE_MODE_EDGE_MAX_SLOPE * cell;

	const startCol = Math.min(size - 1, Math.max(0, Math.floor(origin.x / cell)));
	const startRow = Math.min(size - 1, Math.max(0, Math.floor(origin.z / cell)));
	const start = startRow * size + startCol;
	const visited = new Uint8Array(size * size);
	const queue = new Int32Array(size * size);
	let head = 0;
	let tail = 0;
	queue[tail++] = start;
	visited[start] = 1;
	const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
	while (head < tail)
	{
		const i = queue[head++];
		const col = i % size;
		const row = Math.floor(i / size);
		const h = heightOf(i);
		for (const [dc, dr] of neighbours)
		{
			const c = col + dc;
			const r = row + dr;
			if (c < 0 || r < 0 || c >= size || r >= size)
				continue;
			const j = r * size + c;
			if (visited[j])
				continue;
			// Célula vizinha já fora da área jogável: esta é a borda.
			if (!inside(toX(j), toZ(j)))
				return { "x": toX(i), "z": toZ(i) };
			const hj = heightOf(j);
			if (hj == Infinity || Math.abs(hj - h) > maxClimb * (dc && dr ? Math.SQRT2 : 1))
				continue;
			visited[j] = 1;
			queue[tail++] = j;
		}
	}
	warn("Battle Mode: no land path to the map edge found; reinforcements will arrive at the deployment zone.");
	return { "x": origin.x, "z": origin.z };
};

// ------------------------------------------------ reforços

Trigger.prototype.BattleModeCatalogFor = function(playerID)
{
	if (!this.battleModeCatalog)
		this.battleModeCatalog = Engine.ReadJSONFile(BATTLE_MODE_CATALOG);
	const civ = QueryPlayerIDInterface(playerID, IID_Identity)?.GetCiv();
	const cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	return (this.battleModeCatalog.Civs[civ] || []).filter(entry => cmpTemplateManager.TemplateExists(entry.Template));
};

Trigger.prototype.BattleModePopCost = function(template)
{
	const data = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager).GetTemplate(template);
	return data && data.Cost ? +(data.Cost.Population || 0) : 0;
};

Trigger.prototype.BattleModeControlPointsOwnedBy = function(playerID)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	return cmpRangeManager.GetEntitiesByPlayer(playerID).filter(ent => Engine.QueryInterface(ent, IID_ControlPoint)).length;
};

/** Renda: cada ponto de controle dá pontos de reforço ao dono. */
Trigger.prototype.BattleModeIncome = function()
{
	if (!this.battleModePoints)
		return;
	for (const playerID in this.battleModePoints)
	{
		const cmpPlayer = QueryPlayerIDInterface(+playerID);
		if (!cmpPlayer || cmpPlayer.GetState() != "active")
			continue;
		this.battleModePoints[playerID] += BATTLE_MODE_POINTS_PER_CONTROL_POINT * this.BattleModeControlPointsOwnedBy(+playerID);
	}
};

/** Situação dos reforços de um jogador, para a GUI. */
Trigger.prototype.BattleModeGetStatus = function(playerID)
{
	if (!this.battleModePoints || this.battleModePoints[playerID] === undefined)
		return undefined;
	const cmpPlayer = QueryPlayerIDInterface(playerID);
	const controlPoints = this.BattleModeControlPointsOwnedBy(playerID);
	return {
		"points": this.battleModePoints[playerID],
		"controlPoints": controlPoints,
		"income": BATTLE_MODE_POINTS_PER_CONTROL_POINT * controlPoints,
		"pointsPerControlPoint": BATTLE_MODE_POINTS_PER_CONTROL_POINT,
		"popPerControlPoint": BATTLE_MODE_CONTROL_POINT_POP,
		"interval": BATTLE_MODE_INCOME_INTERVAL,
		"popCount": cmpPlayer.GetPopulationCount() + (this.battleModePendingPop?.[playerID] || 0),
		"popLimit": cmpPlayer.GetPopulationLimit(),
		"civ": QueryPlayerIDInterface(playerID, IID_Identity)?.GetCiv(),
		"catalog": this.BattleModeCatalogFor(playerID).map(entry => ({
			"template": entry.Template,
			"name": entry.Name,
			"category": entry.Category,
			"cost": entry.Cost,
			"pop": this.BattleModePopCost(entry.Template)
		}))
	};
};

/**
 * Compra reforços; eles entram pela borda do mapa, um depois do outro, e
 * marcham até o ponto de encontro da zona de desdobramento (ou até ela).
 * @param units - [{ "template": ..., "count": n }]
 * @return true, ou a mensagem do motivo da recusa.
 */
Trigger.prototype.BattleModeReinforce = function(playerID, units)
{
	const deployPoint = this.battleModeDeployPoints && this.battleModeDeployPoints[playerID];
	const cmpDeployPosition = deployPoint && Engine.QueryInterface(deployPoint, IID_Position);
	if (!cmpDeployPosition || !cmpDeployPosition.IsInWorld())
		return markForTranslation("No deployment zone.");

	const catalog = this.BattleModeCatalogFor(playerID);
	const army = [];
	let cost = 0;
	let pop = 0;
	for (const unit of units || [])
	{
		const entry = catalog.find(e => e.Template == unit.template);
		const count = Math.floor(+unit.count);
		if (!entry || !(count > 0))
			continue;
		cost += entry.Cost * count;
		pop += this.BattleModePopCost(entry.Template) * count;
		army.push({ "template": entry.Template, "count": count });
	}
	if (!army.length)
		return markForTranslation("No units chosen.");
	if (cost > this.battleModePoints[playerID])
		return markForTranslation("Not enough reinforcement points.");
	const cmpPlayer = QueryPlayerIDInterface(playerID);
	if (!this.battleModePendingPop)
		this.battleModePendingPop = {};
	const pending = this.battleModePendingPop[playerID] || 0;
	if (cmpPlayer.GetPopulationCount() + pending + pop > cmpPlayer.GetPopulationLimit())
		return markForTranslation("Not enough population room. Capture control points for more.");

	this.battleModePoints[playerID] -= cost;

	const deploy = cmpDeployPosition.GetPosition2D();
	const rally = Engine.QueryInterface(deployPoint, IID_RallyPoint);
	const rallyPositions = rally && rally.GetPositions();
	const target = rallyPositions && rallyPositions.length ?
		{ "x": rallyPositions[rallyPositions.length - 1].x, "z": rallyPositions[rallyPositions.length - 1].z } :
		{ "x": deploy.x, "z": deploy.y };

	let i = 0;
	for (const unit of army)
		for (let n = 0; n < unit.count; ++n)
			this.DoAfterDelay(i++ * BATTLE_MODE_ENTRY_INTERVAL, "BattleModeSpawnReinforcement", {
				"player": playerID,
				"template": unit.template,
				"target": target
			});

	// Reserva a população até cada unidade entrar no mapa.
	this.battleModePendingPop[playerID] = pending + pop;
	return true;
};

/** Uma unidade de reforço entra pela borda e marcha até o alvo. */
Trigger.prototype.BattleModeSpawnReinforcement = function(data)
{
	const pop = this.BattleModePopCost(data.template);
	if (this.battleModePendingPop)
		this.battleModePendingPop[data.player] = Math.max(0, (this.battleModePendingPop[data.player] || 0) - pop);

	const cmpPlayer = QueryPlayerIDInterface(data.player);
	if (!cmpPlayer || cmpPlayer.GetState() != "active")
		return;

	const marker = this.battleModeEntryPoints && this.battleModeEntryPoints[data.player];
	const cmpMarkerPosition = marker && Engine.QueryInterface(marker, IID_Position);
	if (!cmpMarkerPosition || !cmpMarkerPosition.IsInWorld())
		return;
	const entry = cmpMarkerPosition.GetPosition2D();

	const ent = Engine.AddEntity(data.template);
	const cmpPosition = ent != INVALID_ENTITY && Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition)
	{
		if (ent != INVALID_ENTITY)
			Engine.DestroyEntity(ent);
		warn("Battle Mode: could not create '" + data.template + "'.");
		return;
	}
	// Lugar livre em volta do ponto de entrada (sem árvores ou pedras).
	const spot = Engine.QueryInterface(marker, IID_Footprint)?.PickSpawnPoint(ent);
	if (spot && spot.y >= 0)
		cmpPosition.JumpTo(spot.x, spot.z);
	else
		cmpPosition.JumpTo(entry.x, entry.y);
	cmpPosition.SetYRotation(Math.atan2(data.target.x - entry.x, data.target.z - entry.y));
	Engine.QueryInterface(ent, IID_Ownership).SetOwner(data.player);

	// Ao receber dono, algumas unidades são promovidas na hora (mercenários
	// começam como Avançados) e viram outra entidade: segue a promovida.
	let unit = ent;
	for (let guard = 0; guard < 4; ++guard)
	{
		const promoted = Engine.QueryInterface(unit, IID_Promotion)?.promotedUnitEntity;
		if (!promoted || promoted == INVALID_ENTITY)
			break;
		unit = promoted;
	}

	// A marcha começa um pouco depois de a unidade entrar no mapa.
	this.DoAfterDelay(BATTLE_MODE_MARCH_DELAY, "BattleModeMarchReinforcement", {
		"player": data.player,
		"entity": unit,
		"target": data.target
	});
};

Trigger.prototype.BattleModeMarchReinforcement = function(data)
{
	const cmpOwnership = Engine.QueryInterface(data.entity, IID_Ownership);
	const cmpUnitAI = Engine.QueryInterface(data.entity, IID_UnitAI);
	// Já morreu, mudou de dono ou recebeu outra ordem do jogador: não mexe.
	if (!cmpOwnership || cmpOwnership.GetOwner() != data.player || !cmpUnitAI || cmpUnitAI.GetOrders().length)
		return;
	ProcessCommand(data.player, {
		"type": "walk",
		"entities": [data.entity],
		"x": data.target.x,
		"z": data.target.z,
		"queued": false,
		"pushFront": false
	});
};

/**
 * A IA gasta os pontos de reforço sozinha, com a mesma mistura do exército
 * aleatório da tela (mais infantaria).
 */
Trigger.prototype.BattleModeAIReinforce = function(playerID)
{
	const status = this.BattleModeGetStatus(playerID);
	if (!status)
		return;
	const weights = this.battleModeCatalog?.AutoFillWeights || {};
	const weightOf = category => weights[category] !== undefined ? weights[category] : 1;
	let points = status.points;
	let popRoom = status.popLimit - status.popCount;
	const counts = {};
	for (let guard = 0; guard < 40; ++guard)
	{
		const options = status.catalog.filter(e => e.cost <= points && e.pop <= popRoom);
		if (!options.length)
			break;
		const total = options.reduce((sum, e) => sum + weightOf(e.category), 0);
		let roll = randFloat(0, total);
		const pick = options.find(e => (roll -= weightOf(e.category)) < 0) || options[0];
		counts[pick.template] = (counts[pick.template] || 0) + 1;
		points -= pick.cost;
		popRoom -= pick.pop;
	}
	const units = Object.keys(counts).map(template => ({ "template": template, "count": counts[template] }));
	if (units.length)
		this.BattleModeReinforce(playerID, units);
};

/** Pontos de controle dão população a quem os controla. */
Trigger.prototype.BattleModeOwnershipChanged = function(data)
{
	if (!InitAttributes.settings.BattleMode || !Engine.QueryInterface(data.entity, IID_ControlPoint))
		return;
	if (data.from > 0)
		QueryPlayerIDInterface(data.from)?.AddPopulationBonuses(-BATTLE_MODE_CONTROL_POINT_POP);
	if (data.to > 0)
		QueryPlayerIDInterface(data.to)?.AddPopulationBonuses(BATTLE_MODE_CONTROL_POINT_POP);
};

/**
 * Cria o exército de um jogador em faixas: infantaria na frente, depois
 * campeões, atiradores, cavalaria, heróis e cerco.
 */
Trigger.prototype.BattleModeSpawnArmy = function(playerID, army, origin, target, mapSize)
{
	let fx = target.x - origin.x;
	let fz = target.z - origin.z;
	const length = Math.sqrt(fx * fx + fz * fz) || 1;
	fx /= length;
	fz /= length;
	// Direita em relação à frente.
	const rx = fz;
	const rz = -fx;
	const angle = Math.atan2(fx, fz);

	const cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
	const cmpWaterManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_WaterManager);
	const originHeight = cmpTerrain.GetGroundLevel(origin.x, origin.z);
	const usable = (x, z) =>
		x > 8 && z > 8 && x < mapSize - 8 && z < mapSize - 8 &&
		Math.abs(cmpTerrain.GetGroundLevel(x, z) - originHeight) < 10 &&
		(!cmpWaterManager || cmpWaterManager.GetWaterLevel(x, z) < cmpTerrain.GetGroundLevel(x, z));

	const spawned = [];
	let back = 0;
	for (const category of BATTLE_MODE_ORDER)
	{
		const templates = [];
		for (const entry of army)
			if ((entry.category || "infantry") == category)
				for (let i = 0; i < entry.count; ++i)
					templates.push(entry.template);
		if (!templates.length)
			continue;

		const spacing = BATTLE_MODE_SPACING[category];
		for (let i = 0; i < templates.length; ++i)
		{
			const row = Math.floor(i / BATTLE_MODE_PER_ROW);
			const inRow = Math.min(BATTLE_MODE_PER_ROW, templates.length - row * BATTLE_MODE_PER_ROW);
			const column = i % BATTLE_MODE_PER_ROW - (inRow - 1) / 2;
			const forward = -(back + row * spacing.row);
			let x = origin.x + fx * forward + rx * column * spacing.side;
			let z = origin.z + fz * forward + rz * column * spacing.side;

			// Se o lugar for ruim (penhasco, água, borda), tenta perto do centro.
			if (!usable(x, z))
			{
				const nx = origin.x + fx * forward * 0.5 + rx * column * spacing.side * 0.5;
				const nz = origin.z + fz * forward * 0.5 + rz * column * spacing.side * 0.5;
				if (usable(nx, nz))
				{
					x = nx;
					z = nz;
				}
				else
				{
					x = origin.x;
					z = origin.z;
				}
			}
			const ent = this.BattleModeSpawnUnit(templates[i], playerID, x, z, angle);
			if (ent)
				spawned.push(ent);
		}
		back += (Math.ceil(templates.length / BATTLE_MODE_PER_ROW) - 1) * spacing.row + spacing.row + 4;
	}
	return spawned;
};

Trigger.prototype.BattleModeSpawnUnit = function(template, playerID, x, z, angle)
{
	const ent = Engine.AddEntity(template);
	if (ent == INVALID_ENTITY)
	{
		warn("Battle Mode: could not create '" + template + "'.");
		return undefined;
	}
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition)
	{
		Engine.DestroyEntity(ent);
		return undefined;
	}
	cmpPosition.JumpTo(x, z);
	cmpPosition.SetYRotation(angle);
	Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
	return ent;
};

/**
 * "Diretor" da IA no modo batalha. A cada alguns segundos, para cada
 * jogador da IA:
 *  - a infantaria (única que captura) vai tomar os pontos de controle que a
 *    IA não tem, dividida entre eles, começando pelos mais próximos;
 *  - pontos da IA com inimigos por perto recebem reforço;
 *  - o resto escolta a infantaria até o ponto disputado ou, sem pontos a
 *    tomar, avança contra o inimigo mais próximo.
 * Unidades já em combate não são interrompidas.
 */
Trigger.prototype.BattleModeDirector = function()
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const numPlayers = cmpPlayerManager.GetNumPlayers();
	if (!this.battleModeTasks)
		this.battleModeTasks = {};

	const positionOf = ent => Engine.QueryInterface(ent, IID_Position)?.GetPosition2D();
	const unitsOf = playerID => cmpRangeManager.GetEntitiesByPlayer(playerID).filter(ent =>
		Engine.QueryInterface(ent, IID_UnitAI) && Engine.QueryInterface(ent, IID_Position)?.IsInWorld());

	// Pontos de controle (de qualquer dono, inclusive gaia).
	const controlPoints = [];
	for (let playerID = 0; playerID < numPlayers; ++playerID)
		for (const ent of cmpRangeManager.GetEntitiesByPlayer(playerID))
			if (Engine.QueryInterface(ent, IID_ControlPoint) && Engine.QueryInterface(ent, IID_Position)?.IsInWorld())
				controlPoints.push({ "ent": ent, "owner": playerID, "pos": positionOf(ent) });

	for (let playerID = 1; playerID < numPlayers; ++playerID)
	{
		const cmpPlayer = QueryPlayerIDInterface(playerID);
		if (!cmpPlayer || !cmpPlayer.IsAI() || cmpPlayer.GetState() != "active")
			continue;

		this.BattleModeAIReinforce(playerID);

		const cmpDiplomacy = QueryPlayerIDInterface(playerID, IID_Diplomacy);
		const isFriend = owner => owner == playerID || (owner > 0 && cmpDiplomacy?.IsAlly(owner));
		const enemyUnits = [];
		for (let other = 1; other < numPlayers; ++other)
			if (other != playerID && cmpDiplomacy?.IsEnemy(other))
				enemyUnits.push(...unitsOf(other).map(ent => positionOf(ent)));

		const commanders = unitsOf(playerID);
		if (!commanders.length)
			continue;

		const canCapture = ent => (Engine.QueryInterface(ent, IID_Attack)?.GetAttackTypes() || []).indexOf("Capture") != -1;
		const capturers = commanders.filter(canCapture);
		const escorts = commanders.filter(ent => !canCapture(ent));

		// Centro do exército, para escolher os pontos mais próximos primeiro.
		const center = commanders.reduce((sum, ent) => {
			const pos = positionOf(ent);
			return { "x": sum.x + pos.x / commanders.length, "y": sum.y + pos.y / commanders.length };
		}, { "x": 0, "y": 0 });
		const distanceTo = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

		const toCapture = controlPoints.filter(cp => !isFriend(cp.owner))
			.sort((a, b) => distanceTo(a.pos, center) - distanceTo(b.pos, center));
		const threatened = controlPoints.filter(cp => isFriend(cp.owner) &&
			enemyUnits.some(pos => distanceTo(pos, cp.pos) < BATTLE_MODE_THREAT_RADIUS));
		// Com a maioria garantida, basta segurar; senão, vai atrás de todos.
		const hasMajority = controlPoints.length && controlPoints.filter(cp => isFriend(cp.owner)).length > controlPoints.length / 2;

		const isBusy = ent => {
			const state = Engine.QueryInterface(ent, IID_UnitAI).GetCurrentState() || "";
			return state.indexOf("COMBAT") != -1;
		};
		const taskStillValid = ent => {
			const task = this.battleModeTasks[ent];
			if (!task)
				return false;
			const cp = controlPoints.find(c => c.ent == task.cp);
			return cp && (task.type == "capture" ? !isFriend(cp.owner) : threatened.indexOf(cp) != -1);
		};
		// Parada: sempre recebe ordem. Em combate: deixa lutar. Andando com
		// uma tarefa ainda válida: deixa seguir.
		const needsOrders = ent => {
			if (Engine.QueryInterface(ent, IID_UnitAI).IsIdle())
				return true;
			if (isBusy(ent) || taskStillValid(ent))
				return false;
			return true;
		};
		const order = (ent, cmd, task) => {
			cmd.entities = [ent];
			ProcessCommand(playerID, cmd);
			this.battleModeTasks[ent] = task;
		};

		// 1) Infantaria: capturar, dividida entre os pontos (os mais próximos
		//    recebem mais gente); se nada a tomar, defender pontos ameaçados.
		const assigned = new Map(toCapture.map(cp => [cp.ent, 0]));
		for (const ent of capturers)
		{
			const task = this.battleModeTasks[ent];
			if (taskStillValid(ent) && task.type == "capture")
				assigned.set(task.cp, (assigned.get(task.cp) || 0) + 1);
		}
		for (const ent of capturers)
		{
			if (!needsOrders(ent))
				continue;
			const pos = positionOf(ent);
			if (toCapture.length && !(hasMajority && threatened.length))
			{
				const target = toCapture.slice().sort((a, b) =>
					(assigned.get(a.ent) - assigned.get(b.ent)) * 400 + distanceTo(pos, a.pos) - distanceTo(pos, b.pos))[0];
				assigned.set(target.ent, assigned.get(target.ent) + 1);
				order(ent, {
					"type": "attack",
					"target": target.ent,
					"allowCapture": true,
					"queued": false
				}, { "type": "capture", "cp": target.ent });
			}
			else if (threatened.length)
			{
				const target = threatened.slice().sort((a, b) => distanceTo(pos, a.pos) - distanceTo(pos, b.pos))[0];
				order(ent, this.BattleModeAttackWalk(target.pos), { "type": "defend", "cp": target.ent });
			}
			else if (enemyUnits.length)
				order(ent, this.BattleModeAttackWalk(this.BattleModeNearest(pos, enemyUnits)), undefined);
		}

		// 2) Escolta: vai para o ponto ameaçado ou disputado mais próximo;
		//    sem objetivos, caça o inimigo mais próximo.
		const objectives = threatened.concat(toCapture);
		for (const ent of escorts)
		{
			if (!needsOrders(ent))
				continue;
			const pos = positionOf(ent);
			if (objectives.length)
			{
				const target = objectives.slice().sort((a, b) => distanceTo(pos, a.pos) - distanceTo(pos, b.pos))[0];
				order(ent, this.BattleModeAttackWalk(target.pos), {
					"type": threatened.indexOf(target) != -1 ? "defend" : "capture",
					"cp": target.ent
				});
			}
			else if (enemyUnits.length)
				order(ent, this.BattleModeAttackWalk(this.BattleModeNearest(pos, enemyUnits)), undefined);
		}
	}
};

Trigger.prototype.BattleModeAttackWalk = function(pos)
{
	return {
		"type": "attack-walk",
		"x": pos.x,
		"z": pos.y,
		"targetClasses": { "attack": ["Unit", "Structure"] },
		"allowCapture": false,
		"queued": false
	};
};

Trigger.prototype.BattleModeNearest = function(pos, positions)
{
	let nearest = positions[0];
	let best = Infinity;
	for (const other of positions)
	{
		const distance = (other.x - pos.x) * (other.x - pos.x) + (other.y - pos.y) * (other.y - pos.y);
		if (distance < best)
		{
			best = distance;
			nearest = other;
		}
	}
	return nearest;
};

{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.DoAfterDelay(0, "BattleModeSetup", {});
	cmpTrigger.RegisterTrigger("OnOwnershipChanged", "BattleModeOwnershipChanged", { "enabled": true });
}
