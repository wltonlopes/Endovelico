// Experiência de soldados e líderes de batalhão vai para o batalhão
// (BattalionLeader.AddExperience); ninguém é promovido sozinho, senão o
// soldado trocaria de template e sairia do batalhão. Soldado ainda sem
// líder (acabou de nascer) só ignora.
{
	const twPromotionIncreaseXp = Promotion.prototype.IncreaseXp;
	Promotion.prototype.IncreaseXp = function(amount)
	{
		if (Engine.QueryInterface(this.entity, IID_BattalionLeader) || Engine.QueryInterface(this.entity, IID_BattalionMember))
		{
			const leader = GetBattalionLeaderEntity(this.entity);
			if (leader != INVALID_ENTITY && amount)
				Engine.QueryInterface(leader, IID_BattalionLeader).AddExperience(amount);
			return;
		}
		return twPromotionIncreaseXp.call(this, amount);
	};
}
