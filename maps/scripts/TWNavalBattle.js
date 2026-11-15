/**
 * Batalha naval do Total Warfield (mapa maps/random/tw_naval.js).
 *
 * Carregado depois de TWFieldBattle.js, troca só o que muda no mar:
 *  - cada "batalhão" do exército é uma esquadra: N navios do mesmo tipo,
 *    desdobrados lado a lado (TWDeployArmy);
 *  - os sobreviventes de cada esquadra são os navios dela que ainda
 *    flutuam ou que escaparam pela borda (TWCollectSurvivors);
 *  - a vitória: um lado sem navios perde na hora; uma frota reduzida a
 *    TW_NAVAL_BROKEN dos navios diante de TW_NAVAL_ODDS vezes mais, ou que
 *    perdeu muito e ficou parada sem combate, debanda e foge para a borda
 *    do seu lado (com a mesma escolha de encerrar ou perseguir da batalha
 *    em terra);
 *  - o diretor da IA ataca com cada navio o navio inimigo mais próximo e
 *    deixa os transportes para trás.
 * Sem campanha (partida comum), cada lado recebe uma frota da sua civ.
 */
var TW_NAVAL_BROKEN = 0.35;
var TW_NAVAL_ODDS = 1.5;
/** Sem dano nenhum por esse tempo (s), quem perdeu TW_NAVAL_STALE_LOSS e é mais fraco debanda. */
var TW_NAVAL_STALE_TIME = 50;
var TW_NAVAL_STALE_LOSS = 0.3;
var TW_NAVAL_SHIP_GAP = 24;
var TW_NAVAL_SQUADRON_GAP = 46;
var TW_NAVAL_ROW_GAP = 60;
// Cada script de trigger tem escopo próprio: as constantes de
// TWFieldBattle.js não chegam aqui (as funções do protótipo, sim).
var TW_NAVAL_DEPLOY_TIME = 20;
var TW_NAVAL_FLIGHT_TIME = 60;

{
	const land = {
		"deploy": Trigger.prototype.TWDeployArmy,
		"randomArmy": Trigger.prototype.TWRandomArmy,
		"randomGeneral": Trigger.prototype.TWRandomGeneral,
		"survivors": Trigger.prototype.TWCollectSurvivors,
		"status": Trigger.prototype.TWGetBattleStatus,
		"check": Trigger.prototype.TWCheckVictory,
		"startFlight": Trigger.prototype.TWStartFlight,
		"updateFlight": Trigger.prototype.TWUpdateFlight,
		"directorTick": Trigger.prototype.TWDirectorTick
	};

	Trigger.prototype.TWIsNaval = function()
	{
		// O mapa naval é sempre naval; a campanha também manda settings.naval.
		return true;
	};

	/** Frota de demonstração: navios de guerra da civ, 4 esquadras. */
	Trigger.prototype.TWRandomArmy = function(playerID)
	{
		const civ = QueryPlayerIDInterface(playerID, IID_Identity)?.GetCiv();
		const roster = this.TWReadRoster(civ);
		const warships = (roster?.units || []).filter(u => u.naval && !u.transport && u.level != "city");
		if (!warships.length)
			return [];
		return Array.from({ "length": 4 }, (_, i) => {
			const unit = warships[i % warships.length];
			return { "id": "demo_" + playerID + "_" + i, "template": unit.template, "strength": unit.size, "xp": 0, "naval": true };
		});
	};

	// No mar o general não entra em campo (fica a bordo, nas contas da campanha).
	Trigger.prototype.TWRandomGeneral = function(playerID)
	{
		return undefined;
	};

	/** Esquadras em fileiras: até 4 lado a lado, os navios de cada uma em linha. */
	Trigger.prototype.TWDeployArmy = function(playerID, army, general)
	{
		const cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
		const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
		const center = this.TWGetDeployCenter(playerID);
		const angle = center.y < mapSize / 2 ? 0 : Math.PI;
		const forward = new Vector2D(Math.sin(angle), Math.cos(angle));
		const right = new Vector2D(Math.cos(angle), -Math.sin(angle));
		if (!this.twShipGroup)
		{
			this.twShipGroup = {};
			this.twShipEscaped = {};
			this.twNavalLastDamage = undefined;
		}
		// Navios de guerra à frente, transportes atrás.
		const squadrons = army.filter(unit => cmpTemplateManager.TemplateExists(unit.template))
			.sort((a, b) => this.TWIsTransportTemplate(a.template) - this.TWIsTransportTemplate(b.template));
		const perRow = Math.min(4, Math.max(1, squadrons.length));
		squadrons.forEach((unit, index) => {
			const count = Math.max(1, Math.round(unit.strength || 1));
			this.twSiege[unit.id] = { "player": playerID, "base": unit.template, "count": count, "naval": true };
			this.twInitial[unit.id] = { "player": playerID, "strength": count, "siege": true, "naval": true };
			this.twShipEscaped[unit.id] = 0;
			const row = Math.floor(index / perRow);
			const inRow = Math.min(perRow, squadrons.length - row * perRow);
			const column = index % perRow;
			const width = count * TW_NAVAL_SHIP_GAP;
			const rowWidth = inRow * width + (inRow - 1) * TW_NAVAL_SQUADRON_GAP;
			const start = -rowWidth / 2 + column * (width + TW_NAVAL_SQUADRON_GAP);
			for (let i = 0; i < count; ++i)
			{
				const side = start + (i + 0.5) * TW_NAVAL_SHIP_GAP;
				const pos = new Vector2D(center.x, center.y).add(Vector2D.mult(forward, -row * TW_NAVAL_ROW_GAP)).add(Vector2D.mult(right, side));
				const ent = this.TWSpawnEntity(unit.template, playerID, pos, angle);
				if (!ent)
					continue;
				Engine.QueryInterface(ent, IID_Ownership).SetOwner(playerID);
				this.twShipGroup[ent] = unit.id;
			}
		});
	};

	Trigger.prototype.TWIsTransportTemplate = function(template)
	{
		const data = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager).GetTemplate(template);
		const tokens = node => (typeof node == "object" ? node?._string : node) || "";
		const classes = (tokens(data?.Identity?.Classes) + " " + tokens(data?.Identity?.VisibleClasses)).split(/\s+/);
		return classes.indexOf("Trader") != -1 || !data?.Attack ? 1 : 0;
	};

	/** Navios vivos do jogador (das esquadras). */
	Trigger.prototype.TWShipsOf = function(playerID)
	{
		const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		return cmpRangeManager.GetEntitiesByPlayer(playerID).filter(ent =>
			this.twShipGroup && this.twShipGroup[ent] !== undefined &&
			(Engine.QueryInterface(ent, IID_Health)?.GetHitpoints() || 0) > 0 &&
			!!Engine.QueryInterface(ent, IID_Position)?.IsInWorld());
	};

	Trigger.prototype.TWCollectSurvivors = function()
	{
		const result = land.survivors.call(this);
		const alive = {};
		for (const ent in this.twShipGroup || {})
		{
			const id = this.twShipGroup[ent];
			const owner = Engine.QueryInterface(+ent, IID_Ownership)?.GetOwner();
			if (owner === undefined || owner != this.twSiege[id]?.player)
				continue;
			if ((Engine.QueryInterface(+ent, IID_Health)?.GetHitpoints() || 0) > 0 && Engine.QueryInterface(+ent, IID_Position)?.IsInWorld())
				alive[id] = (alive[id] || 0) + 1;
		}
		for (const id in this.twSiege)
			if (this.twSiege[id].naval)
				result.strength[id] = Math.min(this.twSiege[id].count, (alive[id] || 0) + (this.twShipEscaped[id] || 0));
		return result;
	};

	Trigger.prototype.TWGetBattleStatus = function()
	{
		const status = land.status.call(this);
		if (!status)
			return status;
		status.naval = true;
		// "Batalhões" no mar = esquadras com algum navio.
		const groups = {};
		for (const ent of Object.keys(this.twShipGroup || {}))
		{
			const id = this.twShipGroup[ent];
			const player = this.twSiege[id]?.player;
			if (player !== undefined && this.TWShipsOf(player).indexOf(+ent) != -1)
				(groups[player] = groups[player] || new Set()).add(id);
		}
		for (const playerID in status.sides)
			status.sides[playerID].battalions = groups[playerID] ? groups[playerID].size : 0;
		return status;
	};

	/** Soma da vida dos navios de todos (para saber se ainda há combate). */
	Trigger.prototype.TWNavalHitpoints = function(alive)
	{
		let total = 0;
		for (const playerID of alive)
			for (const ent of this.TWShipsOf(playerID))
				total += Engine.QueryInterface(ent, IID_Health).GetHitpoints();
		return total;
	};

	Trigger.prototype.TWCheckVictory = function()
	{
		if (this.twFinished)
			return;
		const numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
		const alive = [];
		for (let p = 1; p < numPlayers; ++p)
			if (QueryPlayerIDInterface(p)?.GetState() == "active")
				alive.push(p);
		if (alive.length < 2)
		{
			land.check.call(this);
			return;
		}
		const now = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime();
		if (now > 3000)
			for (const playerID of alive)
				if (!this.TWShipsOf(playerID).length)
				{
					this.TWDefeat(playerID, markForTranslation("%(player)s has no ships left."));
					return;
				}
		if (this.twFlight)
		{
			this.TWUpdateFlight();
			return;
		}

		// Combate parado: a vida total dos navios não muda.
		const hitpoints = this.TWNavalHitpoints(alive);
		if (this.twNavalHitpoints === undefined || Math.abs(hitpoints - this.twNavalHitpoints) > 1)
		{
			if (this.twNavalHitpoints !== undefined)
				this.twNavalLastDamage = now;
			this.twNavalHitpoints = hitpoints;
		}
		const quiet = this.twNavalLastDamage !== undefined && (now - this.twNavalLastDamage) / 1000 >= TW_NAVAL_STALE_TIME;

		const sides = this.TWGetBattleStatus().sides;
		const [a, b] = alive;
		for (const [loser, winner] of [[a, b], [b, a]])
		{
			if (!sides[loser] || !sides[winner] || !sides[loser].initial)
				continue;
			const mine = this.TWShipsOf(loser).length;
			const theirs = this.TWShipsOf(winner).length;
			const initial = sides[loser].initial;
			if (mine <= initial * TW_NAVAL_BROKEN && theirs >= mine * TW_NAVAL_ODDS ||
				quiet && mine <= initial * (1 - TW_NAVAL_STALE_LOSS) && theirs > mine)
			{
				this.TWStartFlight(loser);
				return;
			}
		}
	};

	Trigger.prototype.TWStartFlight = function(playerID)
	{
		this.twFlight = { "player": playerID, "start": Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() };
		const numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
		for (let p = 1; p < numPlayers; ++p)
			if (p != playerID && this.twAI.indexOf(p) == -1 && QueryPlayerIDInterface(p)?.GetState() == "active")
				this.twFlight.awaiting = p;
		Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).PushNotification({
			"type": "text",
			"players": Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetAllPlayers(),
			"message": markForTranslation("A fleet has been broken and is fleeing!"),
			"translateMessage": true
		});
		this.TWUpdateFlight();
	};

	/** Os navios do vencido rumam para a borda do seu lado; lá escapam. */
	Trigger.prototype.TWUpdateFlight = function()
	{
		const playerID = this.twFlight.player;
		const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
		const nearEdge = pos => Math.min(pos.x, pos.y, mapSize - pos.x, mapSize - pos.y) < 20;
		for (const ent of this.TWShipsOf(playerID))
		{
			const pos = this.TWPosition(ent);
			if (!pos)
				continue;
			if (nearEdge(pos))
			{
				const id = this.twShipGroup[ent];
				this.twShipEscaped[id] = (this.twShipEscaped[id] || 0) + 1;
				delete this.twShipGroup[ent];
				Engine.DestroyEntity(ent);
				continue;
			}
			const exit = this.TWGetRetreatPoint(playerID, pos);
			const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
			if (cmpUnitAI && (!cmpUnitAI.order || cmpUnitAI.order.type != "Walk"))
				cmpUnitAI.Walk(exit.x, Math.min(mapSize - 6, Math.max(6, exit.y)), false, false);
		}
		const remaining = this.TWShipsOf(playerID).length;
		const elapsed = (Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() - this.twFlight.start) / 1000;
		if (!remaining)
			this.TWDefeat(playerID, markForTranslation("%(player)s's fleet has been routed."));
		else if (this.twFlight.awaiting !== undefined)
		{
			if (elapsed >= TW_NAVAL_FLIGHT_TIME)
				this.TWBattleChoice(this.twFlight.awaiting, "pursue");
		}
		else if (elapsed >= TW_NAVAL_FLIGHT_TIME)
			this.TWDefeat(playerID, markForTranslation("%(player)s's fleet has been routed."));
	};

	/**
	 * IA no mar: depois do desdobramento, cada navio de guerra ataca o
	 * inimigo mais próximo (sem trocar de alvo enquanto luta); os
	 * transportes ficam atrás da própria frota.
	 */
	Trigger.prototype.TWDirectorTick = function()
	{
		const time = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() / 1000;
		if (time < TW_NAVAL_DEPLOY_TIME)
			return;
		const numPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetNumPlayers();
		for (const playerID of this.twAI)
		{
			const cmpPlayer = QueryPlayerIDInterface(playerID);
			if (!cmpPlayer || cmpPlayer.GetState() != "active" || this.twFlight && this.twFlight.player == playerID)
				continue;
			const cmpDiplomacy = QueryPlayerIDInterface(playerID, IID_Diplomacy);
			const enemies = [];
			for (let other = 1; other < numPlayers; ++other)
				if (other != playerID && cmpDiplomacy?.IsEnemy(other))
					enemies.push(...this.TWShipsOf(other));
			const mine = this.TWShipsOf(playerID);
			if (!mine.length || !enemies.length)
				continue;
			const warships = enemies.filter(ent => !this.TWIsTransportTemplate(this.TWTemplateOf(ent)));
			const order = (ents, cmd) => {
				if (!ents.length)
					return;
				cmd.entities = ents;
				ProcessCommand(playerID, cmd);
			};
			const fleetCenter = this.TWCenterOf(mine);
			for (const ent of mine)
			{
				const pos = this.TWPosition(ent);
				if (!pos)
					continue;
				if (this.TWIsTransportTemplate(this.TWTemplateOf(ent)))
				{
					// Transporte: atrás da frota, longe do inimigo.
					const home = this.TWGetDeployCenter(playerID);
					if (pos.distanceTo(new Vector2D(home.x, home.y)) > 30)
						order([ent], { "type": "walk", "x": home.x, "z": home.y, "queued": false, "pushFront": false });
					continue;
				}
				if (this.TWIsBusy(ent))
					continue;
				// Prefere navios de guerra; transportes quando só sobram eles.
				const target = this.TWNearest(pos, warships.length ? warships : enemies).ent;
				if (target !== undefined)
					order([ent], { "type": "attack", "target": target, "allowCapture": false, "queued": false });
			}
		}
	};

	Trigger.prototype.TWTemplateOf = function(ent)
	{
		return Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager).GetCurrentTemplateName(ent);
	};
}
