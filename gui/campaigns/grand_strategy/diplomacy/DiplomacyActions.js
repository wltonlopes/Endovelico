function setupButtons(controller)
{
	const actions = controller.diplomacy.getActions();

	const allyButton = Engine.GetGUIObjectByName("allyButton");
	allyButton.enabled = actions.proposeAlliance;
	allyButton.caption = actions.proposeAlliance ? "Propose Alliance" : "Alliance";
	allyButton.onPress = () => {
		if (!actions.proposeAlliance)
			return;
		const ev = controller.diplomacy.proposeAlliance();
		if (ev)
			g_GameData.pushTurnEvent(ev);
		controller.refresh();
	};

	const pactButton = Engine.GetGUIObjectByName("pactButton");
	pactButton.enabled = actions.proposeNAP;
	pactButton.caption = actions.proposeNAP ? "Propose Non-Aggression Pact" : "Non-Aggression Pact";
	pactButton.onPress = () => {
		if (!actions.proposeNAP)
			return;
		const ev = controller.diplomacy.proposeNonAggression();
		if (ev)
			g_GameData.pushTurnEvent(ev);
		controller.refresh();
	};

	const tradeButton = Engine.GetGUIObjectByName("tradeButton");
	tradeButton.enabled = actions.proposeTrade;
	tradeButton.caption = actions.proposeTrade ? "Propose Trade" : "Trade";
	tradeButton.onPress = () => {
		if (!actions.proposeTrade)
			return;
		const ev = controller.diplomacy.proposeTrade();
		if (ev)
			g_GameData.pushTurnEvent(ev);
		controller.refresh();
	};

	const warButton = Engine.GetGUIObjectByName("warButton");
	warButton.enabled = actions.declareWar;
	warButton.caption = actions.declareWar ? "Declare War" : "At War";
	warButton.onPress = () => {
		if (!actions.declareWar)
			return;
		const ev = controller.diplomacy.declareWar();
		if (ev)
			g_GameData.pushTurnEvent(ev);
		controller.refresh();
	};

	const peaceButton = Engine.GetGUIObjectByName("peaceButton");
	peaceButton.enabled = actions.proposePeace;
	peaceButton.caption = actions.proposePeace ? "Propose Peace" : "Peace";
	peaceButton.onPress = () => {
		if (!actions.proposePeace)
			return;
		const ev = controller.diplomacy.proposePeace();
		if (ev)
			g_GameData.pushTurnEvent(ev);
		controller.refresh();
	};

	Engine.GetGUIObjectByName("closeButton").onPress = () => {
		Engine.GetGUIObjectByName("diplomacyWindow").hidden = true;
		Engine.GetGUIObjectByName("diplomacyMainPanel").hidden = true;
	};
}