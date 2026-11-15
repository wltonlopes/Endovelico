// Estado do batalhão para a interface (seleção, painel de táticas).
{
	const twGetEntityState = GuiInterface.prototype.GetEntityState;
	GuiInterface.prototype.GetEntityState = function(player, ent)
	{
		const ret = twGetEntityState.call(this, player, ent);
		if (!ret)
			return ret;

		const cmpLeader = Engine.QueryInterface(ent, IID_BattalionLeader);
		if (cmpLeader)
		{
			ret.battalion = cmpLeader.GetStatus();
			const cmpTactics = Engine.QueryInterface(ent, IID_BattalionTactics);
			if (cmpTactics)
				ret.battalion.tactics = cmpTactics.GetStatus();
			return ret;
		}

		const cmpMember = Engine.QueryInterface(ent, IID_BattalionMember);
		if (cmpMember && cmpMember.GetLeader() != INVALID_ENTITY)
			ret.battalion = { "leader": cmpMember.GetLeader(), "member": ent };
		return ret;
	};

	// Batalha de campo: estado para o painel de placar (gui/session/tw_battle_panel.js).
	GuiInterface.prototype.TWGetBattleStatus = function(player)
	{
		const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
		return cmpTrigger && typeof cmpTrigger.TWGetBattleStatus == "function" ?
			cmpTrigger.TWGetBattleStatus(player) : undefined;
	};
	GuiInterface.prototype.exposedFunctions.TWGetBattleStatus = 1;
}
