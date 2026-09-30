// Modo batalha: a zona de desdobramento informa à GUI os pontos de reforço,
// a renda, a população e o catálogo de tropas do dono (para o botão e o
// painel de reforços, gui/session/z_battle_reinforce.js).
{
	const battleModeGetEntityState = GuiInterface.prototype.GetEntityState;

	GuiInterface.prototype.GetEntityState = function(player, ent)
	{
		const ret = battleModeGetEntityState.call(this, player, ent);
		if (!ret)
			return ret;

		const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
		if (!cmpIdentity || !cmpIdentity.HasClass("DeployPoint"))
			return ret;

		const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
		const owner = Engine.QueryInterface(ent, IID_Ownership)?.GetOwner();
		if (cmpTrigger && typeof cmpTrigger.BattleModeGetStatus == "function" && owner > 0)
			ret.battleDeploy = cmpTrigger.BattleModeGetStatus(owner);
		return ret;
	};
}
