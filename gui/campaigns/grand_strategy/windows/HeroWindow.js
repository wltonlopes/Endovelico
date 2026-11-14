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

		Engine.GetGUIObjectByName("doAttack").enabled = hero.canAttack(province.code);
		Engine.GetGUIObjectByName("doAttack").onPress = () =>
		{
			const battle = hero.doAttack(province.code);
			if (!battle)
				return;

			this.menu.closePageCallback({
				[Engine.openRequest]:
				{
					page: "page_loading.xml",
					argument: battle
				}
			});
		};

		Engine.GetGUIObjectByName("strengthenGarrison").enabled = hero.canStrengthen(province.code);
		Engine.GetGUIObjectByName("weakenGarrison").enabled = hero.canWeaken(province.code);
		Engine.GetGUIObjectByName("strengthenGarrison").onPress = () => hero.doStrengthen(province.code);
		Engine.GetGUIObjectByName("weakenGarrison").onPress = () => hero.doWeaken(province.code);
	}
}
