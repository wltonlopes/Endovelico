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

/**
 * Prévia do posicionamento (Total War): enquanto o jogador arrasta a linha,
 * marcadores locais no terreno mostram onde cada soldado vai ficar e para
 * onde o batalhão vai olhar. Só lê a simulação (usa o mesmo cálculo da
 * ordem, TWPlanDraggedLine e BattalionLeader.PreviewSlots); os marcadores são
 * entidades locais (não sincronizadas), como a prévia de construção.
 */
{
	const TW_PREVIEW_TEMPLATES = { "slot": "special/tw_slot_marker", "front": "special/tw_front_marker", "zone": "special/tw_zone_marker" };
	const TW_PREVIEW_MAX = 2000;

	/** Põe `positions` ([{ x, z, angle }]) num conjunto de marcadores locais do tipo `kind`. */
	GuiInterface.prototype.TWPlaceMarkers = function(kind, positions)
	{
		if (!this.twMarkers)
			this.twMarkers = {};
		const pool = this.twMarkers[kind] || (this.twMarkers[kind] = []);
		positions = positions.slice(0, TW_PREVIEW_MAX);
		while (pool.length < positions.length)
		{
			const ent = Engine.AddLocalEntity(TW_PREVIEW_TEMPLATES[kind]);
			if (ent == INVALID_ENTITY)
				break;
			pool.push(ent);
		}
		while (pool.length > positions.length)
			Engine.DestroyEntity(pool.pop());
		pool.forEach((ent, i) => {
			const cmpPosition = Engine.QueryInterface(ent, IID_Position);
			if (!cmpPosition)
				return;
			cmpPosition.JumpTo(positions[i].x, positions[i].z);
			cmpPosition.SetYRotation(positions[i].angle || 0);
		});
	};

	/**
	 * data: { "entities", "targetPositions": [{ x, y }] } como na ordem
	 * "walk-custom"; sem data (ou vazio), apaga a prévia.
	 */
	GuiInterface.prototype.TWSetFormationPreview = function(player, data)
	{
		const slots = [];
		const fronts = [];
		if (data && data.entities && data.targetPositions && typeof TWPlanDraggedLine == "function")
		{
			const entities = data.entities.map(ent => Engine.QueryInterface(ent, IID_Ownership)?.GetOwner() == player ? ent : INVALID_ENTITY);
			const plan = TWPlanDraggedLine(entities, data.targetPositions, data.line);
			for (const [ent, spot] of plan)
			{
				const preview = Engine.QueryInterface(ent, IID_BattalionLeader).PreviewSlots(spot.x, spot.z, spot.angle, spot.width);
				for (const slot of preview.slots)
					slots.push({ "x": slot.x, "z": slot.y, "angle": spot.angle });
				// Seta da frente um pouco à frente do líder.
				fronts.push({ "x": spot.x + Math.sin(spot.angle) * 3, "z": spot.z + Math.cos(spot.angle) * 3, "angle": spot.angle });
			}
		}
		this.TWPlaceMarkers("slot", slots);
		this.TWPlaceMarkers("front", fronts);
	};
	GuiInterface.prototype.exposedFunctions.TWSetFormationPreview = 1;

	/** Borda da zona de posicionamento (zone = { x0, x1, z0, z1 }), ou nada para apagar. */
	GuiInterface.prototype.TWSetDeployZonePreview = function(player, zone)
	{
		const marks = [];
		if (zone)
		{
			const step = 10;
			for (let x = zone.x0; x <= zone.x1; x += step)
				marks.push({ "x": x, "z": zone.z0, "angle": 0 }, { "x": x, "z": zone.z1, "angle": 0 });
			for (let z = zone.z0; z <= zone.z1; z += step)
				marks.push({ "x": zone.x0, "z": z, "angle": Math.PI / 2 }, { "x": zone.x1, "z": z, "angle": Math.PI / 2 });
		}
		this.TWPlaceMarkers("zone", marks);
	};
	GuiInterface.prototype.exposedFunctions.TWSetDeployZonePreview = 1;
}
