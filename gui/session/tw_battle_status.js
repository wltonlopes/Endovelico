/**
 * Placar da batalha de campo (Total Warfield), no texto de avisos do topo
 * da tela: soldados vivos e batalhões em fuga de cada lado.
 */
var g_TWBattleChoiceAsked = false;

/**
 * O exército inimigo se desfez: pergunta se a batalha acaba aqui (os
 * fugitivos escapam e parte volta ao exército deles) ou se as tropas
 * perseguem os que fogem. A resposta vai para o trigger (comando
 * "tw-battle-choice"). O destino da província tomada (ocupar, saquear,
 * vassalo) é decidido no mapa da campanha, depois da batalha.
 */
function TWAskBattleChoice()
{
	g_TWBattleChoiceAsked = true;
	messageBox(
		500, 240,
		translate("The enemy army is broken and fleeing the field!") + "\n\n" +
		translate("End the battle now: the fugitives escape and some of them will rejoin their army.") + "\n" +
		translate("Pursue them: for up to a minute, every fugitive you catch is lost to the enemy for good."),
		translate("Victory"),
		[translate("End the battle"), translate("Pursue")]
	).then(button => {
		const status = Engine.GuiInterfaceCall("TWGetBattleStatus", g_ViewedPlayer);
		// A batalha pode ter acabado enquanto a caixa estava aberta.
		if (status && !status.finished)
			Engine.PostNetworkCommand({ "type": "tw-battle-choice", "choice": button == 0 ? "end" : "pursue" });
	});
}

/**
 * Fim da batalha da campanha: no lugar do "Do you want to quit?" do jogo
 * (Stay / Summary / Quit), uma caixa só, que fecha a partida e volta ao
 * mapa da campanha (lá aparecem o relatório e o destino da província).
 * QuitConfirmationDefeat é carregada depois deste arquivo: o patch entra
 * na inicialização dos jogadores.
 */
function TWPatchBattleEnd()
{
	if (typeof QuitConfirmationDefeat == "undefined" || QuitConfirmationDefeat.prototype.twPatched ||
		!g_InitAttributes?.campaignData?.totalWarfield)
		return;
	QuitConfirmationDefeat.prototype.twPatched = true;
	QuitConfirmationDefeat.prototype.confirmExit = function(won, closeSession)
	{
		if (g_IsNetworked && !g_IsNetworkedActive)
			return;
		unregisterSimulationUpdateHandler(this.confirmHandler);
		this.Title = won ? this.TitleVictory : this.TitleDefeated;
		this.Caption = (won ? translate("The battle is won!") : translate("The battle is lost.")) + "\n\n" +
			(won ? translate("Return to the campaign map to see the outcome and decide the fate of the province.") :
				translate("Return to the campaign map to see the outcome."));
		this.Buttons = [{
			"caption": translate("Return to Campaign Map"),
			"onPress": function() { this.closeSession(false); }
		}];
		this.ResumeOnClose = false;
		this.display(closeSession);
	};
}
registerPlayersInitHandler(TWPatchBattleEnd);

{
	const twRebuild = TimeNotificationOverlay.prototype.rebuild;
	TimeNotificationOverlay.prototype.rebuild = function()
	{
		twRebuild.call(this);
		const status = Engine.GuiInterfaceCall("TWGetBattleStatus", g_ViewedPlayer);
		if (!status || !status.sides)
			return;
		if (status.awaitingChoice !== undefined && status.awaitingChoice == Engine.GetPlayerID() && !g_TWBattleChoiceAsked && !status.finished)
			TWAskBattleChoice();
		const lines = [];
		for (const playerID in status.sides)
		{
			const side = status.sides[playerID];
			const player = g_Players[playerID];
			if (!player)
				continue;
			let line = sprintf(status.naval ? translate("%(player)s: %(alive)s / %(initial)s ships, %(battalions)s squadrons") :
				translate("%(player)s: %(alive)s / %(initial)s soldiers, %(battalions)s battalions"), {
				"player": coloredText(player.name, rgbToGuiColor(player.color)),
				"alive": side.alive,
				"initial": side.initial,
				"battalions": side.battalions
			});
			if (side.routing)
				line += " " + coloredText(sprintf(translate("(%(routing)s routing)"), { "routing": side.routing }), "230 110 90");
			if (side.escaped)
				line += " " + coloredText(sprintf(translate("%(escaped)s fled the field"), { "escaped": side.escaped }), "200 170 110");
			if (status.flight == playerID)
				line += " " + coloredText(status.naval ? translate("— FLEET BROKEN, FLEEING") : translate("— ARMY BROKEN, FLEEING"), "255 90 70");
			lines.push(line);
		}
		this.notificationText.caption = lines.join("\n") + "\n" + this.notificationText.caption;
	};
}
