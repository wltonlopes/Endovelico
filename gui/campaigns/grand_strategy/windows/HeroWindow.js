class HeroDetailsWindow
{
	constructor(menu)
	{
		this.menu = menu;
	}

	render()
	{
		const hero = g_GameData.playerHero;
		const tribe = g_GameData.tribes[g_GameData.playerTribe];
		const techs = tribe.techs;
		const province = g_GameData.provinces[hero.location];

		Engine.GetGUIObjectByName("heroPortrait").sprite = "stretched:" + getRoundHeroPortrait(hero.portrait);
		Engine.GetGUIObjectByName("heroTitle").caption = hero.title || "General";

		const cap = techs.getMoveCap();
		const navigation = techs.get("oceanNavigation") ? "Ocean" :
			techs.get("coastalNavigation") ? "Coastal" : coloredText("None", "200 140 110");

		Engine.GetGUIObjectByName("heroDetailsText").caption =
			`Moves: ${hero.actionsLeft} / ${cap}  (+${techs.getMoveRegen()}/turn)\n` +
			`Location: ${province.name}\n` +
			`Owner: ${g_GameData.tribes[province.ownerTribe]?.getName() || "No-one"}\n` +
			`Navigation: ${navigation}`;

		Engine.GetGUIObjectByName("heroMovesBar").size =
			`0 0 ${Math.max(0, Math.min(100, Math.round(100 * hero.actionsLeft / cap)))}% 100%`;

		const sieged = Object.keys(g_GameData.provinces).find(code => g_GameData.provinces[code].siege?.heroId == hero.id);
		Engine.GetGUIObjectByName("heroArmyText").caption = coloredText("Army: ", "235 200 120") + hero.getArmySummary() +
			(twSiegeEngines(hero.battalions) ? ", " + twSiegeEngines(hero.battalions) + " siege engines" : "") + "\n" +
			(sieged ? coloredText("Besieging " + g_GameData.provinces[sieged].getName() + ": turn " + g_GameData.provinces[sieged].siege.turns +
				", " + g_GameData.provinces[sieged].siege.rams + " rams built", "255 170 100") :
				coloredText("Upkeep: ", "235 200 120") + twArmyUpkeep(hero.battalions) + " gold/turn");
		Engine.GetGUIObjectByName("heroArmyButton").onPress = () => this.menu.windows.Army.open();

		// Atacar: a província onde está (se não for dele) ou a selecionada, se vizinha.
		const selected = this.menu.selectedProvince;
		const target = hero.canAttack(province.code) ? province.code :
			selected !== -1 && hero.canAttack(selected) ? selected : undefined;
		const attackButton = Engine.GetGUIObjectByName("doAttack");
		attackButton.enabled = target !== undefined;
		attackButton.caption = target !== undefined ? "Attack " + g_GameData.provinces[target].getName() : "Attack Province";
		attackButton.tooltip = "Select a neighbouring province you are at war with (or unclaimed land) and attack it with this army.";
		attackButton.onPress = () =>
		{
			const battle = hero.doAttack(target);
			if (battle)
				this.menu.windows.Battle.open(battle);
		};

		Engine.GetGUIObjectByName("strengthenGarrison").enabled = hero.canStrengthen(province.code);
		Engine.GetGUIObjectByName("weakenGarrison").enabled = hero.canWeaken(province.code);
		Engine.GetGUIObjectByName("strengthenGarrison").onPress = () => hero.doStrengthen(province.code);
		Engine.GetGUIObjectByName("weakenGarrison").onPress = () => hero.doWeaken(province.code);
	}
}
