// Furtividade (Total Warfield, BattalionTactics.UpdateStealth): soldados de
// tropa leve (classe TWStealth) usam visibilidade por script desde que
// nascem (ligar e desligar depois não é respeitado pelo motor). Ocultos,
// ficam invisíveis para os inimigos listados e não podem ser alvo deles.
{
	// Mesmos valores de VIS_* em Visibility.js (constantes daquele script).
	const TW_VIS_HIDDEN = 0;
	const TW_VIS_VISIBLE = 2;

	const twVisibilityInit = Visibility.prototype.Init;
	Visibility.prototype.Init = function()
	{
		twVisibilityInit.call(this);
		this.twStealth = false;
	};

	/** Liga a visibilidade por script (uma vez, ao nascer). */
	Visibility.prototype.EnableTWStealth = function()
	{
		if (this.twStealth)
			return;
		this.twStealth = true;
		this.SetActivated(true);
	};

	Visibility.prototype.SetTWHiddenFrom = function(players)
	{
		this.EnableTWStealth();
		const before = (this.twHiddenFrom || []).join(",");
		this.twHiddenFrom = players.length ? players.slice() : undefined;
		if (before != (this.twHiddenFrom || []).join(",") || this.twHiddenFrom)
			Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).RequestVisibilityUpdate(this.entity);
	};

	Visibility.prototype.IsTWHiddenFrom = function(player)
	{
		return !!this.twHiddenFrom && this.twHiddenFrom.indexOf(player) != -1;
	};

	const twGetVisibility = Visibility.prototype.GetVisibility;
	Visibility.prototype.GetVisibility = function(player, isVisible, isExplored)
	{
		if (this.twStealth && !this.preview && !this.corpse)
		{
			if (this.IsTWHiddenFrom(player))
				return TW_VIS_HIDDEN;
			// Regra normal de unidade (a original devolveria sempre "visível").
			return isVisible ? TW_VIS_VISIBLE : TW_VIS_HIDDEN;
		}
		return twGetVisibility.call(this, player, isVisible, isExplored);
	};

	// Quem não vê a unidade não consegue mirá-la.
	const twCanAttack = Attack.prototype.CanAttack;
	Attack.prototype.CanAttack = function(target, wantedTypes)
	{
		const cmpVisibility = Engine.QueryInterface(target, IID_Visibility);
		if (cmpVisibility && cmpVisibility.twHiddenFrom)
		{
			const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
			if (owner !== undefined && cmpVisibility.IsTWHiddenFrom(owner))
				return false;
		}
		return twCanAttack.call(this, target, wantedTypes);
	};
}
