/** Nomes legíveis das ações diplomáticas do painel de contexto. */
const DIPLOMACY_ACTION_NAMES = {
	"insult": "Insult",
	"proposeAlliance": "Propose Alliance",
	"breakAlliance": "Break Alliance",
	"proposeTrade": "Propose Trade",
	"cancelTrade": "Cancel Trade",
	"proposeNAP": "Propose Non-Aggression",
	"cancelNAP": "Cancel Non-Aggression",
	"proposeAccess": "Propose Military Access",
	"cancelAccess": "Revoke Military Access",
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

		// Tamanho fixo em pixels de tela (não acompanha o zoom), sem sair da tela.
		const screen = this.menu.window.getComputedSize();
		const screenX = Math.min(this.menu.mouseX || 0, screen.right - 234);
		const screenY = Math.min(this.menu.mouseY || 0, screen.bottom - 246);
		Engine.GetGUIObjectByName("contextPanel").size = `${screenX} ${screenY} ${screenX + 230} ${screenY + 7 * 30 + 16}`;
		Engine.GetGUIObjectByName("contextPanel").hidden = false;

		const hero = g_GameData.playerHero;
		const moveButton = Engine.GetGUIObjectByName("contextPanelButton[0]");
		moveButton.hidden = false;
		moveButton.tooltip = "";
		const linked = g_GameData.provinces[code].canTravel(hero.location);
		// Sem a tecnologia de navegação, mostra qual falta.
		const blockReason = g_GameData.tribes[g_GameData.playerTribe].techs.getNavigationBlockReason(hero.location, code);
		const plan = code !== hero.location && twPlanRoute(hero, code);
		const routeEnd = hero.route?.length && hero.route[hero.route.length - 1];

		if (code === hero.location)
		{
			moveButton.enabled = false;
			moveButton.caption = "Move there";
		}
		else if (routeEnd == code)
		{
			// Já marcha para cá: a mesma ordem cancela.
			moveButton.enabled = true;
			moveButton.caption = "Cancel march";
			moveButton.onPress = () => {
				hero.route = [];
				this.menu.displayContextualPanel(-1);
			};
		}
		else if (linked && blockReason)
		{
			moveButton.enabled = false;
			moveButton.caption = blockReason;
			moveButton.tooltip = "Research it in the technology tree.";
		}
		else if (linked && hero.canMove(code))
		{
			moveButton.enabled = true;
			moveButton.caption = "Move there";
			moveButton.onPress = () => {
				hero.route = [];
				hero.doMove(code);
				this.menu.displayContextualPanel(-1);
			};
		}
		else
		{
			// Marcha de vários turnos (game/Routes.js): o general segue sozinho.
			const turns = plan ? plan.turns[plan.turns.length - 1] + 1 : 0;
			moveButton.enabled = !!plan;
			moveButton.caption = !plan ? "No route" :
				(plan.battle ? "March and attack" : "March here") + ` (${turns} turn${turns > 1 ? "s" : ""})`;
			moveButton.tooltip = plan ?
				"The general marches along the dotted route and keeps going on the next turns." :
				"No passable route: foreign lands need war or a military access treaty (alliances and vassals also let you pass); navigation technology and your own generals can block the way too.";
			moveButton.onPress = () => {
				twOrderMarch(hero, code);
				this.menu.displayContextualPanel(-1);
			};
		}

		if (!g_GameData.provinces[code].ownerTribe || g_GameData.provinces[code].ownerTribe === g_GameData.playerTribe)
		{
			for (let i = 1; i < 7; ++i)
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
				if (i >= 7)
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

			for (; i < 7; ++i)
			{
				let button = Engine.TryGetGUIObjectByName(`contextPanelButton[${i}]`);
				if (button)
					button.hidden = true;
			}
		}

		for (let i = 0; i < 7; ++i)
			Engine.GetGUIObjectByName(`contextPanelButton[${i}]`).size = `0 ${i * 30} 100% ${i * 30 + 27}`;
	}
}
