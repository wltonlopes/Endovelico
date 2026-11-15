var TW_TEST_CHOICE = "";
/**
 * Trigger de teste (tools/test/battletest.sh): registra no log a situação
 * da batalha a cada 15 s de jogo e o resultado final.
 */
Trigger.prototype.TWTestCensus = function()
{
	const time = Math.round(Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() / 1000);
	const status = this.TWGetBattleStatus && this.TWGetBattleStatus();
	const parts = [];
	this.twTestSlaughterOrders = this.twTestSlaughterOrders || 0;
	if (!this.twTestTownLogged && this.twSettlementEntities)
	{
		this.twTestTownLogged = true;
		const tm = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
		const counts = {};
		for (const e of this.twSettlementEntities)
		{
			const n = tm.GetCurrentTemplateName(e).split("/").pop();
			counts[n] = (counts[n] || 0) + 1;
		}
		warn("[twtest] cidade construída: " + uneval(counts));
	}
	for (const playerID in status?.sides || {})
	{
		const side = status.sides[playerID];
		const morale = this.TWLeadersOf(+playerID).map(ent => Engine.QueryInterface(ent, IID_BattalionTactics)?.GetStatus().morale);
		const centre = this.TWCenterOf(this.TWLeadersOf(+playerID));
		let daggers = 0;
		for (const ent of Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).GetEntitiesByPlayer(+playerID))
		{
			const cmpAttack = Engine.QueryInterface(ent, IID_Attack);
			if (cmpAttack && cmpAttack.IsDaggerMode && cmpAttack.IsDaggerMode())
			{
				++daggers;
				const ai = Engine.QueryInterface(ent, IID_UnitAI);
				if (ai.order && ai.order.data && ai.order.data.attackType == "Slaughter")
					++this.twTestSlaughterOrders;
			}
		}
		const orders = this.TWLeadersOf(+playerID).map(ent => {
			const ai = Engine.QueryInterface(ent, IID_UnitAI);
			const cat = Engine.QueryInterface(ent, IID_BattalionLeader).GetCategory().replace(/_.*/, "").slice(0, 3);
			const target = ai.order && ai.order.data && ai.order.data.target;
			const pos = this.TWPosition(ent);
			return cat + ":" + (ai.order ? ai.order.type : "idle") + (target ? ">" + target + "(" + Engine.QueryInterface(target, IID_Ownership)?.GetOwner() + ")" : "") +
				"@" + Math.round(pos.x) + "," + Math.round(pos.y) + "/" + ai.GetCurrentState().replace("INDIVIDUAL.", "");
		});
		parts.push("P" + playerID + " " + QueryPlayerIDInterface(+playerID).GetState() + (this.TWGeneralAlive(+playerID) ? " G" : " -") + " soldados " + side.alive + "/" + side.initial +
			" bat " + side.battalions + " fuga " + side.routing + " escaparam " + side.escaped + " ocultos " + this.TWLeadersOf(+playerID).filter(e => Engine.QueryInterface(e, IID_BattalionTactics)?.IsHidden()).length +
			" form [" + this.TWLeadersOf(+playerID).map(e => Engine.QueryInterface(e, IID_BattalionTactics).posture).join(",") + "]" +
			" acomp " + this.TWLeadersOf(+playerID).reduce((n, e) => n + Engine.QueryInterface(e, IID_BattalionLeader).GetAttachmentKinds().length, 0) + " facas " + daggers + "/" + (this.twTestSlaughterOrders || 0) + (status.flight == playerID ? " [FUGINDO]" : "") + " moral [" + morale.join(",") + "]" +
			(centre ? " pos " + Math.round(centre.x) + "," + Math.round(centre.y) : "") + (time > 600 ? " {" + orders.join(" ") + "}" : ""));
	}
	const walls = Object.keys(this.twWalls || {}).map(p => "muralha P" + p + " " + this.TWWallPieces(+p).length + "/" + this.twWalls[p].initial +
		(this.twBreached[p] ? " ROMPIDA" : "")).join(" ");
	const town = this.twSettlementEntities ? " cidade " + this.twSettlementEntities.filter(e => Engine.QueryInterface(e, IID_Position)?.IsInWorld()).length +
		(this.twSettlementCentre ? " CC P" + Engine.QueryInterface(this.twSettlementCentre.ent, IID_Ownership)?.GetOwner() : "") : "";
	const siege = town + " " + [1, 2].map(p => "cerco P" + p + " " + (this.TWSiegeOf ? this.TWSiegeOf(p).length : 0)).join(" ");
	warn("[twtest] t=" + time + " " + walls + " " + siege + " | " + parts.join(" | "));
	if (this.twFinished && !this.twTestReported)
	{
		this.twTestReported = true;
		warn("[twtest] resultado " + uneval(Trigger.prototype.OnCampaignGameEnd()));
	}
};

{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.DoRepeatedly(15000, "TWTestCensus", {});
}



{
	const twDefeat = Trigger.prototype.TWDefeat;
	Trigger.prototype.TWDefeat = function(playerID, reason)
	{
		twDefeat.call(this, playerID, reason);
		warn("[twtest] t=" + Math.round(Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() / 1000) + " derrota P" + playerID + " resultado " + uneval(Trigger.prototype.OnCampaignGameEnd()));
	};
}

// Contadores de carga (só no teste).
Trigger.prototype.TWTestHookCharges = function()
{
	const ent = [1, 2].map(p => this.TWLeadersOf(p)[0]).find(Boolean);
	const cmp = ent && Engine.QueryInterface(ent, IID_BattalionTactics);
	if (!cmp)
		return;
	const proto = Object.getPrototypeOf(cmp);
	const stats = this.twTestCharges = { "charges": 0, "impacts": 0, "braced": 0 };
	const start = proto.StartCharge;
	proto.StartCharge = function(target) { ++stats.charges; return start.call(this, target); };
	const impact = proto.ChargeImpact;
	proto.ChargeImpact = function(braced) { if (this.charge && !this.charge.impact) { ++stats.impacts; if (braced) ++stats.braced; } return impact.call(this, braced); };
};
{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.DoAfterDelay(1000, "TWTestHookCharges", {});
	const census = Trigger.prototype.TWTestCensus;
	Trigger.prototype.TWTestCensus = function()
	{
		census.call(this);
		if (this.twTestCharges)
			warn("[twtest] cargas " + uneval(this.twTestCharges));
	};
}

Trigger.prototype.TWTestTown = function()
{
	if (!this.twSettlementEntities)
		return;
	const tm = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	const counts = {};
	for (const e of this.twSettlementEntities)
	{
		const n = tm.GetCurrentTemplateName(e).split("/").pop();
		counts[n] = (counts[n] || 0) + 1;
	}
	warn("[twtest] cidade construida: " + uneval(counts));
};
Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger).DoAfterDelay(500, "TWTestTown", {});

// TW_CHOICE: simula a escolha do vencedor humano ao começar a fuga.
{
	const twStartFlight = Trigger.prototype.TWStartFlight;
	Trigger.prototype.TWStartFlight = function(playerID)
	{
		twStartFlight.call(this, playerID);
		if (TW_TEST_CHOICE == "human")
		{
			// Teste com interface: o vencedor vira humano e a sessão pergunta.
			const winner = playerID == 1 ? 2 : 1;
			this.twFlight.awaiting = winner;
			if (this.twAI)
				this.twAI = this.twAI.filter(p => p != winner);
			warn("[twtest] fuga de P" + playerID + ", aguardando a escolha na interface de P" + winner);
		}
		else if (TW_TEST_CHOICE)
		{
			this.twFlight.awaiting = playerID == 1 ? 2 : 1;
			warn("[twtest] fuga de P" + playerID + ", escolha simulada: " + TW_TEST_CHOICE);
			this.DoAfterDelay(3000, "TWTestChoice", {});
		}
	};
	// "end:sack" = destino da província (como a caixa da sessão: comando
	// "none" com a escolha) e depois encerrar/perseguir.
	Trigger.prototype.TWTestChoice = function()
	{
		if (!this.twFlight)
			return;
		const [choice, conquest] = TW_TEST_CHOICE.split(":");
		if (conquest)
		{
			if (!this.twSettings.conquest)
				this.twSettings.conquest = { "province": "Test", "vassal": "client", "vassalName": "Principality of Test" };
			this.TWBattleChoice(this.twFlight.awaiting, "none", conquest);
			warn("[twtest] destino escolhido: " + this.TWGetBattleStatus().conquestChoice + ", fuga ainda aguardando: " + this.twFlight.awaiting);
		}
		// Pelo mesmo caminho do jogo: o comando que a sessão manda.
		const player = this.twFlight.awaiting;
		// O vencedor faz papel de humano: os comandos dele não passam pelo filtro da IA.
		if (this.twAI)
			this.twAI = this.twAI.filter(p => p != player);
		ProcessCommand(player, { "type": "tw-battle-choice", "choice": choice });
		warn("[twtest] comando tw-battle-choice enviado por P" + player + "; fim=" + this.twFinished + " aguardando=" + (this.twFlight && this.twFlight.awaiting));
	};
}

// TW_STEALTH_TEST: põe o 1º batalhão leve do jogador 1 num bosque, parado,
// e confere se o jogador 2 o enxerga.
var TW_STEALTH_TEST = false;
Trigger.prototype.TWTestStealthPlace = function()
{
	const leader = this.TWLeadersOf(1).find(e => Engine.QueryInterface(e, IID_Identity).HasClass("TWStealth"));
	if (!leader)
		return warn("[twtest] furtividade: sem batalhão leve");
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	let spot;
	for (let x = 60; x < mapSize - 60 && !spot; x += 12)
		for (let z = mapSize * 0.3; z < mapSize * 0.5 && !spot; z += 12)
		{
			const pos = new Vector2D(x, z);
			const trees = cmpRangeManager.ExecuteQueryAroundPos(pos, 0, 14, [0], IID_ResourceSupply, false)
				.filter(e => Engine.QueryInterface(e, IID_ResourceSupply).GetType().generic == "wood").length;
			if (trees >= 5)
				spot = pos;
		}
	if (!spot)
		return warn("[twtest] furtividade: sem bosque no mapa");
	const cmpLeader = Engine.QueryInterface(leader, IID_BattalionLeader);
	cmpLeader.GetBattalionEntities().forEach((e, i) => {
		Engine.QueryInterface(e, IID_Position).JumpTo(spot.x + (i % 5) * 2, spot.y + Math.floor(i / 5) * 2);
		Engine.QueryInterface(e, IID_UnitAI).Stop(false);
	});
	this.twStealthLeader = leader;
	this.twStealthSpot = spot;
	warn("[twtest] furtividade: batalhão em " + Math.round(spot.x) + "," + Math.round(spot.y));
};
Trigger.prototype.TWTestStealthCheck = function(data)
{
	const leader = this.twStealthLeader;
	if (!leader)
		return;
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const member = Engine.QueryInterface(leader, IID_BattalionLeader).members[0];
	// Inimigo dentro da visão (62 m), mas além da distância de revelar.
	// (Sem janela, o jogo revela o mapa: desliga, senão nada fica oculto.)
	cmpRangeManager.SetLosRevealWholeMap(2, false);
	if (data.n == 1)
	{
		const enemy = this.TWLeadersOf(2)[0];
		for (const e of Engine.QueryInterface(enemy, IID_BattalionLeader).GetBattalionEntities())
		{
			Engine.QueryInterface(e, IID_Position).JumpTo(this.twStealthSpot.x + 62, this.twStealthSpot.y);
			Engine.QueryInterface(e, IID_UnitAI).SwitchToStance("passive");
		}
	}
	if (data.n == 0)
	{
		warn("[twtest] furtividade antes do inimigo chegar: oculto=" + Engine.QueryInterface(leader, IID_BattalionTactics).IsHidden());
		return this.DoAfterDelay(1000, "TWTestStealthCheck", { "n": 1 });
	}
	warn("[twtest] furtividade t+" + data.n + ": oculto=" + Engine.QueryInterface(leader, IID_BattalionTactics).IsHidden() +
		" visto por P2: líder=" + cmpRangeManager.GetLosVisibility(leader, 2) + " soldado=" + cmpRangeManager.GetLosVisibility(member, 2) +
		" visto por P1: " + cmpRangeManager.GetLosVisibility(leader, 1) + " revelaTudo(P2)=" + (cmpRangeManager.GetLosRevealWholeMap ? cmpRangeManager.GetLosRevealWholeMap(2) : "?") + " explorar=" + uneval(InitAttributes.settings.RevealMap) + "/" + uneval(InitAttributes.settings.ExploreMap) +
		" | vis: hiddenFrom=" + uneval(Engine.QueryInterface(member, IID_Visibility).twHiddenFrom) + " ativo=" + Engine.QueryInterface(member, IID_Visibility).activated +
		" script(2)=" + Engine.QueryInterface(member, IID_Visibility).GetVisibility(2, true, true) + " temMetodo=" + typeof Engine.QueryInterface(member, IID_Visibility).SetTWHiddenFrom);
	if (data.n == 2)
	{
		// Inimigo chega perto (15 m): deve revelar.
		const enemy = this.TWLeadersOf(2)[0];
		for (const e of Engine.QueryInterface(enemy, IID_BattalionLeader).GetBattalionEntities())
			Engine.QueryInterface(e, IID_Position).JumpTo(this.twStealthSpot.x + 15, this.twStealthSpot.y + 15);
	}
	if (data.n < 3)
		this.DoAfterDelay(4000, "TWTestStealthCheck", { "n": data.n + 1 });
};
if (TW_STEALTH_TEST)
{
	Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger).DoAfterDelay(2000, "TWTestStealthPlace", {});
	Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger).DoAfterDelay(8000, "TWTestStealthCheck", { "n": 0 });
}

// TW_CRUSH_TEST: aos 40 s mata 80% dos soldados do jogador 2 (regra do
// exército esmagado: ele deve debandar logo em seguida).
var TW_CRUSH_TEST = false;
Trigger.prototype.TWTestCrush = function()
{
	let killed = 0;
	for (const leader of this.TWLeadersOf(2))
	{
		const cmpLeader = Engine.QueryInterface(leader, IID_BattalionLeader);
		const members = cmpLeader.GetBattalionEntities().filter(e => e != leader);
		for (const ent of members.slice(0, Math.ceil(members.length * 0.85)))
		{
			Engine.QueryInterface(ent, IID_Health)?.Kill();
			++killed;
		}
	}
	warn("[twtest] esmagamento: " + killed + " soldados de P2 mortos; status " + uneval(this.TWGetBattleStatus().sides));
};
if (TW_CRUSH_TEST)
	Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger).DoAfterDelay(40000, "TWTestCrush", {});
