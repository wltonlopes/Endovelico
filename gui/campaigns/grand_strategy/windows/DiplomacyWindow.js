class DiplomacyWindow
{
	constructor(menu)
	{
		this.menu = menu;
	}

	open(tribeCode)
	{
		if (tribeCode === g_GameData.playerTribe)
		{
			warn("Cannot open diplomacy with ourselves");
			return;
		}

		if (!g_GameData.tribes[tribeCode])
		{
			warn("Cannot open diplomacy: unknown tribe " + tribeCode);
			return;
		}

		this.menu.diplomacyController = new DiplomacyController(this.menu, tribeCode);
		Engine.GetGUIObjectByName("diplomacyMainPanel").hidden = false;
		Engine.GetGUIObjectByName("diplomacyWindow").hidden = false;
	}
}
