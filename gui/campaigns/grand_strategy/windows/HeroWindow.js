class HeroDetailsWindow
{
	constructor(menu)
	{
		this.menu = menu;
	}

	render()
	{
		Engine.GetGUIObjectByName("heroDetailsText").caption = `` +
			`Moves left: ${g_GameData.playerHero.actionsLeft}\n` +
			`Location: ${g_GameData.provinces[g_GameData.playerHero.location].name}\n` +
			`Owner: ${g_GameData.provinces[g_GameData.playerHero.location].ownerTribe || "No-one" }\n`;
		const province = g_GameData.provinces[g_GameData.playerHero.location];

		Engine.GetGUIObjectByName("doAttack").enabled = g_GameData.playerHero.canAttack(province.code);
		Engine.GetGUIObjectByName("doAttack").onPress = () =>
		{
			const battle = g_GameData.playerHero.doAttack(province.code);
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

		Engine.GetGUIObjectByName("strengthenGarrison").enabled = g_GameData.playerHero.canStrengthen(province.code);
		Engine.GetGUIObjectByName("weakenGarrison").enabled = g_GameData.playerHero.canWeaken(province.code);
		Engine.GetGUIObjectByName("strengthenGarrison").onPress = () => g_GameData.playerHero.doStrengthen(province.code);
		Engine.GetGUIObjectByName("weakenGarrison").onPress = () => g_GameData.playerHero.doWeaken(province.code);
	}
}
