/** Nomes legíveis das ações diplomáticas do painel de contexto. */
const DIPLOMACY_ACTION_NAMES = {
	"insult": "Insult",
	"proposeAlliance": "Propose Alliance",
	"breakAlliance": "Break Alliance",
	"proposeTrade": "Propose Trade",
	"cancelTrade": "Cancel Trade",
	"proposeNAP": "Propose Non-Aggression",
	"cancelNAP": "Cancel Non-Aggression",
	"declareWar": "Declare War",
	"proposePeace": "Propose Peace"
};

class ContextMenu
{
	constructor(menu)
	{
		this.menu = menu;
	}

	display(code)
	{
		if (code === -1)
		{
			Engine.GetGUIObjectByName("contextPanel").hidden = true;
			return;
		}
		this.menu.selectedProvince = code;

		const pos = [
			(this.menu.mouseX || 0) / this.menu.zoom + this.menu.cameraX,
			(this.menu.mouseY || 0) / this.menu.zoom + this.menu.cameraZ
		];
		Engine.GetGUIObjectByName("contextPanel").size = this.menu.toGUISize(...pos, pos[0] + 175, pos[1] + 140);
		Engine.GetGUIObjectByName("contextPanel").hidden = false;

		Engine.GetGUIObjectByName("contextPanelButton[0]").hidden = false;
		Engine.GetGUIObjectByName("contextPanelButton[0]").enabled =
			g_GameData.playerHero.canMove(code) &&
			code !== g_GameData.playerHero.location;
		Engine.GetGUIObjectByName("contextPanelButton[0]").onPress = () => {
			g_GameData.playerHero.doMove(code);
			this.menu.displayContextualPanel(-1);
		};
		Engine.GetGUIObjectByName("contextPanelButton[0]").caption = "Move there";

		if (!g_GameData.provinces[code].ownerTribe || g_GameData.provinces[code].ownerTribe === g_GameData.playerTribe)
		{
			for (let i = 1; i < 6; ++i)
				Engine.GetGUIObjectByName(`contextPanelButton[${i}]`).hidden = true;
		}
		else
		{
			const actions = g_GameData.tribes[g_GameData.playerTribe].getDiplomacy(g_GameData.provinces[code].ownerTribe).getActions();
			let i = 1;

			// Só as ações possíveis agora: as indisponíveis ocupavam botões e
			// empurravam as outras para fora. Sempre há 5 possíveis; o painel tem 5 botões de ação.
			for (const key of Object.keys(actions).filter(key => actions[key]))
			{
				if (i >= 6)
					break;

				let button = Engine.TryGetGUIObjectByName(`contextPanelButton[${i}]`);
				if (!button)
					break;

				button.enabled = true;
				button.hidden = false;
				button.onPress = () => {
					this.menu.displayContextualPanel(-1);
					const ev = g_GameData.tribes[g_GameData.playerTribe].getDiplomacy(g_GameData.provinces[code].ownerTribe)[key]();
					g_GameData.pushTurnEvent(ev);
				};
				button.caption = DIPLOMACY_ACTION_NAMES[key] || key;
				++i;
			}

			for (; i < 6; ++i)
			{
				let button = Engine.TryGetGUIObjectByName(`contextPanelButton[${i}]`);
				if (button)
					button.hidden = true;
			}
		}

		for (let i = 0; i < 6; ++i)
			Engine.GetGUIObjectByName(`contextPanelButton[${i}]`).size = `0 ${i * 20} 100% ${(i + 1) * 20}`;
	}
}
