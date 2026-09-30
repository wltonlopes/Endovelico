/**
 * Modo batalha: botão "Reforços" na zona de desdobramento. Abre o painel
 * (gui/battle_mode/reinforce.xml) com os pontos de reforço e o catálogo de
 * tropas; a compra vai para a simulação pelo comando "battle-reinforce".
 */
g_EntityCommands["battle-reinforce"] = {
	"getInfo": function(entStates)
	{
		const entState = entStates.find(state => state.battleDeploy);
		if (!entState)
			return false;

		const status = entState.battleDeploy;
		return {
			"tooltip": translate("Reinforcements") + "\n" + bodyFont(sprintf(
				translate("%(points)s reinforcement points. Each control point you hold gives %(perPoint)s points every %(time)s and %(pop)s population (you hold %(held)s). Reinforcements march in from the nearest map edge."), {
					"points": Math.floor(status.points),
					"perPoint": status.pointsPerControlPoint,
					"time": timeToString(status.interval),
					"pop": status.popPerControlPoint,
					"held": status.controlPoints
				})),
			"icon": "production.png",
			"portrait": "structures/military.png",
			"count": Math.floor(status.points),
			"enabled": true
		};
	},
	"execute": function(entStates)
	{
		const entState = entStates.find(state => state.battleDeploy);
		if (!entState)
			return;

		Engine.OpenChildPage("battle_mode/reinforce.xml", { "status": entState.battleDeploy }).then(result =>
		{
			if (result && result.units && result.units.length)
				Engine.PostNetworkCommand({
					"type": "battle-reinforce",
					"units": result.units
				});
		});
	},
	"allowedPlayers": ["Player"]
};
