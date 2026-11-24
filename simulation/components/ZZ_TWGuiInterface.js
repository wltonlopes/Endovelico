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
		else if (TWIsGeneral(ent))
			ret.twGeneral = {
				"rally": TWGeneralAbilityCooldown(ent, "rally"),
				"inspire": TWGeneralAbilityCooldown(ent, "inspire")
			};
		return ret;
	};

	/**
	 * Cartões de unidade (gui/session/tw_unit_cards.js): um por batalhão do
	 * jogador, com retrato, soldados, moral, vigor e munição.
	 */
	GuiInterface.prototype.TWGetBattalionCards = function(player)
	{
		const cards = [];
		for (const ent of Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).GetEntitiesByPlayer(player))
		{
			const cmpLeader = Engine.QueryInterface(ent, IID_BattalionLeader);
			if (!cmpLeader || cmpLeader.escaped || !Engine.QueryInterface(ent, IID_Position)?.IsInWorld())
				continue;
			const cmpTactics = Engine.QueryInterface(ent, IID_BattalionTactics);
			const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
			cards.push({
				"ent": ent,
				"campaignId": cmpLeader.GetCampaignId(),
				"name": cmpIdentity ? cmpIdentity.GetGenericName() : "",
				"icon": cmpIdentity && cmpIdentity.template.Icon || "",
				"strength": cmpLeader.GetStrength(),
				"maxStrength": cmpLeader.GetMaxStrength(),
				"morale": cmpTactics ? Math.round(cmpTactics.morale) : 100,
				"moraleState": cmpTactics ? cmpTactics.GetMoraleState() : "steady",
				"routing": !!cmpTactics && cmpTactics.IsRouting(),
				"engaged": !!cmpTactics && cmpTactics.IsEngaged(),
				"vigor": cmpTactics ? Math.round(cmpTactics.vigor) : 100,
				"ammo": cmpTactics && cmpTactics.UsesAmmo() ? cmpTactics.ammo / Math.max(1, cmpTactics.ammoMax) : undefined
			});
		}
		// Ordem estável: pela id da campanha, senão pela entidade.
		cards.sort((a, b) => String(a.campaignId ?? a.ent).localeCompare(String(b.campaignId ?? b.ent), undefined, { "numeric": true }));
		return cards;
	};
	GuiInterface.prototype.exposedFunctions.TWGetBattalionCards = 1;

	// Batalha de campo: estado para o painel de placar (gui/session/tw_battle_panel.js).
	GuiInterface.prototype.TWGetBattleStatus = function(player)
	{
		const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
		return cmpTrigger && typeof cmpTrigger.TWGetBattleStatus == "function" ?
			cmpTrigger.TWGetBattleStatus(player) : undefined;
	};
	GuiInterface.prototype.exposedFunctions.TWGetBattleStatus = 1;
}
