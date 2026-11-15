/**
 * Run metadata for the 'grand_strategy' metagame.
 */
var g_GameData;
class GameData
{
	constructor()
	{
		this.geo =new GeoProvinceManager();
		this.turn = 0;
		this.provinces = {};
		this.tribes = {};

	    this.armies = [];

		// TESTE GEOJSON
		this.data =Engine.ReadJSONFile("campaigns/grand_strategy/data/provinces.geojson");
		this.neighbourCache = {};

		//
		this.difficulty = "medium";

		this.playerTribe = undefined;
		this.playerHero = undefined;

		this.turnI = 0;
		this.turnEvents = [];
		this.statistics = undefined;

		this.mapTypes = new MapTypes();
		this.provinceBuildingData = Engine.ReadJSONFile("campaigns/grand_strategy/data/province_buildings.json") || { buildings: [] };
		this.provinceBuildingDefinitions = this.provinceBuildingData.buildings || [];

		this.pastTurnEvents = [];

		this.victory = this.newVictoryState();
	}

	Serialize()
	{
		const tribes = {};
		for (const tribe in this.tribes)
			tribes[tribe] = this.tribes[tribe].Serialize();

		const pv = {};
		for (const prov in this.provinces)
			pv[prov] = this.provinces[prov].Serialize();

		const armies = [];

		for (const army of this.armies)
			armies.push(army.Serialize());

		const pastEvents = [];
		for (const evs of this.pastTurnEvents)
		{
			const t = [];
			for (const event of evs)
				t.push(event.serialize());
			pastEvents.push(t);
		}

		return {
			"turn": this.turn,
			"statistics": this.statistics?.Serialize?.() || g_CampaignStatistics?.GetData?.(),
			"playerTribe": this.playerTribe,
			"playerHeroID": this.playerHero?.id,
			"difficulty": this.difficulty,
			"tribes": tribes,
			"provinces": pv,
			"armies": armies, // NOVO
			"events": pastEvents,
			"lastEventID": GSEvent.GetStartEventID(),
			"victory": this.victory,
			"pendingCapture": this.pendingCapture,
		};
	}

	Deserialize(data)
	{
		this.parseHistory();

		this.turn = data.turn;
		let province =
			this.provinces[
				"magna_grecia"
			];

		if (province)
		{
		}
		// Saves antigos podem ter províncias que não existem mais no mapa.
		for (const prov in data.provinces)
			if (this.provinces[prov])
				this.provinces[prov].Deserialize(data.provinces[prov]);

		for (const code in data.tribes)
		{
			if (data.tribes[code].customTribeData)
				this.tribes[code] = new Tribe(data.tribes[code].customTribeData, true);
			this.tribes[code].Deserialize(data.tribes[code]);
		}

		this.playerTribe = data.playerTribe;
		if (data.playerHeroID)
		{
			this.playerHero =
				this.tribes[this.playerTribe]
					.generals.find(
						g => g.id == data.playerHeroID
					);
		}

		this.armies = [];

		if (data.armies)
		{
			for (const armyData of data.armies)
			{
				let army = Army.Deserialize(
					armyData
				);

				this.armies.push(army);
			}
		}

		if (!this.playerHero &&
			this.tribes[this.playerTribe].generals.length)
		{
			this.playerHero =
				this.tribes[this.playerTribe]
					.generals[0];
		}

		// Saves de antes dos retratos por facção.
		for (const code in this.tribes)
			for (const general of this.tribes[code].generals)
				if (!general.portrait)
					this.applyHeroData(general, [code, this.tribes[code].civ]);

		if (data.difficulty)
			this.difficulty = data.difficulty;

		this.victory = Object.assign(this.newVictoryState(), data.victory || {});
		this.pendingCapture = data.pendingCapture;

		this.statistics = new CampaignStatisticsManager();
		this.statistics.Deserialize(data.statistics);
		if (typeof g_CampaignStatistics === "undefined")
			g_CampaignStatistics = this.statistics;
		else
			g_CampaignStatistics.Deserialize(data.statistics);

		this.pastTurnEvents = [];
		for (const evs of data.events)
		{
			const t = [];
			for (const event of evs)
			{
				const ev = GSEvent.CreateFromSerialized(event);
				ev.deserialize(event);
				t.push(ev);
			}
			this.pastTurnEvents.push(t);
		}
		if (this.pastTurnEvents.length)
			this.turnEvents = this.pastTurnEvents[this.pastTurnEvents.length - 1];
		// Reset after as we incremented un-necessarily for a while.
		GSEvent.SetStartEventID(data.lastEventID);
	}

	static createNewGame(playerData, difficulty)
	{
		g_GameData = new GameData();
		g_GameData.initialiseGame(playerData, difficulty);
		return g_GameData;
	}

	static loadRun()
	{
		let game = new GameData();
		g_GameData = game;
		game.Deserialize(CampaignRun.getCurrentRun().data.gameData);
		if (CampaignRun.getCurrentRun().data.processEndedGame)
		{
			let data = CampaignRun.getCurrentRun().data.processEndedGame;
			if (game.processEndedGame(data))
			{
				delete CampaignRun.getCurrentRun().data.processEndedGame;
				game.save();
			}
		}

		return game;
	}

	// save(run = CampaignRun.getCurrentRun())
	// {
	// 	run.data.gameData = this.Serialize();
	// 	run.save();
	// }

	save(run = CampaignRun.getCurrentRun())
	{


		const serialized = this.Serialize();


		run.data.gameData = serialized;



		run.save();

	}

	initialiseGame(playerData, difficulty)
	{
		this.parseHistory();

		// Create human player
		this.tribes.player = new Tribe({
			"code": "player",
			"civ": playerData.civ,
			"name": playerData.tribeName,
		}, true);
		this.provinces[playerData.startProvince].setOwner("player");
		this.playerTribe = "player";
		// TODO: hero name
		this.playerHero = new Hero("player", playerData.startProvince);
		// O ícone do herói é um dos retratos da facção escolhida.
		this.applyHeroData(this.playerHero, [playerData.civ]);

		this.tribes.player.generals.push(this.playerHero);
		this.playerHero.battalions = twStartingArmy(playerData.civ, 5);
		this.tribes.player.money = 1200;

		let army =
			new Army(
				this.playerHero.id,
				"player"
			);

		army.general =
			this.playerHero.id;

		army.province =
			playerData.startProvince;

		this.armies.push(army);
		// Assign tribe initial provinces
		for (const code in this.tribes)
		{
			const tribe = this.tribes[code];

			if (!tribe.data.startProvinces)
				continue;

			for (const prov of tribe.data.startProvinces)
			{
				if (prov === playerData.startProvince)
					continue;

				if (!this.provinces[prov])
				{
					// warn(
					// 	"Province not found: " +
					// 	prov
					// );
					continue;
				}

				this.provinces[prov]
					.setOwner(code);
			}
		}
 
		this.difficulty = difficulty;

		// Criar um general inicial para cada IA
		for (const tribeCode in this.tribes)
		{
			if (tribeCode == "player")
				continue;

			const tribe =
				this.tribes[tribeCode];

			// Só cria se a tribo possuir províncias
			if (
				!tribe.controlledProvinces ||
				!tribe.controlledProvinces.length
			)
				continue;

			// Dá dinheiro suficiente
			tribe.money = 1000;

			this.recruitGeneral(
				tribeCode
			);
		}

		CampaignStatisticsInit();
		this.statistics = g_CampaignStatistics;
		this.statistics.RegisterEvent("Campaign started");
		this.save();
	}

	parseHistory()
	{
		for (let feature of this.geo.data.features)
		{
			let code =
				feature.properties.code;

			this.provinces[code] =
				new Province(feature);
		}

		let files =
		Engine.ListDirectoryFiles(
			"campaigns/grand_strategy/tribes/",
			"**.json",
			false
		);
		for (let i = 0; i < files.length; ++i)
		{
			let file = files[i];
			let data = Engine.ReadJSONFile(file);

			if (!data)
			{
				error("DATA IS NULL");
				continue;
			}
			this.tribes[data.code] = new Tribe(data);
		}
	}

	/**
	 * Generate a map and play out an attack.
	 */
	// playOutAttack(attackerTribe, provinceCode)
	// {
	// 	let province = this.provinces[provinceCode];
	// 	if (province.ownerTribe == attackerTribe)
	// 	{
	// 		error("Cannot attack your own province");
	// 		return;
	// 	}
		playOutAttack(attackerTribe, provinceCode)
		{
			let province = this.provinces[provinceCode];

			if (province.isSea())
			{
				warn("Cannot attack sea provinces");
				return;
			}

		// TODO: should snapshot or something, also this assumes human player involved.
		this.save();

		let playerIsAttacker = attackerTribe == this.playerTribe;
		let playerID = playerIsAttacker ? 0 : 1;

		// Generate a random map.
		let settings = {
			"mapType": "random",
			"map": "maps/random/mainland",
			"settings": {
				"CheatsEnabled": true
			},
			"campaignData": {
				"run": CampaignRun.getCurrentRun().filename,
				"province": provinceCode,
				"attacker": attackerTribe,
				"playerIsAttacker": playerIsAttacker,
			}
		};


		let gameSettings = new GameSettings().init();


		gameSettings.fromInitAttributes(settings);

		// TODO: pass translated name, description, preview.
		// gameSettings.mapName.set(`${this.tribes[attackerTribe].data.name} attack on ${province.name}`);
		
		// Mapa padrão: Mainland. Os tipos de mapa da província (clima) podem
		// trocar o mapa (se trouxerem "maps") e restringir os biomas.
		// Atenção: "maps": [] é verdadeiro em JS; sem checar o tamanho,
		// selectMap(undefined) apagava o mapa e a partida não carregava.
		gameSettings.map.setType("random");
		gameSettings.map.selectMap("maps/random/mainland");
		if (province.data?.mapTypes?.length)
		{
			const combinations = [];
			for (let type of province.data.mapTypes)
				combinations.push(this.mapTypes.parse(type));
			const combination = pickRandom(combinations);
			if (combination?.maps?.length)
				gameSettings.map.selectMap(pickRandom(combination.maps.map(x => "maps/" + x)));
			// Só os biomas que o mapa escolhido aceita (selectMap recalcula a lista).
			const biomes = (combination?.biomes || []).filter(biome => gameSettings.biome.available.has(biome));
			if (biomes.length)
			{
				gameSettings.biome.available = new Set(biomes);
				gameSettings.biome.setBiome("random");
			}
		}

		gameSettings.playerCount.setNb(2);

		let aiID = 1 - playerID;

		if (!gameSettings.playerAI)
		{
			error("playerAI is null");
			return;
		}
		//
		//
		gameSettings.playerAI.set(aiID, {
			"bot": "petra",
			"difficulty": this.getAIDifficulty(
				province.garrison,
				playerIsAttacker
			),
			"behavior": "random",
		});
		// warn("TARGET PROVINCE = " + province.code);
		// warn("OWNER CODE = " + province.ownerTribe);
		// warn("OWNER OBJECT = " + uneval(this.tribes[province.ownerTribe]));
		// warn(
		// 	"NATIVE CIVS = " +
		// 	uneval(province.getNativeCivs())
		// );

		gameSettings.playerCiv.setValue(0, this.tribes[attackerTribe].civ);
		if (province.ownerTribe)
			gameSettings.playerCiv.setValue(1, this.tribes[province.ownerTribe].civ);
		else
		{
			// TODO: support random options.
			gameSettings.playerCiv.setValue(1, pickRandom(province.getNativeCivs()));
		}
		///

		//
		let assignments = {
			"local": {
				"player": playerID + 1,
				"name": Engine.ConfigDB_GetValue("user", "playername.singleplayer") || Engine.GetSystemUsername()
			}
		};
		gameSettings.launchGame(assignments, false);

		return {
			"attribs": gameSettings.finalizedAttributes,
			"playerAssignments": assignments
		};
	}

	getAIDifficulty(garrison, playerIsAttacker)
	{
		const max = this.difficulty === "easy" ? 2 : this.difficulty == "medium" ? 4 : 5;
		const min = this.difficulty === "easy" ? 0 : this.difficulty == "medium" ? 2 : 3;
		return Math.max(min, Math.min(max, playerIsAttacker ? min + garrison : max - garrison));
	}

	changeGarrison(provinceCode, delta)
	{
		const province = this.provinces[provinceCode];
		const cap = this.tribes[province.ownerTribe]?.techs.getGarrisonCap() ?? 10;
		province.garrison = Math.max(0, Math.min(cap, province.garrison + delta));
	}

	/**
	 * TODO: would be nice to make this asynchronous
	 */
	doFinishTurn()
	{
		// The turnI variable is used to:
		// - fake synchronicity (by doing less work each turn, it keeps the GUI responsive)
		// - fake work - it looks weird if turns end too quickly :P.
		if (!this.turnI)
		{
			// Start of the turn
			this.turnI = 25;
			this.turnEvents = [];
		}

		--this.turnI;

		if (this.turnI === 24)
		{
			// Grant 100 Money for each owned province.
			for (let tribeCode in this.tribes)
			{
				let tribe = this.tribes[tribeCode];
				let totalBalance = 0;
				for (let provinceCode of tribe.controlledProvinces)
				{
					let province = this.provinces[provinceCode];
					// Apply happiness tax rate modifier
					totalBalance += province.getBalance() * province.getTaxRate();
				}
				// Tecnologias aumentam a arrecadação.
				totalBalance = Math.round(totalBalance * tribe.techs.getTaxMultiplier());
				// Clamp to avoid weirdness.
				tribe.money = Math.max(-999999, Math.min(tribe.money + totalBalance, 999999999));
				tribe.lastBalance = totalBalance;
				// TODO: nasty events if in debt, possibly losing the game.
			}
			// Exércitos: manutenção e reposição de baixas (Total Warfield).
			for (const tribeCode in this.tribes)
			{
				const tribe = this.tribes[tribeCode];
				let upkeep = 0;
				for (const hero of tribe.generals)
					upkeep += twProcessArmyTurn(hero);
				tribe.lastUpkeep = upkeep;
				tribe.lastBalance -= upkeep;
			}
			this.processProvinceGrowth();
			this.processSieges();
			for (const text of TWConquest.processVassals())
			{
				this.statistics?.RegisterEvent?.(text);
				this.lastBattleReport = { "title": "Vassal uprising", "report": "\n" + text };
			}

			// Uma vez por turno (antes era chamado uma vez por tribo).
			this.processTradeIncome();
			this.processResearch();

			// Process happiness and revolts
			this.processProvinceHappiness();
			this.processProvinceConstruction();
		}
		else if (this.turnI === 5)
		{
			// Tribe '''AI''' - regular stuff & diplomacy.
			for (const code in this.tribes)
			{
				if (code === this.playerTribe)
					continue;
				const tribe = this.tribes[code];
				const neighbors = new Set();
				for (const prov of tribe.controlledProvinces)
				{
					const pv = this.provinces[prov];
					// TODO: do this elsewhere
					if (pv.garrison < 2)
						pv.garrison++;
					for (const pot of pv.getLinks())
						if ((this.provinces[pot].ownerTribe || code) !== code)
							neighbors.add(this.provinces[pot].ownerTribe);
				}
				for (const neighb of neighbors)
				{
					// Vassalo e senhor não brigam pela diplomacia comum.
					if (TWConquest.isVassalPair(code, neighb))
						continue;
					const diplo = tribe.getDiplomacy(neighb);
					let ev;
					if (diplo.treaties?.alliance && !diplo.treaties?.trade)
					{
						const alliedDiplo = this.tribes[neighb]?.getDiplomacy(code);
						if (alliedDiplo)
						{
							diplo.acceptTrade();
							alliedDiplo.acceptTrade();
						}
						continue;
					}
					if (neighb && neighb !== this.playerTribe && neighb !== code && !diplo.treaties?.alliance && this.canFormAlliance(code, neighb) && this.hasMutualEnemy(code, neighb) && randBool(0.15))
						ev = diplo.proposeAlliance();
					else if (diplo.status === diplo.PEACE)
					{
						if (!diplo.treaties.trade && diplo.opinion >= 0 && randBool(0.2))
							ev = diplo.proposeTrade();
						else if (!diplo.treaties.nonAggression && diplo.opinion >= 10 && randBool(0.1))
							ev = diplo.proposeNonAggression();
						else if (!diplo.treaties.militaryAccess && diplo.opinion >= 5 && randBool(0.06))
							ev = diplo.proposeAccess();
						else if (diplo.opinion < -30 && randBool(0.33))
							ev = diplo.goHostile();
						else if (diplo.opinion > -30 && randBool(0.2))
							ev = diplo.insult();
					}
					else if (diplo.status === diplo.HOSTILE && randBool(0.5))
						ev = diplo.declareWar();
					else if (diplo.status === diplo.WAR && randBool(0.1))
						ev = diplo.proposePeace();
					if (ev)
						this.turnEvents.push(ev);
				}
			}
		}
		else if (this.turnI === 4)
		{
			// Tribe '''AI''' - Response to diplomacy events.
			for (const ev of this.turnEvents)
				if (ev.data.target && ev.data.from)
					pickRandom(this.tribes[ev.data.target]?.getDiplomacy(ev.data.from).getResponses(ev))?.action?.();
		}
		else if (this.turnI === 1)
		{
			for (const code in this.tribes)
				if (code !== this.playerTribe)
					this.runGeneralAI(code);
		}
		else if (this.turnI === 0)
		{
			// End of turn, control will be returned to the player.
			this.turn++;
			this.statistics?.NextTurn?.();

		// Atualiza estatísticas das tribos
			for (const code in this.tribes)
				this.tribes[code].updateStatistics();

		for (const tribeCode in this.tribes)
		{
			for (const general of
				this.tribes[tribeCode].generals)
			{
				const techs = this.tribes[tribeCode].techs;
				general.actionsLeft =
					Math.min(techs.getMoveCap(),
						general.actionsLeft + techs.getMoveRegen());
			}
		}

		for (const code in this.tribes)
		{
			if (
				code ==
				this.playerTribe
			)
				continue;

			let tribe =
				this.tribes[code];

			if (
				tribe.money >= tribe.techs.getRecruitCost() &&
				tribe.generals.length <
				tribe.getMaxGenerals()
			)
			{
				this.recruitGeneral(
					code
				);

				// tribe.money -= 500;
			}
		}

			this.pastTurnEvents.push(this.turnEvents);

			return true;
		}
		return false;
	}

	processEndedGame(endGameData)
	{
		// Batalha de campo do Total Warfield: aplica baixas e conquista.
		const run = CampaignRun.getCurrentRun();
		const battle = run.data.pendingBattle;
		if (battle)
		{
			const outcome = TWBattle.applyPlayedBattle(battle, endGameData);
			this.lastBattleReport = outcome;
			delete run.data.pendingBattle;
			return true;
		}
		if ((endGameData.won && endGameData.initData.playerIsAttacker) ||
			(!endGameData.won && !endGameData.initData.playerIsAttacker))
			this.provinces[endGameData.initData.province].setOwner(endGameData.initData.attacker);
		// Otherwise no change necessary, the defenders won.
		return true;
	}

	markEventProcessed(id)
	{
		for (const ev of this.turnEvents)
		{
			if (ev.id !== id)
				continue;
			ev.processed = true;
			return;
		}
	}

	/**
	 * Call this when creating an event for the current turn.
	 * (this effectively makes it so the player plays last).
	 */
	pushTurnEvent(event)
	{
		this.turnEvents.push(event);
		if (event.data.target !== this.playerTribe)
		{
			const response = pickRandom(g_GameData.tribes[event.data.target]?.getDiplomacy(event.data.from).getResponses(event));
			response?.action?.();
			if (event.type === "tradeProposal" && event.data.resolved !== true)
			{
				event.data.resolved = true;
				event.data.accepted = false;
			}
			event.processed = true;
		}
		// TODO: unhack this
		// g_CampaignMenu.infoTicker.initialise();
		return event;
	}

	canAdvanceTurn()
	{
		for (const ev of this.turnEvents)
		{
			if (ev.needUserInput() && !ev.processed)
				return false;
		}
		return true;
	}

/**
	 * General entra numa província com general inimigo (ou ataca): com o
	 * jogador envolvido, abre a janela de batalha; entre IAs, resolve na hora.
	 */
	startGeneralBattle(attacker, provinceCode)
	{
		const battle = TWBattle.create(attacker, provinceCode);
		if (battle.playerSide && typeof g_CampaignMenu != "undefined" && g_CampaignMenu?.windows?.Battle)
		{
			g_CampaignMenu.windows.Battle.open(battle);
			return battle;
		}
		TWBattle.autoResolve(battle);
		return battle;
	}

	/**
	 * IA de uma tribo: recruta onde pode, repõe tropas e avança contra
	 * vizinhos em guerra ou terras sem dono. Ataques ao jogador viram um
	 * evento de batalha (o jogador decide como lutar).
	 */
	runGeneralAI(code)
	{
		const tribe = this.tribes[code];
		this.runBuildingAI(code);
		for (const hero of tribe.generals.slice())
		{
			if (tribe.generals.indexOf(hero) == -1)
				continue;
			const here = this.provinces[hero.location];
			// Recruta em casa, guardando dinheiro para manutenção.
			if (here && here.ownerTribe == code)
				for (let tries = 0; tries < 3 && hero.battalions.length < TW_MAX_BATTALIONS; ++tries)
				{
					// Esquadras: no máximo duas por exército, só navios de guerra.
					const fleet = twFleet(hero.battalions).length;
					const options = twRecruitOptions(here, tribe).filter(o => !o.unavailable && o.cost < tribe.money - 250 &&
						(!o.unit.naval || !o.unit.transport && fleet < 2 && randBool(0.3)));
					if (!options.length)
						break;
					twRecruit(hero, pickRandom(options.slice(0, 4)).unit.key);
				}

			// Sítio em andamento: assalta com aríetes suficientes (ou guarnição
			// vencida pela fome); senão segue cercando.
			const sieged = Object.keys(this.provinces).find(c => this.provinces[c].siege?.heroId == hero.id);
			if (sieged)
			{
				const siege = this.provinces[sieged].siege;
				if (siege.rams >= 2 || this.provinces[sieged].garrison == 0 && siege.turns >= 2)
				{
					hero.actionsLeft = Math.max(1, hero.actionsLeft);
					const battle = TWBattle.create(hero, sieged);
					if (battle.playerSide)
						this.turnEvents.push(new GSAttack({ "attacker": code, "target": sieged, "battle": battle }));
					else
						TWBattle.autoResolve(battle);
				}
				continue;
			}

			// Às vezes compra um acompanhante (sacerdote...) para um batalhão.
			if (here && here.ownerTribe == code && randBool(0.35) && hero.battalions.length >= 4)
			{
				const battalion = pickRandom(hero.battalions);
				const option = twAttachmentOptions(hero, battalion).find(o => !o.unavailable && tribe.money > o.cost + 120);
				if (option)
					twBuyAttachment(hero, battalion, option.kind);
			}

			if (hero.actionsLeft <= 0 || !here)
				continue;
			// Exército fraco fica em casa repondo.
			if (hero.battalions.length < 3 || twArmySoldiers(hero.battalions) < 50)
				continue;

			// Oportunismo: exército forte na fronteira de um vizinho fraco
			// (sem aliança nem pacto) pode virar declaração de guerra.
			if (hero.battalions.length >= 6 && randBool(0.12))
				for (const neighbour of here.getLinks())
				{
					const owner = this.provinces[neighbour]?.ownerTribe;
					if (!owner || owner == code || !this.tribes[owner])
						continue;
					const diplo = tribe.getDiplomacy(owner);
					if (diplo.status === GSDiplomacy.prototype.WAR || diplo.treaties?.alliance || diplo.treaties?.nonAggression ||
						TWConquest.isVassalPair(code, owner))
						continue;
					const defenders = twGarrisonArmy(this.provinces[neighbour]).concat(this.getGeneralAtProvince(neighbour, code)?.battalions || []);
					if (twArmyPower(hero.battalions) > 1.6 * twArmyPower(defenders))
					{
						this.pushTurnEvent(diplo.declareWar());
						break;
					}
				}

			const targets = [];
			for (const neighbour of here.getLinks())
			{
				const province = this.provinces[neighbour];
				if (!province || province.ownerTribe == code || !tribe.techs.canNavigate(hero.location, neighbour) ||
					hero.actionsLeft < hero.getMoveCost(neighbour))
					continue;
				const owner = province.ownerTribe;
				const enemyHero = this.getHostileGeneralAtProvince(neighbour, code);
				const hostile = tribeCode => !tribeCode || !TWConquest.isVassalPair(code, tribeCode) &&
					tribe.getDiplomacy(tribeCode).status === GSDiplomacy.prototype.WAR;
				if (!hostile(owner) || enemyHero && !hostile(enemyHero.tribe))
					continue;
				targets.push(neighbour);
			}
			if (!targets.length)
			{
				// Nada a atacar aqui: anda pelo próprio território até a frente.
				const step = this.findFrontierStep(hero, code);
				if (step && hero.actionsLeft >= hero.getMoveCost(step))
				{
					hero.actionsLeft -= hero.getMoveCost(step);
					hero.location = step;
				}
				continue;
			}

			// Prefere terra a mar e alvos mais fracos.
			const land = targets.filter(t => !this.provinces[t].isSea());
			const target = pickRandom(land.length && randBool(0.8) ? land : targets);
			const province = this.provinces[target];
			hero.actionsLeft -= hero.getMoveCost(target);
			if (province.isSea() && !this.getHostileGeneralAtProvince(target, code))
			{
				hero.location = target;
				continue;
			}

			const battle = TWBattle.create(hero, target);
			// Muralha de pedra sem máquinas de cerco: cerca em vez de assaltar.
			if (battle.walls == "stone" && !TWBattle.getAttackerEngines(battle, hero) && province.ownerTribe && !province.siege)
			{
				hero.actionsLeft += hero.getMoveCost(target);
				TWBattle.laySiege(battle);
				if (province.ownerTribe == this.playerTribe)
					this.lastBattleReport = { "title": "Siege of " + province.getName(),
						"report": "\n" + tribe.getName() + " has laid siege to " + province.getName() + ". Starving defenders lose a garrison battalion every turn from the third; relieve the city or sally out to break the siege." };
				continue;
			}
			const forces = TWBattle.getForces(battle);
			// Só ataca com chance razoável.
			const power = twArmyPower(forces.attacker.battalions, !!battle.naval) * twSideMultiplier(forces.attacker);
			const enemyPower = twArmyPower(forces.defender.battalions, !!battle.naval) * twSideMultiplier(forces.defender);
			if (power < enemyPower * 0.9)
			{
				hero.actionsLeft += hero.getMoveCost(target);
				continue;
			}
			if (battle.playerSide)
			{
				this.turnEvents.push(new GSAttack({ "attacker": code, "target": target, "battle": battle }));
				continue;
			}
			const result = TWBattle.autoResolve(battle);
			if (province.ownerTribe == code && !battle.siege)
				this.turnEvents.push(new GSConquest({ "attacker": code, "target": target }));
		}
	}

	/**
	 * Próximo passo do general rumo à província hostil mais próxima (sem
	 * dono ou de quem está em guerra com a tribo), andando só pelo próprio
	 * território e pelo mar. Evita parar onde já há outro general da tribo.
	 */
	findFrontierStep(hero, code)
	{
		const tribe = this.tribes[code];
		const isHostile = province => !province.isSea() && province.ownerTribe != code &&
			(!province.ownerTribe || !TWConquest.isVassalPair(code, province.ownerTribe) &&
				tribe.getDiplomacy(province.ownerTribe).status === GSDiplomacy.prototype.WAR);
		// Atravessa o próprio território, o mar e as terras com passagem (acesso, aliança, vassalagem).
		const passable = province => province.ownerTribe == code || province.isSea() ||
			!!province.ownerTribe && !twAtWar(code, province.ownerTribe) && twHasPassage(code, province.ownerTribe);
		const previous = { [hero.location]: null };
		const queue = [hero.location];
		while (queue.length)
		{
			const current = queue.shift();
			for (const next of this.provinces[current].getLinks())
			{
				const province = this.provinces[next];
				if (!province || previous[next] !== undefined || !tribe.techs.canNavigate(current, next))
					continue;
				previous[next] = current;
				if (isHostile(province))
				{
					// Volta até o primeiro passo.
					let step = current;
					if (step == hero.location)
						return undefined;
					while (previous[step] != hero.location)
						step = previous[step];
					const blocked = this.tribes[code].generals.some(other => other !== hero && other.location == step) ||
						this.getHostileGeneralAtProvince(step, code);
					return blocked ? undefined : step;
				}
				if (passable(province))
					queue.push(next);
			}
		}
		return undefined;
	}

	/**
	 * IA constrói: primeiro o que dá renda e libera tropas, depois defesa e
	 * o resto, sempre guardando uma reserva para os exércitos.
	 */
	runBuildingAI(code)
	{
		const tribe = this.tribes[code];
		const priority = ["farmland", "barracks", "market", "range", "stable", "walls", "temple", "philosopher_academy", "port", "watchtower", "fortress", "elephant_stable"];
		for (const provinceCode of tribe.controlledProvinces)
		{
			const province = this.provinces[provinceCode];
			if (province.buildQueue.length || tribe.money < 700)
				continue;
			const options = province.getBuildableStructures().filter(def => province.canBuild(def.id) &&
				province.getBuildingCost(def.id) < tribe.money - 500);
			options.sort((a, b) => (priority.indexOf(a.id) + 99) % 99 - (priority.indexOf(b.id) + 99) % 99);
			if (options.length)
				province.startBuilding(options[0].id);
		}
	}

	/** Sítios em andamento (Battle.js): aríetes, fome, rendição. */
	processSieges()
	{
		for (const code in this.provinces)
		{
			const province = this.provinces[code];
			if (!province.siege)
				continue;
			const owner = province.ownerTribe;
			const besieger = province.siege.tribe;
			const text = TWBattle.processSiege(code);
			if (!text)
				continue;
			this.statistics?.RegisterEvent?.(text);
			if (owner == this.playerTribe || besieger == this.playerTribe)
				this.lastBattleReport = { "title": "Siege of " + province.getName(), "report": "\n" + text };
		}
	}

	/** Crescimento das cidades; avisa o jogador quando uma sobe de nível. */
	processProvinceGrowth()
	{
		for (const code in this.provinces)
		{
			const province = this.provinces[code];
			const level = province.processGrowth();
			if (level && province.ownerTribe == this.playerTribe)
				this.statistics?.RegisterEvent?.(province.getName() + " has grown into a " + TW_LEVEL_NAMES[level] + ".");
		}
	}

	/**
	 * Dados de herói (campaigns/grand_strategy/heroes/<código>.json): usa o
	 * primeiro arquivo que existir entre `codes` (facção, civilização...),
	 * senão default.json.
	 */
	getHeroData(codes)
	{
		// Também em minúsculas: a tribo "Rebels" usa rebels.json.
		const candidates = codes.filter(Boolean).flatMap(code => [code, String(code).toLowerCase()]);
		for (const code of candidates.concat(["default"]))
		{
			const path = "campaigns/grand_strategy/heroes/" + code + ".json";
			if (Engine.FileExists(path))
			{
				const data = Engine.ReadJSONFile(path);
				if (data)
					return data;
			}
		}
		return {
			"portraits": ["session/portraits/heroes/default.png"],
			"traits": [],
			"bonuses": {},
			"titles": ["General"]
		};
	}

	applyHeroData(hero, codes)
	{
		const heroData = this.getHeroData(codes);
		hero.portrait = pickRandom(heroData.portraits?.length ? heroData.portraits : ["session/portraits/heroes/default.png"]);
		hero.traits = heroData.traits || [];
		hero.bonuses = heroData.bonuses || {};
		hero.title = pickRandom(heroData.titles?.length ? heroData.titles : ["General"]);
	}

	recruitGeneral(tribe)
	{
		const player = this.tribes[tribe];
		const cost = player.techs.getRecruitCost();

		if (player.money < cost)
			return false;

		if (player.generals.length >= player.getMaxGenerals())
			return false;

		// Tribo sem território (foi conquistada) não tem onde recrutar.
		// Checa antes de cobrar, para não gastar o ouro à toa.
		const capital =
			player.getCapital();

		if (!capital)
			return false;

		player.money -= cost;
		this.statistics?.AddGold?.(-cost);
		this.statistics?.ArmyRaised?.();

		// let hero =
		// 	new Hero(
		// 		tribe,
		// 		capital
		// 	);

		// player.generals.push(hero);

		let hero =
			new Hero(
				tribe,
				capital
			);

		// Retrato, traços, bônus e título: primeiro os da própria facção
		// (ex.: pirates, swarm), depois os da civilização.
		this.applyHeroData(hero, [tribe, player.civ]);
		// Um general novo já vem com alguns batalhões (os da IA, um a mais).
		hero.battalions = twStartingArmy(player.civ, tribe == this.playerTribe ? 2 : 3);

		player.generals.push(hero);

		// NOVO
		let army = new Army(
			hero.id,
			tribe
		);

		army.general = hero.id;
		army.province = capital;

		this.armies.push(army);

		return hero;
	}

	selectHero(heroID)
	{
		const tribe =
			this.tribes[this.playerTribe];

		this.playerHero =
			tribe.generals.find(
				g => g.id == heroID
			);
	}

killGeneral(hero)
	{
		const tribe =
			this.tribes[
				hero.tribe
			];

		tribe.generals =
			tribe.generals.filter(
				h => h.id != hero.id
			);

		this.armies =
			this.armies.filter(
				a => a.general != hero.id
			);

		this.statistics?.GeneralLost?.(hero.id);

	}

	getArmyByGeneral(heroID)
	{
		return this.armies.find(
			a => a.general == heroID
		);
	}

	/** General de uma tribo em guerra com `tribe` na província (quem está só de passagem não conta). */
	getHostileGeneralAtProvince(provinceCode, tribe)
	{
		for (const tribeCode in this.tribes)
			if (twAtWar(tribe, tribeCode))
				for (const hero of this.tribes[tribeCode].generals)
					if (hero.location == provinceCode)
						return hero;
		return null;
	}

	getGeneralAtProvince(
		provinceCode,
		excludeTribe
	)
	{
		for (const tribeCode in this.tribes)
		{
			if (
				tribeCode ==
				excludeTribe
			)
				continue;

			for (
				const hero of
				this.tribes[
					tribeCode
				].generals
			)
			{
				if (
					hero.location ==
					provinceCode
				)
					return hero;
			}
		}

		return null;
	}

	getAllianceCount(tribeCode)
	{
		const tribe = this.tribes[tribeCode];
		if (!tribe)
			return 0;
		let count = 0;
		for (const other in tribe.diplo)
		{
			const diplo = tribe.diplo[other];
			if (diplo?.treaties?.alliance)
				count++;
		}
		return count;
	}

	getAllianceBlocSize(tribeCode)
	{
		const tribe = this.tribes[tribeCode];
		if (!tribe)
			return 0;
		const visited = new Set();
		const stack = [tribeCode];
		while (stack.length)
		{
			const current = stack.pop();
			if (visited.has(current))
				continue;
			visited.add(current);
			const currentTribe = this.tribes[current];
			if (!currentTribe)
				continue;
			for (const other in currentTribe.diplo)
			{
				const diplo = currentTribe.diplo[other];
				if (diplo?.treaties?.alliance && !visited.has(other))
					stack.push(other);
			}
		}
		return visited.size;
	}

	canFormAlliance(tribeA, tribeB)
	{
		if (!this.tribes[tribeA] || !this.tribes[tribeB])
			return false;
		if (tribeA === tribeB || tribeA === this.playerTribe || tribeB === this.playerTribe)
			return false;
		const diploA = this.tribes[tribeA].getDiplomacy(tribeB);
		const diploB = this.tribes[tribeB].getDiplomacy(tribeA);
		if (diploA.treaties?.alliance || diploB.treaties?.alliance)
			return false;
		if (this.getAllianceCount(tribeA) >= 2 || this.getAllianceCount(tribeB) >= 2)
			return false;
		if (this.getAllianceBlocSize(tribeA) + this.getAllianceBlocSize(tribeB) > 3)
			return false;
		return diploA.status === diploA.PEACE && diploB.status === diploB.PEACE && diploA.opinion >= 10 && diploB.opinion >= 10;
	}

	hasMutualEnemy(tribeA, tribeB)
	{
		if (!this.tribes[tribeA] || !this.tribes[tribeB])
			return false;
		const enemiesA = new Set();
		const enemiesB = new Set();
		for (const other in this.tribes[tribeA].diplo)
		{
			const diplo = this.tribes[tribeA].diplo[other];
			if (diplo?.status === diplo.WAR || diplo?.status === diplo.HOSTILE)
				enemiesA.add(other);
		}
		for (const other in this.tribes[tribeB].diplo)
		{
			const diplo = this.tribes[tribeB].diplo[other];
			if (diplo?.status === diplo.WAR || diplo?.status === diplo.HOSTILE)
				enemiesB.add(other);
		}
		for (const enemy of enemiesA)
			if (enemiesB.has(enemy))
				return true;
		return false;
	}

	getProvinceBuildingDefinitions()
	{
		return this.provinceBuildingDefinitions;
	}

	getProvinceBuildingData(buildingId)
	{
		return this.provinceBuildingDefinitions.find(b => b.id === buildingId);
	}

	processProvinceConstruction()
	{
		for (const province of Object.values(this.provinces))
			province.processConstruction();
	}

	/**
	 * Avança a pesquisa de todas as tribos. A IA escolhe sozinha;
	 * o jogador recebe um aviso no registro.
	 */
	processResearch()
	{
		for (const code in this.tribes)
		{
			const tribe = this.tribes[code];
			const isPlayer = code === this.playerTribe;
			const tech = tribe.techs.processTurn(!isPlayer);
			if (!tech || !isPlayer)
				continue;

			this.turnEvents.push(new GSTechResearched({ "tribe": code, "tech": tech.id }));
			this.statistics?.TechnologyResearched?.();
		}
	}

	processTradeIncome()
	{
		for (const code in this.tribes)
		{
			const tribe = this.tribes[code];

			for (const other in tribe.diplo)
			{
				const diplo = tribe.diplo[other];

				if (!diplo.treaties?.trade)
					continue;

				if (!this.canTrade(code, other))
					continue;

				tribe.money += tribe.techs.getTradeIncome();
			}
		}
	}
	canTrade(tribeA, tribeB)
	{
		// Temporário
		return true;
	}

	processProvinceHappiness()
	{
		for (const provinceCode in this.provinces)
		{
			const province = this.provinces[provinceCode];

			if (!province.ownerTribe)
				continue; // Skip unowned provinces

			let happinessChange = 0;
			const tribe = this.tribes[province.ownerTribe];

			// Provinces naturally drift towards 50 happiness (neutral)
			const neutralHappiness = 50;
			happinessChange -= (province.getHappiness() - neutralHappiness) * 0.05;

			// Garrison presence increases happiness (security)
			happinessChange += province.garrison * 2;

			// Check if tribe has a hero in this province
			let hasHero = false;
			for (const hero of tribe.generals)
			{
				if (hero.location === provinceCode)
				{
					hasHero = true;
					break;
				}
			}
			if (hasHero)
				happinessChange += 5; // Hero presence increases happiness

			// War status decreases happiness
			let isAtWar = false;
			for (const otherTribeCode in tribe.diplo)
			{
				const diplo = tribe.diplo[otherTribeCode];
				if (diplo.status === diplo.WAR)
				{
					isAtWar = true;
					break;
				}
			}
			if (isAtWar)
				happinessChange -= 3; // War decreases happiness

			// Trade treaties increase happiness (prosperity)
			let tradePartners = 0;
			for (const otherTribeCode in tribe.diplo)
			{
				const diplo = tribe.diplo[otherTribeCode];
				if (diplo.treaties?.trade)
					tradePartners++;
			}
			happinessChange += tradePartners * 1; // Each trade partner +1 happiness

			// Tecnologias (leis, aquedutos...).
			happinessChange += tribe.techs.get("happiness");

			// Apply the change
			province.changeHappiness(happinessChange);

			// Check for revolts (happiness < 20)
			if (province.getHappiness() < 20 && !province.inRevolt)
			{
				// Create revolt event
				const revoltEvent = new GSRevolt({
					"province": provinceCode
				});
				this.turnEvents.push(revoltEvent);
				province.inRevolt = true; // Prevent multiple revolts same turn
			}
			else if (province.getHappiness() >= 40)
			{
				province.inRevolt = false; // Reset revolt flag if happiness recovers
			}
		}
	}

	// ------------------------------------------------ condições de vitória

	newVictoryState()
	{
		return {
			// Condições já alcançadas (ids), na ordem em que foram cumpridas.
			"achieved": [],
			// Turno da primeira vitória (0 = ainda não venceu).
			"turn": 0,
			// O jogador escolheu continuar jogando depois de vencer.
			"continued": false
		};
	}

	/**
	 * Tribos aliadas do jogador (aliança em qualquer um dos dois sentidos).
	 */
	getPlayerAllies()
	{
		const allies = new Set();
		const player = this.tribes[this.playerTribe];
		for (const code in this.tribes)
		{
			if (code === this.playerTribe)
				continue;
			if (player?.diplo?.[code]?.treaties?.alliance ||
				this.tribes[code].diplo?.[this.playerTribe]?.treaties?.alliance)
				allies.add(code);
		}
		return allies;
	}

	/**
	 * Situação atual de cada condição de vitória. Só províncias de terra
	 * contam como território.
	 */
	getVictoryStatus()
	{
		const landProvinces = Object.keys(this.provinces).filter(code => this.provinces[code].isLand());
		const total = Math.max(1, landProvinces.length);
		const owned = {};
		for (const code of landProvinces)
		{
			const owner = this.provinces[code].ownerTribe;
			if (owner)
				owned[owner] = (owned[owner] || 0) + 1;
		}

		const allies = this.getPlayerAllies();
		const others = Object.keys(this.tribes).filter(code => code !== this.playerTribe);
		const enemies = others.filter(code => !allies.has(code) && (owned[code] || 0) > 0);

		const playerProvinces = owned[this.playerTribe] || 0;
		const allyProvinces = [...allies].reduce((sum, code) => sum + (owned[code] || 0), 0);
		const playerEconomy = this.tribes[this.playerTribe].lastBalance || 0;

		const largestOtherTerritory = Math.max(0, ...others.map(code => owned[code] || 0));
		const largestOtherEconomy = Math.max(0, ...others.map(code => this.tribes[code].lastBalance || 0));
		const largestEnemyEconomy = Math.max(0, ...enemies.map(code => this.tribes[code].lastBalance || 0));

		const territoryShare = playerProvinces / total;
		const influenceShare = (playerProvinces + allyProvinces) / total;
		const isLargestTerritory = playerProvinces > largestOtherTerritory;
		const isLargestEconomy = playerEconomy > largestOtherEconomy;
		// "200% maior" = pelo menos o triplo da economia do inimigo mais rico.
		const economyTarget = largestEnemyEconomy * (1 + this.VICTORY_ECONOMY_LEAD);
		const hasEconomicLead = playerEconomy > 0 && playerEconomy >= economyTarget;

		const percent = value => Math.floor(value * 100) + "%";

		return {
			"totalProvinces": total,
			"playerProvinces": playerProvinces,
			"allyProvinces": allyProvinces,
			"allies": [...allies],
			"territoryShare": territoryShare,
			"influenceShare": influenceShare,
			"playerEconomy": playerEconomy,
			"largestEnemyEconomy": largestEnemyEconomy,
			"conditions": [
				{
					"id": "conquest",
					"name": "Total Conquest",
					"description": "Control " + percent(this.VICTORY_CONQUEST_SHARE) + " of the map.",
					"progress": "Territory: " + percent(territoryShare) + " / " + percent(this.VICTORY_CONQUEST_SHARE),
					"achieved": territoryShare >= this.VICTORY_CONQUEST_SHARE
				},
				{
					"id": "hegemony",
					"name": "Hegemony",
					"description": "You and your allies control the whole map, with you holding the largest territory and the largest economy.",
					"progress": "Influence: " + percent(influenceShare) + " / 100%" +
						", largest territory: " + (isLargestTerritory ? "yes" : "no") +
						", largest economy: " + (isLargestEconomy ? "yes" : "no"),
					"achieved": playerProvinces + allyProvinces >= total && isLargestTerritory && isLargestEconomy
				},
				{
					"id": "economic",
					"name": "Economic Supremacy",
					"description": "An economy " + percent(this.VICTORY_ECONOMY_LEAD) + " larger than any enemy's and more than " +
						percent(this.VICTORY_ECONOMIC_TERRITORY_SHARE) + " of the map.",
					"progress": "Economy: " + Math.round(playerEconomy) + " / " + Math.ceil(Math.max(1, economyTarget)) +
						", territory: " + percent(territoryShare) + " / " + percent(this.VICTORY_ECONOMIC_TERRITORY_SHARE),
					"achieved": hasEconomicLead && territoryShare > this.VICTORY_ECONOMIC_TERRITORY_SHARE
				}
			]
		};
	}

	/**
	 * Mostra a tela de vitória quando uma condição é cumprida pela primeira
	 * vez. Depois de continuar, só uma condição nova mostra a tela de novo.
	 */
	checkVictory()
	{
		if (!this.tribes[this.playerTribe] || this.hasPlayerLost())
			return false;

		const status = this.getVictoryStatus();
		const newlyAchieved = status.conditions.filter(condition =>
			condition.achieved && this.victory.achieved.indexOf(condition.id) === -1);
		if (!newlyAchieved.length)
			return false;

		for (const condition of newlyAchieved)
		{
			this.victory.achieved.push(condition.id);
			this.statistics?.RegisterEvent?.("Victory: " + condition.name);
		}
		if (!this.victory.turn)
			this.victory.turn = this.turn;
		this.statistics?.FinalizeScore?.();
		this.save();

		if (typeof g_CampaignMenu != "undefined" && g_CampaignMenu)
			g_CampaignMenu.showVictory(newlyAchieved, status);

		return true;
	}

	hasPlayerLost()
	{
		const player =
			this.tribes[this.playerTribe];

		// Sem território = derrota
		if (player.controlledProvinces.length > 0)
			return false;

		return true;
	}

	checkGameOver()
	{
		if (!this.hasPlayerLost())
			return false;

		this.statistics?.SetDefeatReason?.("No provinces remaining");
		this.statistics?.FinalizeScore?.();

		if (typeof g_CampaignMenu != "undefined" &&
			g_CampaignMenu)
		{
			g_CampaignMenu.showGameOver(
				"Defeat",
				"Your kingdom has fallen.\n\n" +
				"You survived " +
				this.turn +
				" turns."
			);
		}

		return true;
	}
}

/** Fração do território para a vitória por conquista. */
GameData.prototype.VICTORY_CONQUEST_SHARE = 0.75;
/** Vantagem econômica sobre o inimigo mais rico (2 = 200% maior). */
GameData.prototype.VICTORY_ECONOMY_LEAD = 2;
/** Território mínimo (estritamente maior) para a vitória econômica. */
GameData.prototype.VICTORY_ECONOMIC_TERRITORY_SHARE = 0.5;
