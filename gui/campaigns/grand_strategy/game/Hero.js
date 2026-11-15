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
		// Batalhões do exército (game/Warfield.js).
		this.battalions = [];
			// NOVO
		this.portrait = "";
		this.traits = [];
		this.bonuses = {};
		this.title = "General";
		// Marcha de vários turnos (game/Routes.js): províncias que faltam.
		this.route = [];
	}

	/**
	 * A localização registra cada passo (g_TWMapMoves), para o mapa animar
	 * a marcha mesmo quando o general anda várias províncias de uma vez.
	 */
	get location()
	{
		return this._location;
	}

	set location(code)
	{
		if (this._location !== undefined && code !== this._location && typeof twNoteMove == "function")
			twNoteMove(this, this._location, code);
		this._location = code;
	}

	Serialize()
	{
		return {
			"id": this.id,
			"tribe": this.tribe,
			"loc": this.location,
			"moves": this.actionsLeft,
			"lastRetreatTurn":this.lastRetreatTurn,
			"battalions": this.battalions,
			"battleTemplate": this.battleTemplate,
			"lastTurnLocation": this.lastTurnLocation,
			"drilling": this.drilling,


			// NOVO
			"portrait": this.portrait,
			"traits": this.traits,
			"bonuses": this.bonuses,
			"title": this.title,
			"route": this.route

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
		this.battalions = data.battalions || [];
		this.battleTemplate = data.battleTemplate;
		this.lastTurnLocation = data.lastTurnLocation;
		this.drilling = data.drilling || 0;

			// NOVO
		this.portrait =
			data.portrait || "";

		this.traits =
			data.traits || [];

		this.bonuses =
			data.bonuses || {};

		this.title =
			data.title || "General";

		this.route = data.route || [];
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
		// Terra alheia: só em guerra (para lutar) ou com passagem (acesso militar, aliança, vassalagem).
		if (!twCanEnterTerritory(this.tribe, target.ownerTribe))
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

						return false;
					}
				}
			}

			// General inimigo na província: batalha (o general só entra se vencer).
			// Só luta contra general em guerra; os demais apenas dividem a província.
			const enemy = g_GameData.getHostileGeneralAtProvince(targetProvince, this.tribe);
			if (enemy)
			{
				this.actionsLeft -= this.getMoveCost(targetProvince);
				g_GameData.startGeneralBattle(this, targetProvince);
				return true;
			}

			this.actionsLeft -= this.getMoveCost(targetProvince);
			this.location = targetProvince;

			return true;
		}

	/**
	 * Atacar a província onde o general está ou uma vizinha: precisa de
	 * tropas, de um movimento e de guerra com o dono (sem dono = nativos).
	 */
	canAttack(code)
	{
		const province = g_GameData.provinces[code];
		if (!province || province.isSea() || this.ownsProvince(code) || this.actionsLeft < 1 || !this.battalions.length)
			return false;
		if (code != this.location && !province.canTravel(this.location))
			return false;
		if (!province.ownerTribe)
			return true;
		const diplomacy = g_GameData.tribes[this.tribe].getDiplomacy(province.ownerTribe);
		return diplomacy.status === GSDiplomacy.prototype.WAR;
	}

	/** Monta a batalha (TWBattle); quem chama decide como resolvê-la. */
	doAttack(code)
	{
		if (!this.canAttack(code))
			return undefined;
		this.actionsLeft -= 1;
		return TWBattle.create(this, code);
	}

	getArmySummary()
	{
		return this.battalions.length + " battalions, " + twArmySoldiers(this.battalions) + " soldiers";
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
