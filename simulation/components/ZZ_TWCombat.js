/**
 * Combate de batalhões (Total Warfield), por cima dos componentes do jogo:
 *
 * - Dano (Health.TakeDamage): golpes pelo flanco e pela retaguarda, de cima
 *   para baixo, contra tropa cansada, na água, desorganizada ou em fuga
 *   valem mais; flechas incendiárias contra prédios também
 *   (BattalionTactics.GetDefenseMultiplier/GetOffenseMultiplier). Abates
 *   contam para o relatório da batalha.
 * - Munição (Attack.PerformAttack/GetAttackTypes): cada disparo de um
 *   atirador de batalhão gasta munição do batalhão; sem munição, o ataque à
 *   distância some (fica a faca ou o corpo a corpo).
 * - Fogo amigo (DelayedDamage.Hit): projétil de batalhão que erra o alvo
 *   pode acertar qualquer um perto de onde caiu, inclusive amigos.
 * - Barras sobre o líder (StatusBars): soldados do batalhão no lugar da vida
 *   do líder, moral (cinza na fuga), vigor e munição.
 */
{
	const twTakeDamage = Health.prototype.TakeDamage;
	Health.prototype.TakeDamage = function(amount, attacker, attackerOwner)
	{
		const victimLeader = GetBattalionLeaderEntity(this.entity);
		const attackerLeader = attacker !== undefined && attacker != INVALID_ENTITY ? GetBattalionLeaderEntity(attacker) : INVALID_ENTITY;
		if (!amount || victimLeader == INVALID_ENTITY && attackerLeader == INVALID_ENTITY)
			return twTakeDamage.call(this, amount, attacker, attackerOwner);

		const cmpVictimTactics = victimLeader != INVALID_ENTITY && Engine.QueryInterface(victimLeader, IID_BattalionTactics);
		const cmpAttackerTactics = attackerLeader != INVALID_ENTITY && Engine.QueryInterface(attackerLeader, IID_BattalionTactics);
		let multiplier = 1;
		if (cmpVictimTactics)
			multiplier *= cmpVictimTactics.GetDefenseMultiplier(attacker, this.entity);
		if (cmpAttackerTactics)
			multiplier *= cmpAttackerTactics.GetOffenseMultiplier(this.entity);
		const cmpAny = cmpVictimTactics || cmpAttackerTactics;
		if (cmpAny)
			multiplier *= cmpAny.GetHeightMultiplier(attacker, this.entity);

		const before = this.hitpoints;
		const result = twTakeDamage.call(this, amount * multiplier, attacker, attackerOwner);
		if (before > 0 && !this.hitpoints && cmpAttackerTactics)
			cmpAttackerTactics.AddKill();
		return result;
	};
}

{
	const tacticsOf = ent => {
		const leader = GetBattalionLeaderEntity(ent);
		return leader != INVALID_ENTITY ? Engine.QueryInterface(leader, IID_BattalionTactics) : null;
	};

	const twGetAttackTypes = Attack.prototype.GetAttackTypes;
	Attack.prototype.GetAttackTypes = function(wantedTypes)
	{
		const types = twGetAttackTypes.call(this, wantedTypes);
		if (types.indexOf("Ranged") == -1)
			return types;
		const cmpTactics = tacticsOf(this.entity);
		return cmpTactics && !cmpTactics.HasAmmo() ? types.filter(type => type != "Ranged") : types;
	};

	const twPerformAttack = Attack.prototype.PerformAttack;
	Attack.prototype.PerformAttack = function(type, target)
	{
		if (type == "Ranged")
		{
			const cmpTactics = tacticsOf(this.entity);
			if (cmpTactics && !cmpTactics.UseAmmo())
				return;
		}
		return twPerformAttack.call(this, type, target);
	};
}

{
	const twHit = DelayedDamage.prototype.Hit;
	DelayedDamage.prototype.Hit = function(data, lateness)
	{
		if (data && data.projectileId && data.attacker !== undefined && GetBattalionLeaderEntity(data.attacker) != INVALID_ENTITY)
			data.friendlyFire = true;
		return twHit.call(this, data, lateness);
	};
}

{
	const sprites = StatusBars.prototype.Sprites.slice();
	const health = sprites.indexOf("HealthBar");
	sprites.splice(health + 1, 0, "TWAmmoBar", "TWVigorBar", "TWMoraleBar");
	StatusBars.prototype.Sprites = sprites;

	const twAddHealthBar = StatusBars.prototype.AddHealthBar;
	StatusBars.prototype.AddHealthBar = function(cmpOverlayRenderer, yoffset)
	{
		const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
		if (!this.enabled || !cmpLeader)
			return twAddHealthBar.call(this, cmpOverlayRenderer, yoffset);
		return this.AddBar(cmpOverlayRenderer, yoffset, "health", Math.max(0, Math.min(1, cmpLeader.GetStrength() / Math.max(1, cmpLeader.GetMaxStrength()))));
	};

	StatusBars.prototype.AddTWMoraleBar = function(cmpOverlayRenderer, yoffset)
	{
		const cmpTactics = this.enabled && Engine.QueryInterface(this.entity, IID_BattalionTactics);
		if (!cmpTactics)
			return 0;
		return this.AddBar(cmpOverlayRenderer, yoffset, cmpTactics.IsRouting() ? "tw_rout" : "tw_morale",
			Math.max(0, Math.min(1, cmpTactics.morale / 100)), 0.8);
	};

	StatusBars.prototype.AddTWVigorBar = function(cmpOverlayRenderer, yoffset)
	{
		const cmpTactics = this.enabled && Engine.QueryInterface(this.entity, IID_BattalionTactics);
		if (!cmpTactics)
			return 0;
		return this.AddBar(cmpOverlayRenderer, yoffset, "tw_vigor", Math.max(0, Math.min(1, cmpTactics.vigor / 100)), 0.6);
	};

	StatusBars.prototype.AddTWAmmoBar = function(cmpOverlayRenderer, yoffset)
	{
		const cmpTactics = this.enabled && Engine.QueryInterface(this.entity, IID_BattalionTactics);
		if (!cmpTactics || !cmpTactics.UsesAmmo())
			return 0;
		return this.AddBar(cmpOverlayRenderer, yoffset, "tw_ammo", Math.max(0, Math.min(1, cmpTactics.ammo / Math.max(1, cmpTactics.ammoMax))), 0.6);
	};
}
