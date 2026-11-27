/**
 * Fase de posicionamento da batalha de campo (Total Warfield, como no Total
 * War): enquanto ela dura, um painel no topo diz quanto falta e tem o botão
 * "Start Battle"; a borda da zona do jogador aparece no terreno. Mover tropas
 * nessa fase as leva direto ao lugar (simulation/helpers/ZZ_TWCommands.js).
 */
var g_TWDeployZoneShown = false;

function TWUpdateDeploy()
{
	const panel = Engine.GetGUIObjectByName("twDeployPanel");
	if (!panel)
		return;
	const status = Engine.GuiInterfaceCall("TWGetBattleStatus", g_ViewedPlayer);
	const deploy = status && status.deploy;
	const player = Engine.GetPlayerID();
	const mine = deploy && deploy.humans.indexOf(player) != -1;
	panel.hidden = !mine;
	if (!mine)
	{
		if (g_TWDeployZoneShown)
		{
			Engine.GuiInterfaceCall("TWSetDeployZonePreview", null);
			g_TWDeployZoneShown = false;
		}
		return;
	}
	if (!g_TWDeployZoneShown)
	{
		Engine.GuiInterfaceCall("TWSetDeployZonePreview", deploy.zones[player]);
		g_TWDeployZoneShown = true;
	}
	const ready = deploy.ready.indexOf(player) != -1;
	Engine.GetGUIObjectByName("twDeployText").caption = (ready ?
		translate("Waiting for the other players to finish deploying…") :
		translate("Deployment: place your army inside the marked zone (orders move the troops at once). Drag to set the front.")) +
		"\n" + sprintf(translate("The battle starts in %(seconds)s s."), { "seconds": deploy.remaining });
	const button = Engine.GetGUIObjectByName("twDeployStart");
	button.enabled = !ready && controlsPlayer(player);
	button.onPress = function()
	{
		Engine.PostNetworkCommand({ "type": "tw-start-battle" });
	};
}
registerSimulationUpdateHandler(TWUpdateDeploy);
