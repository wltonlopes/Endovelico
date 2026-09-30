/**
 *
 */
class Tribe
{
	constructor(data, isCustomTribe)
	{
		this.code = data.code;
		this.data = data;

		this.generals = [];
        this.maxGenerals = 2;

		this.color = data.color || "255 0 0";

		// Custom tribes don't have associated JSON data, so we need to serialize more.
		if (isCustomTribe)
			this.customTribeData = data;

		this.controlledProvinces = [];
		this.civ = data.civ;

		this.money = 0;
		this.lastBalance = 0;

		this.diplo = {};

		this.statistics =
		{
			economy: 0,
			army: 0,
			navy: 0,
			population: 0,
			manpower: 0,
			prestige: 0,
			happiness: 70
		};
	}

	Serialize()
	{
		const ret = {
			"money": this.money,
			"lastBalance": this.lastBalance || 0,
			"civ": this.civ,
			"statistics": this.statistics,
			"generals": this.generals.map(g => g.Serialize()),
			"maxGenerals": this.maxGenerals,

			"diplo": Object.keys(this.diplo)
				.map(x => [x, this.diplo[x].serialize()]),
		};

		if (this.customTribeData)
			ret.customTribeData = this.customTribeData;

		return ret;
	}

	Deserialize(data)
	{
		this.money = data.money;
		this.lastBalance = data.lastBalance;
		this.civ = data.civ;

		this.statistics = data.statistics || {
			economy: 0,
			army: 0,
			navy: 0,
			population: 0,
			manpower: 0,
			prestige: 0,
			happiness: 70
		};
		this.generals = [];
		this.maxGenerals = data.maxGenerals || 1;

		if (data.generals)
		{
			for (let generalData of data.generals)
			{
				let hero = new Hero();
				hero.Deserialize(generalData);
				this.generals.push(hero);
			}
		}

		// TODO: do this better.
		for (const prov in g_GameData.provinces)
			if (g_GameData.provinces[prov].ownerTribe === this.code)
				this.controlledProvinces.push(prov);

		for (const [key, diplo] of data.diplo)
			this.diplo[key] =
				new GSDiplomacy(this.code, key).deserialize(diplo);
	}

	getName()
	{
		return this.data.name;
	}

	GainControl(code)
	{
		if (this.controlledProvinces.indexOf(code) === -1)
			this.controlledProvinces.push(code);
	}

	LoseControl(code)
	{
		let idx = this.controlledProvinces.indexOf(code);
		if (idx !== -1)
			this.controlledProvinces.splice(idx, 1);
	}

	/**
	 * Whether the tribe can attack the target.
	 * Always true if target is undefined (barbarians).
	 */
	canAttack(target)
	{
		if (!target)
			return true;
		return this.getDiplomacy(target).canAttack();
	}

	getDiplomacy(target)
	{
		if (target === this.code)
		{
			warn("Cannot get diplomacy with ourselves");
			return undefined;
		}
		// Diplomacy is lazily constructed for efficiency - things start out neutral.
		if (!this.diplo[target])
			this.diplo[target] = new GSDiplomacy(this.code, target);
		return this.diplo[target];
	}

	getCulture()
	{
		return this.data.culture || "Unknown";
	}

	getGovernment()
	{
		return this.data.government || "Tribe";
	}

	getLeader()
	{
		if (!this.generals.length)
			return undefined;

		return this.generals[0];
	}

	getEmblem()
	{
		return this.civ;
	}

	getEconomy()
	{
		return this.lastBalance;
	}

	getArmyStrength()
	{
		return this.generals.length;
	}

	getPopulation()
	{
		return this.controlledProvinces.length;
	}

	getCapital()
	{
		if (this.capital)
			return this.capital;

		if (this.controlledProvinces.length)
			return this.controlledProvinces[0];

		return undefined;
	}

	// getDiplomacyInfo()
	// {
	// 	return {
	// 		name: this.getName(),
	// 		culture: this.getCulture(),
	// 		government: this.getGovernment(),
	// 		capital: this.getCapital(),
	// 		emblem: this.getEmblem(),
	// 		leader: this.getLeader(),
	// 		economy: this.getEconomy(),
	// 		army: this.getArmyStrength(),
	// 		provinces: this.controlledProvinces.length,
	// 		population: this.getPopulation(),
	// 		money: this.money
	// 	};
	// }
	getDiplomacyInfo()
	{
		return {
			name: this.getName(),
			civ: this.civ,
			capital: this.getCapital(),

			money: this.money,

			generals: this.generals.length,
			provinces: this.controlledProvinces.length,

			statistics: this.statistics
		};
	}
	updateStatistics()
	{
		this.statistics.population = this.controlledProvinces.length;
		this.statistics.army = this.generals.length;
		this.statistics.economy = this.lastBalance;
		this.statistics.happiness = this.calculateAverageHappiness();
	}

	calculateAverageHappiness()
	{
		if (!this.controlledProvinces.length)
			return 0;

		let total = 0;

		for (let province of this.controlledProvinces)
			total += g_GameData.provinces[province].happiness;

		return Math.round(total / this.controlledProvinces.length);
	}

}