/**
 * Batalhas do Total Warfield na campanha.
 *
 * Uma batalha tem atacante e defensor; cada lado é um general (com os
 * batalhões dele) ou uma província (guarnição ou nativos). A batalha pode
 * ser resolvida na hora (twAutoResolve) ou jogada no mapa de campo
 * (maps/random/tw_battlefield + maps/scripts/TWFieldBattle.js) com os
 * mesmos batalhões: o jogo devolve os sobreviventes de cada um pelo id.
 *
 * Descrição salva (run.data.pendingBattle) enquanto a partida roda:
 *   { attacker: { tribe, heroId }, defender: { tribe, heroId, province },
 *     province, garrison: [batalhões gerados da guarnição], playerSide }
 */
class TWBattle
{
	/**
	 * @param attackerHero - general que ataca.
	 * @param provinceCode - província atacada (com ou sem general inimigo).
	 */
	static create(attackerHero, provinceCode)
	{
		const province = g_GameData.provinces[provinceCode];
		const defenderHero = g_GameData.getHostileGeneralAtProvince(provinceCode, attackerHero.tribe);
		const battle = {
			"attacker": { "tribe": attackerHero.tribe, "heroId": attackerHero.id },
			"defender": {
				"tribe": defenderHero ? defenderHero.tribe : province.ownerTribe,
				"heroId": defenderHero ? defenderHero.id : undefined
			},
			"province": provinceCode,
			// Sem general defendendo, a guarnição (ou os nativos) luta.
			"garrison": defenderHero ? [] : twGarrisonArmy(province),
			// Guarnição junto do general quando é a província dele.
			"siege": !!province.ownerTribe && (!defenderHero || defenderHero.tribe == province.ownerTribe),
			// No mar: batalha naval entre as esquadras (maps/random/tw_naval.js).
			"naval": province.isSea()
		};
		if (battle.naval)
		{
			battle.garrison = [];
			battle.siege = false;
		}
		if (defenderHero && province.ownerTribe == defenderHero.tribe)
			battle.garrison = twGarrisonArmy(province).slice(0, Math.max(0, province.garrison));
		// Cerco: muralha do assentamento e aríetes já construídos no sítio.
		battle.walls = battle.siege ? province.getWallType() : undefined;
		battle.siegeRams = twSiegeRams(attackerHero, provinceCode);
		battle.playerSide = battle.attacker.tribe == g_GameData.playerTribe ? "attacker" :
			battle.defender.tribe == g_GameData.playerTribe ? "defender" : undefined;
		return battle;
	}

	/**
	 * Revolta: rebeldes (batalhões gerados como nativos) atacam a
	 * província; quem defende é a guarnição e o general que estiver lá.
	 */
	static createRevolt(provinceCode, rebelTribeCode)
	{
		const province = g_GameData.provinces[provinceCode];
		const owner = province.ownerTribe;
		const defenderHero = g_GameData.tribes[owner]?.generals.find(hero => hero.location == provinceCode);
		const rebels = twGarrisonArmy(Object.assign(Object.create(Object.getPrototypeOf(province)), province, { "ownerTribe": undefined }));
		for (const battalion of rebels)
			battalion.civ = twResolveCiv(g_GameData.tribes[owner]?.civ);
		return {
			"attacker": { "tribe": rebelTribeCode },
			"attackerArmy": rebels,
			"defender": { "tribe": owner, "heroId": defenderHero?.id },
			"province": provinceCode,
			"garrison": twGarrisonArmy(province),
			"siege": true,
			"playerSide": owner == g_GameData.playerTribe ? "defender" : undefined
		};
	}

	static getHero(side)
	{
		if (side.heroId === undefined || !g_GameData.tribes[side.tribe])
			return undefined;
		return g_GameData.tribes[side.tribe].generals.find(hero => hero.id == side.heroId);
	}

	/** Batalhões de cada lado (do general e, no defensor, a guarnição). */
	static getForces(battle)
	{
		const attackerHero = this.getHero(battle.attacker);
		const defenderHero = this.getHero(battle.defender);
		const province = g_GameData.provinces[battle.province];
		const difficulty = { "easy": 0.85, "medium": 1, "hard": 1.15 }[g_GameData.difficulty] || 1;
		const aiBonus = tribe => tribe && tribe != g_GameData.playerTribe ? difficulty : 1;
		const withFleet = (battalions, hero) => battle.naval ? battalions.concat(this.getTransports(hero, battalions)) : battalions;
		return {
			"attacker": {
				"battalions": withFleet(attackerHero ? attackerHero.battalions : battle.attackerArmy || [], attackerHero),
				"hero": attackerHero,
				"difficulty": aiBonus(battle.attacker.tribe)
			},
			"defender": {
				"battalions": withFleet((defenderHero ? defenderHero.battalions : []).concat(battle.garrison), defenderHero),
				"hero": defenderHero,
				"defenseBonus": battle.siege ? this.getDefenseBonus(battle, province, attackerHero) : 0,
				"difficulty": aiBonus(battle.defender.tribe)
			}
		};
	}

	/**
	 * Quem vai ao mar sem esquadra de guerra viaja em navios mercantes
	 * (fracos): um "batalhão" virtual de transportes, um navio para cada
	 * 4 batalhões. Não fica no exército; só entra na batalha naval.
	 */
	static getTransports(hero, battalions)
	{
		if (twFleet(battalions).some(b => !twUnit(b.civ, b.key)?.transport))
			return [];
		const land = twLandBattalions(battalions);
		const transport = twTransportFor(land[0]?.civ || twResolveCiv(g_GameData.tribes[hero?.tribe]?.civ));
		if (!transport || !land.length)
			return [];
		return [{ "id": "transports_" + (hero ? hero.id : "x"), "civ": transport.civ, "key": transport.unit.key,
			"strength": Math.max(1, Math.ceil(land.length / 4)), "xp": 0, "virtual": true }];
	}

	/**
	 * Tropas embarcadas afundam com os navios: cada lado perde soldados na
	 * proporção dos navios perdidos (mais quem perdeu a batalha).
	 */
	static applyNavalLosses(battle, fleetBefore, result, lines)
	{
		for (const [side, hero] of [["attacker", this.getHero(battle.attacker)], ["defender", this.getHero(battle.defender)]])
		{
			const before = fleetBefore[side];
			if (!hero || !before.ships)
				continue;
			const after = before.ids.reduce((sum, id) => sum + (result.battalions[id] !== undefined ? Math.max(0, result.battalions[id]) : before.strength[id]), 0);
			const sunk = Math.max(0, before.ships - after);
			const lostShare = sunk / before.ships;
			const won = result.winner == side;
			const drown = Math.min(0.9, lostShare * (won ? 0.5 : 0.8));
			let drowned = 0;
			for (const battalion of twLandBattalions(hero.battalions))
			{
				const lost = Math.round(battalion.strength * drown);
				battalion.strength -= lost;
				drowned += lost;
			}
			hero.battalions = hero.battalions.filter(b => b.strength >= (twUnit(b.civ, b.key)?.naval ? 1 : 2));
			if (sunk || drowned)
				lines.push((g_GameData.tribes[hero.tribe]?.getName() || hero.tribe) + ": " + sunk + " ship" + (sunk == 1 ? "" : "s") + " sunk" +
					(drowned ? ", " + drowned + " soldiers drowned" : "") + ".");
		}
	}

	/** Máquinas de cerco do atacante (do exército e construídas no sítio). */
	static getAttackerEngines(battle, attackerHero)
	{
		return (attackerHero ? twSiegeEngines(attackerHero.battalions) : 0) + (battle.siegeRams || 0);
	}

	/**
	 * Defesa do assentamento (%): construções (muralha, torres...) e, sem
	 * máquinas de cerco para rompê-la, a muralha vale muito mais.
	 */
	static getDefenseBonus(battle, province, attackerHero)
	{
		let bonus = province.getBuildingBonus("defense") + 5;
		if (battle.walls && !this.getAttackerEngines(battle, attackerHero))
			bonus += battle.walls == "stone" ? 60 : 15;
		return bonus;
	}

	static describeSide(side, forces, battle)
	{
		const tribe = g_GameData.tribes[side.tribe];
		const name = tribe ? tribe.getName() : "Natives of " + g_GameData.provinces[battle.province].getName();
		const counts = {};
		for (const battalion of forces.battalions)
		{
			const unit = twUnit(battalion.civ, battalion.key);
			const category = TW_CATEGORY_NAMES[unit?.category] || "Troops";
			counts[category] = (counts[category] || 0) + 1;
		}
		return coloredText(name, "235 200 120") + (forces.hero ? " — " + (forces.hero.title || "General") : "") + "\n" +
			"  " + forces.battalions.length + " battalions, " + twArmySoldiers(forces.battalions) + " soldiers\n" +
			"  " + Object.keys(counts).map(c => counts[c] + " " + c).join(", ");
	}

	/** Chance (0-1) do lado do jogador vencer pela resolução automática. */
	static getPlayerChance(battle)
	{
		const forces = this.getForces(battle);
		const powerA = twArmyPower(forces.attacker.battalions, !!battle.naval) * twSideMultiplier(forces.attacker);
		const powerD = twArmyPower(forces.defender.battalions, !!battle.naval) * twSideMultiplier(forces.defender);
		const chance = powerA / Math.max(1, powerA + powerD);
		const odds = Math.pow(chance, 1.6) / (Math.pow(chance, 1.6) + Math.pow(1 - chance, 1.6));
		return battle.playerSide == "defender" ? 1 - odds : odds;
	}

	static autoResolve(battle)
	{
		const forces = this.getForces(battle);
		const result = twAutoResolve(forces.attacker, forces.defender, !!battle.naval);
		result.generals = {};
		return this.apply(battle, result);
	}

	/**
	 * Aplica o resultado (da resolução automática ou da partida).
	 * @param result - { winner: "attacker"|"defender", battalions, xp, generals }
	 * @return texto do relatório.
	 */
	static apply(battle, result)
	{
		const province = g_GameData.provinces[battle.province];
		const attackerHero = this.getHero(battle.attacker);
		const defenderHero = this.getHero(battle.defender);
		const attackerWon = result.winner == "attacker";

		// Batalha naval: navios de cada lado antes (esquadras e transportes).
		const fleetBefore = {};
		if (battle.naval)
		{
			const forces = this.getForces(battle);
			for (const side of ["attacker", "defender"])
			{
				const fleet = twFleet(forces[side].battalions);
				fleetBefore[side] = { "ids": fleet.map(b => b.id), "strength": Object.fromEntries(fleet.map(b => [b.id, b.strength])),
					"ships": fleet.reduce((sum, b) => sum + b.strength, 0) };
			}
		}

		const lostA = attackerHero ? twApplyCasualties(attackerHero.battalions, result.battalions, result.xp, result.attachments) :
			twApplyCasualties(battle.attackerArmy || [], result.battalions, result.xp);
		const lostD = (defenderHero ? twApplyCasualties(defenderHero.battalions, result.battalions, result.xp, result.attachments) : 0) +
			twApplyCasualties(battle.garrison, result.battalions, result.xp);

		// Bônus de civilização dos generais pelos inimigos abatidos (game/CivBonuses.js).
		if (typeof twCivAfterBattle == "function")
		{
			twCivAfterBattle(attackerHero, lostD);
			twCivAfterBattle(defenderHero, lostA);
		}

		// Perseguição: quem perde e ainda tem tropas recua com mais baixas.
		const loserHero = attackerWon ? defenderHero : attackerHero;
		if (loserHero && result.pursuit !== false)
			for (const battalion of loserHero.battalions)
				battalion.strength = Math.max(1, Math.round(battalion.strength * 0.85));

		// Generais mortos na batalha (só nas partidas jogadas) ou com o
		// exército aniquilado.
		const lines = [];
		if (battle.naval)
			this.applyNavalLosses(battle, fleetBefore, result, lines);
		for (const [hero, side] of [[attackerHero, "attacker"], [defenderHero, "defender"]])
		{
			if (!hero)
				continue;
			const played = result.generals && result.generals["general_" + hero.id];
			const died = played === false;
			// Sem tropas morre, a não ser que tenha escapado vivo da batalha jogada.
			if (died || !hero.battalions.length && played !== true)
			{
				lines.push((hero.title || "General") + " of " + (g_GameData.tribes[hero.tribe]?.getName() || hero.tribe) + " has fallen.");
				g_GameData.killGeneral(hero);
			}
		}

		if (attackerWon)
		{
			if (defenderHero && g_GameData.tribes[defenderHero.tribe]?.generals.indexOf(defenderHero) != -1)
				this.retreat(defenderHero);
			// Outros generais inimigos na província também recuam: a vitória
			// sempre entrega a província.
			if (attackerHero)
				for (let guard = 0, other; guard < 8 && (other = g_GameData.getHostileGeneralAtProvince(battle.province, attackerHero.tribe)); ++guard)
					if (this.retreat(other) !== false && other.location == battle.province)
						g_GameData.killGeneral(other);
			if (attackerHero && g_GameData.tribes[attackerHero.tribe]?.generals.indexOf(attackerHero) != -1)
			{
				attackerHero.location = battle.province;
				if (province.ownerTribe != attackerHero.tribe && !province.isSea() &&
					!g_GameData.getHostileGeneralAtProvince(battle.province, attackerHero.tribe))
				{
					const previous = province.ownerTribe;
					const wasCapital = !!previous && g_GameData.tribes[previous]?.getCapital() == battle.province;
					province.setOwner(attackerHero.tribe);
					province.garrison = 0;
					province.population = Math.round(province.population * 0.85);
					province.changeHappiness?.(-15);
					lines.push(province.getName() + " now belongs to " + g_GameData.tribes[attackerHero.tribe].getName() +
						(previous ? " (taken from " + g_GameData.tribes[previous]?.getName() + ")." : "."));
					// Ocupar, saquear ou fazer vassalo (Conquest.js).
					TWConquest.record(battle.province, previous, attackerHero.tribe, wasCapital);
					if (attackerHero.tribe == g_GameData.playerTribe)
						lines.push("Decide the fate of " + province.getName() + ".");
				}
			}
		}
		if (attackerWon && !attackerHero && battle.attackerArmy && province.ownerTribe != battle.attacker.tribe)
		{
			// Rebeldes vitoriosos tomam a província.
			province.setOwner(g_GameData.tribes[battle.attacker.tribe] ? battle.attacker.tribe : undefined);
			province.garrison = Math.min(3, (battle.attackerArmy || []).length);
			lines.push(province.getName() + " has fallen to the rebels.");
		}
		else if (!attackerWon && battle.garrison.length && province.ownerTribe)
			// A guarnição que sobreviveu continua (cada batalhão = 1 nível).
			province.garrison = Math.min(province.garrison, battle.garrison.length);

		// O assalto encerra o sítio (os aríetes ficam no campo).
		if (province.siege && province.siege.heroId == battle.attacker.heroId)
			delete province.siege;

		const playerWon = battle.playerSide == "attacker" ? attackerWon : battle.playerSide == "defender" ? !attackerWon : undefined;
		if (playerWon !== undefined)
		{
			if (playerWon)
				g_GameData.statistics?.BattleWon?.();
			else
				g_GameData.statistics?.BattleLost?.();
		}
		const title = playerWon === undefined ? "Battle of " + province.getName() :
			(playerWon ? "Victory at " : "Defeat at ") + province.getName();
		const report = title + "\n" +
			"Attacker losses: " + lostA + " soldiers.  Defender losses: " + lostD + " soldiers.\n" + lines.join("\n");
		g_GameData.statistics?.RegisterEvent?.(title);
		// Marcador animado no mapa (MapAnimator.js).
		if (typeof twNoteMapEvent == "function")
			twNoteMapEvent({
				"type": "battle",
				"province": battle.province,
				"attacker": battle.attacker?.tribe,
				"defender": battle.defender?.tribe,
				"attackerWon": attackerWon,
				"playerWon": playerWon,
				"title": title,
				"losses": [lostA, lostD]
			});
		return { "title": title, "report": report, "playerWon": playerWon };
	}

	// ------------------------------------------------ sítio

	/**
	 * Em vez de atacar já, o general cerca o assentamento: a cada turno
	 * constrói um aríete (até 4) e, depois de 2 turnos, a cidade passa fome
	 * (guarnição e população caem). Sem guarnição nem general defendendo,
	 * a cidade se rende. O sítio acaba se o general sair dali.
	 */
	static laySiege(battle)
	{
		const hero = this.getHero(battle.attacker);
		const province = g_GameData.provinces[battle.province];
		if (!hero || !province.ownerTribe)
			return false;
		province.siege = { "tribe": hero.tribe, "heroId": hero.id, "turns": 0, "rams": 0, "from": hero.location };
		hero.actionsLeft = 0;
		g_GameData.statistics?.RegisterEvent?.((g_GameData.tribes[hero.tribe]?.getName() || hero.tribe) + " lays siege to " + province.getName() + ".");
		return true;
	}

	/** Um turno de sítio. @return texto do que aconteceu (ou undefined). */
	static processSiege(provinceCode)
	{
		const province = g_GameData.provinces[provinceCode];
		const siege = province.siege;
		const hero = g_GameData.tribes[siege.tribe]?.generals.find(h => h.id == siege.heroId);
		const atWar = province.ownerTribe && province.ownerTribe != siege.tribe &&
			g_GameData.tribes[siege.tribe].getDiplomacy(province.ownerTribe).status === GSDiplomacy.prototype.WAR;
		if (!hero || hero.location != siege.from || !atWar || !hero.battalions.length)
		{
			delete province.siege;
			return province.getName() + ": the siege has been lifted.";
		}
		++siege.turns;
		siege.rams = Math.min(4, siege.rams + 1);
		hero.actionsLeft = 0;
		if (siege.turns < 3)
			return undefined;
		// Fome: a guarnição se desfaz aos poucos e a população cai.
		province.garrison = Math.max(0, province.garrison - 1);
		province.population = Math.round(province.population * 0.95);
		province.changeHappiness(-5);
		const defender = g_GameData.getGeneralAtProvince(provinceCode, siege.tribe);
		if (province.garrison == 0 && !defender && siege.turns >= 4)
		{
			const previous = province.ownerTribe;
			const wasCapital = !!previous && g_GameData.tribes[previous]?.getCapital() == provinceCode;
			province.setOwner(siege.tribe);
			province.population = Math.round(province.population * 0.9);
			delete province.siege;
			hero.location = provinceCode;
			TWConquest.record(provinceCode, previous, siege.tribe, wasCapital);
			return province.getName() + " has surrendered to " + g_GameData.tribes[siege.tribe].getName() +
				" after a long siege" + (previous ? " (taken from " + g_GameData.tribes[previous]?.getName() + ")." : ".");
		}
		return undefined;
	}

	/** General derrotado recua para uma província própria vizinha (ou a capital). */
	static retreat(hero)
	{
		const from = hero.location;
		const here = g_GameData.provinces[from];
		const options = (here?.getLinks() || []).filter(code => g_GameData.provinces[code]?.ownerTribe == hero.tribe &&
			!g_GameData.getGeneralAtProvince(code, hero.tribe));
		const tribe = g_GameData.tribes[hero.tribe];
		let target = options.length ? pickRandom(options) : tribe?.getCapital();
		// Sem a capital (ou ela é o próprio campo perdido): qualquer terra da tribo.
		if (!target || target == from)
			target = (tribe?.controlledProvinces || []).find(code => code != from);
		if (!target)
		{
			// Sem para onde recuar: o exército vencido se dispersa.
			g_GameData.killGeneral(hero);
			return false;
		}
		hero.location = target;
		hero.actionsLeft = 0;
		hero.lastRetreatTurn = g_GameData.turn;
	}

	// ------------------------------------------------ batalha jogada

	/** Terreno do campo de batalha pela província. */
	static getTerrain(province)
	{
		const types = province.data.mapTypes || [];
		const terrain = province.data.terrain || "";
		const has = (...names) => names.some(name => types.indexOf(name) != -1 || terrain == name);
		if (has("the_nile"))
			return "river";
		if (has("mountainous"))
			return pickRandom(["pass", "hills"]);
		if (has("desert", "semi_arid"))
			return pickRandom(["desert", "plains"]);
		if (has("coastal", "island", "medit"))
			return pickRandom(["coast", "plains", "hills"]);
		if (has("tropical"))
			return pickRandom(["forest", "river"]);
		if (has("steppe", "savanna"))
			return pickRandom(["plains", "plains", "hills"]);
		return pickRandom(["plains", "forest", "hills", "river"]);
	}

	/**
	 * Lança a partida. O jogador é sempre o jogador 1 (sul); o inimigo, o 2,
	 * comandado pelo diretor do trigger (sem IA do jogo).
	 */
	static launch(battle, closePageCallback)
	{
		const province = g_GameData.provinces[battle.province];
		const forces = this.getForces(battle);
		const playerIsAttacker = battle.playerSide == "attacker";
		const player = playerIsAttacker ? forces.attacker : forces.defender;
		const enemy = playerIsAttacker ? forces.defender : forces.attacker;
		const playerTribe = g_GameData.tribes[g_GameData.playerTribe];
		const enemyTribeCode = playerIsAttacker ? battle.defender.tribe : battle.attacker.tribe;
		const enemyTribe = g_GameData.tribes[enemyTribeCode];
		const playerCiv = twResolveCiv(playerTribe.civ);
		const enemyCiv = enemy.battalions.length ? enemy.battalions[0].civ : twResolveCiv(enemyTribe ? enemyTribe.civ : pickRandom(province.getNativeCivs()));

		// Suprimentos (game/zz_CampaignMechanics.js): exército longe de casa chega cansado.
		const vigorOf = {};
		for (const side of [forces.attacker, forces.defender])
			if (side && side.hero && typeof twSupplyVigor == "function")
				for (const battalion of side.battalions || [])
					vigorOf[battalion.id] = twSupplyVigor(side.hero);
		// Em terra lutam os batalhões; no mar, só as esquadras (com os transportes).
		const armyOf = battalions => battalions.filter(b => !!twUnit(b.civ, b.key)?.naval == !!battle.naval).map(battalion => ({
			"id": battalion.id,
			"template": twUnit(battalion.civ, battalion.key)?.template,
			"strength": battalion.strength,
			"xp": battalion.xp || 0,
			"vigor": vigorOf[battalion.id],
			"siege": !!twUnit(battalion.civ, battalion.key)?.siege,
			"naval": !!twUnit(battalion.civ, battalion.key)?.naval,
			// Acompanhantes (sacerdote, músico...) entram no fundo do batalhão.
			"attachments": (battalion.upgrades || []).map(kind => ({
				"kind": kind,
				"template": twRoster(battalion.civ)?.attachments?.[kind]?.template
			})).filter(a => a.template)
		})).filter(entry => entry.template);
		const generalOf = (hero, civ) => {
			if (!hero)
				return undefined;
			const heroes = twRoster(civ)?.heroes || [];
			if (!heroes.length)
				return undefined;
			if (!hero.battleTemplate || !heroes.some(h => h.template == hero.battleTemplate))
				hero.battleTemplate = pickRandom(heroes).template;
			return { "id": "general_" + hero.id, "template": hero.battleTemplate, "name": hero.title };
		};

		battle.terrain = this.getTerrain(province);
		CampaignRun.getCurrentRun().data.pendingBattle = battle;
		g_GameData.save();

		// Aríetes construídos no sítio entram como máquinas do atacante.
		const attackerArmy = armyOf(forces.attacker.battalions);
		const attackerCiv = forces.attacker.battalions[0]?.civ || twResolveCiv(g_GameData.tribes[battle.attacker.tribe]?.civ);
		const ram = battle.siegeRams && twRamUnit(attackerCiv);
		if (ram)
			attackerArmy.push({ "id": "siege_rams", "template": ram.template, "strength": battle.siegeRams, "siege": true });
		const playerArmy = playerIsAttacker ? attackerArmy : armyOf(player.battalions);
		const enemyArmy = playerIsAttacker ? armyOf(enemy.battalions) : attackerArmy;

		const gameSettings = new GameSettings().init();
		gameSettings.map.setType("random");
		gameSettings.map.selectMap(battle.naval ? "maps/random/tw_naval" : "maps/random/tw_battlefield");
		const soldiers = twArmySoldiers(player.battalions) + twArmySoldiers(enemy.battalions);
		// Cidade (com muralha) pede mais espaço entre ela e a borda; navios também.
		gameSettings.mapSize.setSize(soldiers > 400 || battle.siege || battle.naval ? 256 : 192);

		const mapTypes = (province.data.mapTypes || []).map(type => g_GameData.mapTypes.parse(type)).filter(Boolean);
		const biomes = [].concat(...mapTypes.map(t => t.biomes || [])).filter(biome => gameSettings.biome.available.has(biome));
		if (biomes.length)
		{
			gameSettings.biome.available = new Set(biomes);
			gameSettings.biome.setBiome("random");
		}
		else
			gameSettings.biome.setBiome("generic/temperate");

		gameSettings.playerCount.setNb(2);
		gameSettings.playerCiv.setValue(0, playerCiv);
		gameSettings.playerCiv.setValue(1, enemyCiv);
		gameSettings.nomad.setEnabled(false);
		// Sem condições de vitória do jogo: o trigger decide (exército em fuga
		// ou aniquilado) depois de deixar os vencidos fugirem pela borda.
		gameSettings.victoryConditions.fromList([]);
		// Província que o jogador pode tomar: a escolha do destino dela
		// (ocupar, saquear, vassalo) já aparece na batalha, quando o
		// exército inimigo debanda.
		let conquest;
		if (playerIsAttacker && !province.isSea() && province.ownerTribe != g_GameData.playerTribe)
		{
			const previous = g_GameData.tribes[province.ownerTribe];
			const capture = { "province": battle.province, "previousOwner": province.ownerTribe, "conqueror": g_GameData.playerTribe,
				"wasCapital": !!previous && previous.getCapital() == battle.province };
			const loot = TWConquest.getLoot(capture);
			const mode = TWConquest.vassalMode(capture);
			conquest = {
				"province": province.getName(),
				"owner": previous ? previous.getName() : "",
				"occupyGold": loot.occupy,
				"sackGold": loot.sack,
				"vassal": mode,
				"vassalName": mode == "nation" ? previous.getName() : mode == "client" ? TWConquest.clientInfo(capture).name : ""
			};
		}
		gameSettings.totalWarfield.setValue({
			"terrain": battle.naval ? "sea" : battle.terrain,
			"naval": !!battle.naval,
			"conquest": conquest,
			"armies": { "1": playerArmy, "2": enemyArmy },
			"generals": {
				"1": generalOf(player.hero, playerCiv),
				"2": generalOf(enemy.hero, enemyCiv)
			},
			"ai": [2],
			"defender": playerIsAttacker ? 2 : 1,
			"settlement": battle.siege ? {
				"player": playerIsAttacker ? 2 : 1,
				"civ": playerIsAttacker ? enemyCiv : playerCiv,
				"level": province.getSettlementLevel(),
				"walls": battle.walls,
				// O que a província construiu aparece na cidade da batalha.
				"buildings": province.buildings.slice()
			} : undefined
		});
		gameSettings.campaignData.value = {
			"run": CampaignRun.getCurrentRun().filename,
			"province": battle.province,
			"totalWarfield": true
		};

		const assignments = {
			"local": {
				"player": 1,
				"name": Engine.ConfigDB_GetValue("user", "playername.singleplayer") || Engine.GetSystemUsername()
			}
		};
		gameSettings.launchGame(assignments, false);
		closePageCallback({
			[Engine.openRequest]: {
				"page": "page_loading.xml",
				"argument": {
					"attribs": gameSettings.finalizedAttributes,
					"playerAssignments": assignments
				}
			}
		});
	}

	/**
	 * Resultado da partida (endGameData.custom do trigger) para a batalha
	 * pendente. O jogador é o jogador 1.
	 */
	static applyPlayedBattle(battle, endGameData)
	{
		const custom = endGameData.custom || {};
		const playerWon = custom.winner !== undefined ? custom.winner == 1 : !!endGameData.won;
		const result = {
			"winner": (battle.playerSide == "attacker") == playerWon ? "attacker" : "defender",
			"battalions": custom.battalions || {},
			"xp": custom.xp || {},
			"generals": custom.generals || {},
			"attachments": custom.attachments || {},
			"conquestChoice": custom.conquestChoice,
			// A fuga já foi jogada: quem escapou pela borda é o que voltou.
			"pursuit": false
		};
		const report = this.apply(battle, result);
		// Destino já escolhido na batalha: aplica e junta ao relatório.
		const capture = g_GameData.pendingCapture;
		if (report && capture && capture.province == battle.province && ["occupy", "sack", "vassal"].indexOf(result.conquestChoice) != -1)
			report.report = report.report.replace(/\nDecide the fate of [^\n]*/, "") + "\n" + TWConquest.resolve(capture, result.conquestChoice);
		return report;
	}
}
