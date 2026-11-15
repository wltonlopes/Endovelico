/**
 * Placar da batalha de campo (Total Warfield), no texto de avisos do topo
 * da tela: soldados vivos e batalhões em fuga de cada lado.
 */
var g_TWBattleChoiceAsked = false;
var g_TWConquestAsked = false;

/**
 * O exército inimigo se desfez. Se a batalha é pela posse de uma província
 * (o jogador ataca), pergunta primeiro o destino dela: ocupar, saquear ou
 * fazer vassalo. Depois, se a batalha acaba aqui (os fugitivos escapam e
 * parte volta ao exército deles) ou se as tropas perseguem os que fogem.
 * As respostas vão para o trigger (comando "tw-battle-choice").
 */
function TWAskBattleChoice(status)
{
	g_TWBattleChoiceAsked = true;
	if (status && status.conquest && !status.conquestChoice && !g_TWConquestAsked)
	{
		g_TWConquestAsked = true;
		TWAskConquest(status.conquest).then(conquest => TWAskEndOrPursue(conquest));
		return;
	}
	TWAskEndOrPursue(undefined);
}

/** Ocupar, saquear ou vassalo (mesmas regras da janela da campanha). */
function TWAskConquest(conquest)
{
	const vassalText = conquest.vassal == "nation" ?
		sprintf(translate("Make vassal: return it to %(name)s, which swears fealty and pays you tribute."), { "name": conquest.vassalName }) :
		sprintf(translate("Make vassal: install a local ruler, the %(name)s, as your tributary client state."), { "name": conquest.vassalName });
	const choices = ["occupy", "sack", "vassal"];
	return messageBox(
		560, 280,
		sprintf(translate("The enemy army is broken! %(province)s lies open before us."), { "province": conquest.province }) + "\n\n" +
		sprintf(translate("Occupy: annex the province and govern it (+%(gold)s gold)."), { "gold": conquest.occupyGold }) + "\n" +
		sprintf(translate("Sack: plunder it (+%(gold)s gold); it loses people and buildings and is close to revolt."), { "gold": conquest.sackGold }) + "\n" +
		vassalText + "\n\n" +
		translate("The choice is applied when you return to the campaign map."),
		sprintf(translate("Victory — the fate of %(province)s"), { "province": conquest.province }),
		[translate("Occupy"), translate("Sack"), translate("Make Vassal")]
	).then(button => {
		const choice = choices[button] || "occupy";
		// Já manda a escolha: vale mesmo que a batalha acabe antes da próxima pergunta.
		Engine.PostNetworkCommand({ "type": "tw-battle-choice", "choice": "none", "conquest": choice });
		return choice;
	});
}

function TWAskEndOrPursue(conquest)
{
	const status = Engine.GuiInterfaceCall("TWGetBattleStatus", g_ViewedPlayer);
	if (!status || status.finished || status.awaitingChoice != Engine.GetPlayerID())
		return;
	messageBox(
		500, 240,
		translate("The enemy army is broken and fleeing the field!") + "\n\n" +
		translate("End the battle now: the fugitives escape and some of them will rejoin their army.") + "\n" +
		translate("Pursue them: for up to a minute, every fugitive you catch is lost to the enemy for good."),
		translate("Victory"),
		[translate("End the battle"), translate("Pursue")]
	).then(button => {
		Engine.PostNetworkCommand({ "type": "tw-battle-choice", "choice": button == 0 ? "end" : "pursue", "conquest": conquest });
	});
}

{
	const twRebuild = TimeNotificationOverlay.prototype.rebuild;
	TimeNotificationOverlay.prototype.rebuild = function()
	{
		twRebuild.call(this);
		const status = Engine.GuiInterfaceCall("TWGetBattleStatus", g_ViewedPlayer);
		if (!status || !status.sides)
			return;
		if (status.awaitingChoice !== undefined && status.awaitingChoice == Engine.GetPlayerID() && !g_TWBattleChoiceAsked)
			TWAskBattleChoice(status);
		// Batalha vencida sem fuga (inimigo aniquilado): pergunta o destino no fim.
		else if (status.finished && status.winner == Engine.GetPlayerID() && status.conquest && !status.conquestChoice && !g_TWConquestAsked)
		{
			g_TWConquestAsked = true;
			TWAskConquest(status.conquest);
		}
		const lines = [];
		for (const playerID in status.sides)
		{
			const side = status.sides[playerID];
			const player = g_Players[playerID];
			if (!player)
				continue;
			let line = sprintf(translate("%(player)s: %(alive)s / %(initial)s soldiers, %(battalions)s battalions"), {
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
				line += " " + coloredText(translate("— ARMY BROKEN, FLEEING"), "255 90 70");
			lines.push(line);
		}
		this.notificationText.caption = lines.join("\n") + "\n" + this.notificationText.caption;
	};
}
