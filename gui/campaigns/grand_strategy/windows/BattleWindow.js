/**
 * Janela de batalha (Total Warfield): forças dos dois lados e a escolha
 * entre comandar a batalha de campo, resolver na hora ou recuar.
 * Depois de uma batalha, mostra o relatório.
 */
class BattleWindow
{
	constructor(menu)
	{
		this.menu = menu;
		this.window = Engine.GetGUIObjectByName("battleWindow");
		this.battle = undefined;
		Engine.GetGUIObjectByName("battleRetreat").onPress = () => this.close();
		Engine.GetGUIObjectByName("battleSiege").onPress = () => this.laySiege();
		Engine.GetGUIObjectByName("battleAuto").onPress = () => this.autoResolve();
		Engine.GetGUIObjectByName("battleFight").onPress = () => this.fight();
		Engine.GetGUIObjectByName("battleReportClose").onPress = () => {
			Engine.GetGUIObjectByName("battleReport").hidden = true;
			// Depois do relatório, o destino da província tomada.
			this.showCapture();
		};
		for (const [button, choice] of [["captureOccupy", "occupy"], ["captureSack", "sack"], ["captureVassal", "vassal"]])
			Engine.GetGUIObjectByName(button).onPress = () => this.resolveCapture(choice);
	}

	isOpen()
	{
		return !this.window.hidden;
	}

	open(battle)
	{
		this.battle = battle;
		const forces = TWBattle.getForces(battle);
		const province = g_GameData.provinces[battle.province];
		Engine.GetGUIObjectByName("battleTitle").caption = (battle.siege ? "Assault on " : "Battle of ") + province.getName();
		Engine.GetGUIObjectByName("battleAttacker").caption = "Attacker\n" + TWBattle.describeSide(battle.attacker, forces.attacker, battle) +
			"\n\n" + forces.attacker.battalions.map(b => "  " + twBattalionLabel(b)).join("\n");
		Engine.GetGUIObjectByName("battleDefender").caption = "Defender\n" + TWBattle.describeSide(battle.defender, forces.defender, battle) +
			(forces.defender.defenseBonus ? "\n  Defences: +" + forces.defender.defenseBonus + "%" : "") +
			"\n\n" + forces.defender.battalions.map(b => "  " + twBattalionLabel(b)).join("\n");
		const chance = Math.round(100 * TWBattle.getPlayerChance(battle));
		const attackerHero = TWBattle.getHero(battle.attacker);
		const engines = TWBattle.getAttackerEngines(battle, attackerHero);
		const wallsText = !battle.walls ? "" : "\n" + (battle.walls == "stone" ? "Stone walls" : "Palisade") +
			(engines ? " — " + engines + " siege engines to breach them" : coloredText(" — no siege engines: lay siege to build rams, or assault the gate by hand", "255 160 110"));
		Engine.GetGUIObjectByName("battleOdds").caption = sprintf("Chance of victory if auto-resolved: %(chance)s%%", { "chance": chance }) +
			wallsText + "\nTerrain: " + (province.data.terrain || "open ground");
		Engine.GetGUIObjectByName("battleRetreat").hidden = battle.playerSide != "attacker";
		const siegeButton = Engine.GetGUIObjectByName("battleSiege");
		siegeButton.hidden = !(battle.playerSide == "attacker" && battle.walls && !province.siege);
		siegeButton.tooltip = "Surround the settlement: every turn your army builds a ram (up to 4). From the third turn the town starves, losing garrison and people; with no garrison left it surrenders. Attack again at any time to assault with the rams built.";
		this.window.hidden = false;
	}

	close()
	{
		// Recuar devolve o movimento gasto no ataque.
		const hero = this.battle && TWBattle.getHero(this.battle.attacker);
		if (hero && this.battle.playerSide == "attacker")
			hero.actionsLeft += 1;
		this.battle = undefined;
		this.window.hidden = true;
	}

	laySiege()
	{
		if (!this.battle)
			return;
		TWBattle.laySiege(this.battle);
		this.battle = undefined;
		this.window.hidden = true;
		g_GameData.save();
	}

	autoResolve()
	{
		if (!this.battle)
			return;
		const outcome = TWBattle.autoResolve(this.battle);
		this.battle = undefined;
		this.window.hidden = true;
		g_GameData.save();
		this.showReport(outcome);
		if (!g_GameData.checkGameOver())
			g_GameData.checkVictory();
	}

	fight()
	{
		if (!this.battle)
			return;
		const battle = this.battle;
		this.battle = undefined;
		this.window.hidden = true;
		TWBattle.launch(battle, this.menu.closePageCallback);
	}

	/**
	 * Escolha do destino da província conquistada (Conquest.js): ocupar,
	 * saquear ou, se for a capital de uma nação, fazê-la vassala.
	 */
	showCapture()
	{
		const capture = g_GameData.pendingCapture;
		if (!capture || !Engine.GetGUIObjectByName("battleReport").hidden)
			return;
		const province = g_GameData.provinces[capture.province];
		const previous = g_GameData.tribes[capture.previousOwner];
		const loot = TWConquest.getLoot(capture);
		const vassalMode = TWConquest.vassalMode(capture);
		const canVassal = !!vassalMode;
		Engine.GetGUIObjectByName("captureTitle").caption = (capture.wasCapital ? "The capital " : "") + province.getName() + " is ours";
		Engine.GetGUIObjectByName("captureText").caption =
			(previous ? "Taken from " + previous.getName() + (capture.wasCapital ? ", whose capital it was." : ".") : "Taken from its native peoples.") +
			"\n" + TW_LEVEL_NAMES[province.getSettlementLevel()] + ", population " + Math.round(province.population) +
			", " + province.buildings.length + " buildings. What shall be done with it?";
		Engine.GetGUIObjectByName("captureOccupyText").caption = coloredText("Occupy", "235 200 120") +
			"\nAnnex the province and govern it.\n+" + loot.occupy + " gold.";
		Engine.GetGUIObjectByName("captureSackText").caption = coloredText("Sack", "235 200 120") +
			"\nKeep it, but plunder it: +" + loot.sack + " gold.\nLoses " + Math.round(TW_SACK_POPULATION_LOSS * 100) +
			"% of its people and about half its buildings, and is close to revolt. Other nations will trust you less.";
		Engine.GetGUIObjectByName("captureVassalText").caption = coloredText("Make vassal", "235 200 120") + "\n" + (vassalMode == "nation" ?
			"Return the capital to " + previous.getName() + ", which becomes your vassal: an ally at permanent peace with you, paying " +
			Math.round(TW_VASSAL_TRIBUTE * 100) + "% of its income every turn and half its treasury now (" + Math.round(previous.money * 0.5) + " gold)." :
			vassalMode == "client" ?
			"Install a local ruler: the " + TWConquest.clientInfo(capture).name + " becomes your client state, an ally paying " +
			Math.round(TW_VASSAL_TRIBUTE * 100) + "% of its income every turn and holding the province against " +
			(previous ? previous.getName() : "the natives") + "." :
			coloredText("Not possible here.", "160 160 160"));
		Engine.GetGUIObjectByName("captureVassal").enabled = canVassal;
		Engine.GetGUIObjectByName("captureWindow").hidden = false;
	}

	resolveCapture(choice)
	{
		const capture = g_GameData.pendingCapture;
		Engine.GetGUIObjectByName("captureWindow").hidden = true;
		if (!capture)
			return;
		const text = TWConquest.resolve(capture, choice);
		g_GameData.save();
		this.showReport({ "title": g_GameData.provinces[capture.province].getName(), "report": "\n" + text });
		if (!g_GameData.checkGameOver())
			g_GameData.checkVictory();
	}

	showReport(outcome)
	{
		if (!outcome)
			return;
		Engine.GetGUIObjectByName("battleReportTitle").caption = outcome.title;
		Engine.GetGUIObjectByName("battleReportText").caption = outcome.report.split("\n").slice(1).join("\n");
		Engine.GetGUIObjectByName("battleReport").hidden = false;
	}
}
