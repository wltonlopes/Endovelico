class TribeDetailsWindow
{
	constructor(menu)
	{
		this.menu = menu;
	}

	render()
	{
		this.display(this.menu.selectedTribeCode ?? -1);
	}

	display(tribeCode)
	{
		if (tribeCode === -1)
		{
			Engine.GetGUIObjectByName("tribeDetails").hidden = true;
			return;
		}

		Engine.GetGUIObjectByName("tribeDetails").hidden = false;
		const tribe = g_GameData.tribes[tribeCode];

		let diploStr = "";
		if (tribeCode !== g_GameData.playerTribe)
		{
			const diplo = tribe.getDiplomacy(g_GameData.playerTribe);
			diploStr = `Opinion: ${diplo.opinion}\nStatus: ${diplo.status}`;
		}

		Engine.GetGUIObjectByName("tribeDetailsText").caption =
			`Name: ${tribe.data.name}\n` +
			`Money: ${tribe.money}\n` +
			`Diplo: ${diploStr}\n`;

		Engine.GetGUIObjectByName("goToProvinceButton").onPress = () => {
			this.menu.displayTribeDetails(-1);
			this.menu.displayProvinceDetails();
		};
	}
}
