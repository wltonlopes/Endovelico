/**
 *
 */
class Hero
{
	constructor(tribe, province)
	{
		this.id = Date.now() + Math.random();

		this.tribe = tribe;
		this.location = province;
		this.actionsLeft = 1;
		this.lastRetreatTurn = -999;
		this.army = {
			spearmen: 0,
			swordsmen: 0,
			archers: 0,
			cavalry: 0
		};
			// NOVO
		this.portrait = "";
		this.traits = [];
		this.bonuses = {};
		this.title = "General";
	}

	Serialize()
	{
		return {
			"id": this.id,
			"tribe": this.tribe,
			"loc": this.location,
			"moves": this.actionsLeft,
			"lastRetreatTurn":this.lastRetreatTurn,
			"army": this.army,


			// NOVO
			"portrait": this.portrait,
			"traits": this.traits,
			"bonuses": this.bonuses,
			"title": this.title

		};
	}

	Deserialize(data)
	{
		this.id = data.id;
		this.tribe = data.tribe;
		this.location = data.loc;
		this.actionsLeft = data.moves;
		
		this.lastRetreatTurn =
			data.lastRetreatTurn ??
			-999;
		this.army = data.army || {
			spearmen: 0,
			swordsmen: 0,
			archers: 0,
			cavalry: 0
		};

			// NOVO
		this.portrait =
			data.portrait || "";

		this.traits =
			data.traits || [];

		this.bonuses =
			data.bonuses || {};

		this.title =
			data.title || "General";
	}
	ownsProvince(code)
	{
		return g_GameData.provinces[code].ownerTribe === this.tribe;
	}


	/** Movimentos gastos para entrar em `code` (mar pode custar menos). */
	getMoveCost(code)
	{
		const target = g_GameData.provinces[code];
		if (target?.isSea())
			return g_GameData.tribes[this.tribe].techs.getSeaMoveCost();
		return 1;
	}

	canMove(code)
	{
		const target = g_GameData.provinces[code];
		if (!target.canTravel(this.location))
			return false;
		// Navegação: mar costeiro, oceano e desembarque dependem de tecnologia.
		if (!g_GameData.tribes[this.tribe].techs.canNavigate(this.location, code))
			return false;
		if (target.ownerTribe && !this.ownsProvince(code) &&
			g_GameData.tribes[this.tribe].getDiplomacy(target.ownerTribe).status !== GSDiplomacy.prototype.WAR)
			return false;
		return this.actionsLeft >= this.getMoveCost(code);
	}

	doMove(targetProvince)
		{
			if (!this.canMove(targetProvince))
				return false;

			// Impedir dois generais aliados
			for (const tribeCode in g_GameData.tribes)
			{
				const tribe =
					g_GameData.tribes[tribeCode];

				for (const hero of tribe.generals)
				{
					if (hero === this)
						continue;

					if (
						hero.location == targetProvince &&
						hero.tribe == this.tribe
					)
					{
						warn(
							"There is already an allied general in this province."
						);

						return false;
					}
				}
			}

			// Procurar general inimigo
			let enemy =
				g_GameData.getGeneralAtProvince(
					targetProvince,
					this.tribe
				);

			if (enemy)
			{
				this.actionsLeft -= this.getMoveCost(targetProvince);

				this.location =
					targetProvince;

				g_GameData.startGeneralBattle(
					this,
					enemy
				);

				return true;
			}

			this.actionsLeft -= this.getMoveCost(targetProvince);
			this.location = targetProvince;

			return true;
		}

	
	// canAttack(code)
	// {
	// 	return !this.ownsProvince(code) && this.actionsLeft >= 1;
	// }

	canAttack(code)
	{
		const province = g_GameData.provinces[code];

		if (province.isSea())
			return false;

		return !this.ownsProvince(code) &&
			this.actionsLeft >= 1;
	}

	doAttack(code)
	{
		const province = g_GameData.provinces[code];

		if (province.isSea())
			return false;

		this.actionsLeft--;

		return g_GameData.playOutAttack(
			this.tribe,
			code
		);
	}

	canStrengthen(code)
	{
		return this.ownsProvince(code) && this.actionsLeft >= 0.5 &&
			g_GameData.provinces[code].garrison < g_GameData.tribes[this.tribe].techs.getGarrisonCap();
	}

	doStrengthen(code)
	{
		this.actionsLeft -= 0.5;
		return g_GameData.changeGarrison(code, 1);
	}

	canWeaken(code)
	{
		return this.ownsProvince(code) && this.actionsLeft >= 0.5 && g_GameData.provinces[code].garrison > 0;
	}

	doWeaken(code)
	{
		this.actionsLeft -= 0.5;
		return g_GameData.changeGarrison(code, -1);
	}

}
