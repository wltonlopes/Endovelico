/**
 * Modo punhal (Total Warfield): um atirador de infantaria de batalhão
 * (classe TWDagger, mixin tw_dagger) com um inimigo colado só usa a faca
 * (ataque Slaughter, com animação de faca). BattalionLeader.UpdateDaggers
 * liga e desliga o modo (cmpAttack.twDagger) conforme a distância do
 * inimigo mais próximo.
 */
{
	const twGetAttackTypes = Attack.prototype.GetAttackTypes;
	Attack.prototype.GetAttackTypes = function(wantedTypes)
	{
		if (!this.twDagger || !this.template.Slaughter)
			return twGetAttackTypes.call(this, wantedTypes);
		if (!wantedTypes)
			return ["Slaughter"];
		if (wantedTypes.indexOf("!Slaughter") != -1)
			return [];
		const real = wantedTypes.filter(type => type.indexOf("!") != 0);
		return !real.length || real.some(type => ["Slaughter", "Melee", "Ranged"].indexOf(type) != -1) ? ["Slaughter"] : [];
	};

	const twGetBestAttackAgainst = Attack.prototype.GetBestAttackAgainst;
	Attack.prototype.GetBestAttackAgainst = function(target, allowCapture)
	{
		if (this.twDagger && this.template.Slaughter)
			return this.CanAttack(target, ["Slaughter"]) ? "Slaughter" : undefined;
		return twGetBestAttackAgainst.call(this, target, allowCapture);
	};

	Attack.prototype.SetDaggerMode = function(enabled)
	{
		if (!this.template.Slaughter || !!this.twDagger == !!enabled)
			return false;
		this.twDagger = !!enabled;
		return true;
	};

	Attack.prototype.IsDaggerMode = function()
	{
		return !!this.twDagger;
	};
}
