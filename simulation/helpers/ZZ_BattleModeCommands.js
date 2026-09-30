// Enviado pelo painel de reforços do modo batalha (gui/battle_mode/reinforce)
// quando o jogador confirma a compra. Só vale em partidas do modo batalha
// (o trigger maps/scripts/BattleMode.js define BattleModeReinforce).
g_Commands["battle-reinforce"] = function(player, cmd, data)
{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	if (!cmpTrigger || typeof cmpTrigger.BattleModeReinforce != "function")
		return;

	const result = cmpTrigger.BattleModeReinforce(player, Array.isArray(cmd.units) ? cmd.units : []);
	if (result === true)
		return;

	Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).PushNotification({
		"type": "text",
		"players": [player],
		"message": result,
		"translateMessage": true
	});
};
