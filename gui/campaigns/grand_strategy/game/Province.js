// class Province
// {
// 	constructor(data)
// 	{
// 		this.code = data.code;
// 		this.data = data;
class Province
{
	constructor(data)
	{
		if (data.properties)
		{
			// GeoJSON Feature
			this.code = data.properties.code;
			this.data = data.properties;
		}
		else
		{
			// JSON antigo
			this.code = data.code;
			this.data = data;
		}

		this.gfxdata = {"size": [0,0,4096,2048]};
		// let path =
		// 	"campaigns/grand_strategy/gfxdata/" +
		// 	this.code +
		// 	".json";

		// this.gfxdata =
		// 	Engine.ReadJSONFile(path);

		// if (!this.gfxdata)
		// {
		// 	this.gfxdata =
		// 	{
		// 		"size":
		// 		[
		// 			0,
		// 			0,
		// 			100,
		// 			100
		// 		]
		// 	};

		// 	warn(
		// 		"No gfxdata for " +
		// 		this.code
		// 	);
		// }
		this.gfxdata = {
			"size": [0, 0, 4096, 2048]
		};

		this.icon = undefined;
		this.ownerTribe = undefined;
		this.name = this.data.name;
		this.garrison = 0;
		this.happiness = 50; // 0-100, affects tax revenue
		this.inRevolt = false; // Flag to track if province is in revolt
		this.buildings = [];
		this.buildQueue = [];
		this.buildProgress = 0;
		this.buildingOwner = undefined;
		// População (Total Warfield): cresce a cada turno, define o nível do
		// assentamento e é gasta ao recrutar batalhões.
		this.population = this.getStartingPopulation();
	}

	getStartingPopulation()
	{
		if (this.data.provinceType === "sea")
			return 0;
		return { "low": 900, "medium": 1800, "high": 3000 }[this.data.population] || 1200;
	}

	Serialize()
	{
		return {
			"ownerTribe": this.ownerTribe,
			"garrison": this.garrison > 0 ? this.garrison : undefined,
			"happiness": this.happiness,
			"inRevolt": this.inRevolt || false,
			"buildings": this.buildings,
			"buildQueue": this.buildQueue,
			"buildProgress": this.buildProgress,
			"buildingOwner": this.buildingOwner,
			"population": Math.round(this.population),
			"siege": this.siege
		};
	}

	Deserialize(data)
	{
		this.ownerTribe = data.ownerTribe;
		this.garrison = data.garrison || 0;
		this.happiness = data.happiness !== undefined ? data.happiness : 50;
		this.inRevolt = data.inRevolt || false;
		this.buildings = data.buildings || [];
		this.buildQueue = data.buildQueue || [];
		this.buildProgress = data.buildProgress || 0;
		this.buildingOwner = data.buildingOwner;
		this.population = data.population !== undefined ? data.population : this.getStartingPopulation();
		this.siege = data.siege;
	}

	// UI

	getName()
	{
		return this.data.name;
	}

	getColor()
	{
		if (this.ownerTribe)
			return g_GameData.tribes[this.ownerTribe].color.split(" ");

		if (this.data.color)
			return this.data.color.split(" ");

		return [150, 150, 150];
	}

	getHeroPos()
	{
		if (this.data.centerpoint)
			return this.data.centerpoint;

		if (this.data.position)
			return [
				this.data.position.x + 512,
				this.data.position.y + 512
			];

		return [2048, 1024];
	}

	getLinks()
	{
		if (this.data.links)
			return this.data.links;

		return g_GameData.geo
			.getNeighbours(
				this.code
			);
	}

	/**
	 * Civs nativas, já trocadas por civs carregadas quando preciso
	 * (campaigns/grand_strategy/data/civ_fallback.json).
	 */
	getNativeCivs()
	{
		let civs = this.data.civs || [];
		if (typeof civs === "string")
			civs = [civs];
		if (!civs.length)
			civs = ["athen"];
		return [...new Set(civs.map(civ => twResolveCiv(civ)))];
	}

	getInfoLevel(tribe)
	{
		if (this.ownerTribe === tribe)
			return 2;
		else if (tribe === g_GameData.playerTribe)
		{
			const links = this.getLinks();
			if (this.code === g_GameData.playerHero.location || links.indexOf(g_GameData.playerHero.location) !== -1)
				return 1;
		}
		return 0;
	}

	setOwner(tribe)
	{
		if (this.isSea())
			return;

		if (this.ownerTribe)
			g_GameData.tribes[this.ownerTribe].LoseControl(this.code);

		this.ownerTribe = tribe;
		this.buildingOwner = tribe;

		if (tribe && g_GameData.tribes[tribe])
			g_GameData.tribes[tribe].GainControl(this.code);
	}

	// getBalance()
	// {
	// 	return 100 - this.garrison * 50;
	// }
	getBalance()
	{
		if (this.data.provinceType === "sea")
			return 0;

		// Bônus e custo de guarnição vêm das tecnologias do dono.
		const techs = g_GameData.tribes[this.ownerTribe]?.techs;
		// Impostos crescem com a população (1 de ouro por 60 habitantes).
		let balance = 40 + this.population / 60;
		if (techs)
		{
			balance += techs.get("provinceIncome");
			if (this.isCoastal())
				balance += techs.get("coastalIncome");
			balance -= this.garrison * techs.getGarrisonUpkeep();
		}
		else
			balance -= this.garrison * 50;
		balance += this.getBuildingBonus("income");
		return Math.round(balance);
	}

	/** Soma de um efeito (income, growth, defense...) das construções. */
	getBuildingBonus(effect)
	{
		let bonus = 0;
		for (const buildingId of this.buildings)
			bonus += +(g_GameData.getProvinceBuildingData(buildingId)?.[effect] || 0);
		return bonus;
	}

	/** Antigo "bônus de dano": hoje é a defesa (%) da província. */
	getDamageBonus()
	{
		return this.getBuildingBonus("defense");
	}

	/** Muralha do assentamento na batalha: "stone", "palisade" ou undefined. */
	getWallType()
	{
		const types = this.buildings.map(id => g_GameData.getProvinceBuildingData(id)?.walls).filter(Boolean);
		return types.indexOf("stone") != -1 ? "stone" : types[0];
	}

	hasRecruitBuilding()
	{
		return this.buildings.some(id => !!g_GameData.getProvinceBuildingData(id)?.recruits);
	}

	// ------------------------------------------------ assentamento

	/** village, town ou city, pela população (como as fases do 0 A.D.). */
	getSettlementLevel()
	{
		if (this.population >= TW_LEVEL_POPULATION.city)
			return "city";
		if (this.population >= TW_LEVEL_POPULATION.town)
			return "town";
		return "village";
	}

	/**
	 * Crescimento por turno (%): base pela felicidade, mais fazendas e
	 * tecnologias, menos guerra. Teto de 10.000 habitantes.
	 */
	getGrowthRate()
	{
		if (this.isSea() || !this.ownerTribe)
			return 0;
		let rate = 1 + (this.getHappiness() - 50) / 40 + this.getBuildingBonus("growth");
		if (g_GameData.tribes[this.ownerTribe]?.getCapital?.() == this.code)
			rate += 1;
		rate += g_GameData.tribes[this.ownerTribe]?.techs?.get?.("growth") || 0;
		if (this.inRevolt)
			rate -= 2;
		return Math.max(-3, Math.min(6, rate));
	}

	processGrowth()
	{
		const before = this.getSettlementLevel();
		this.population = Math.max(200, Math.min(10000, this.population * (1 + this.getGrowthRate() / 100) + (this.ownerTribe ? 20 : 0)));
		return this.getSettlementLevel() != before ? this.getSettlementLevel() : undefined;
	}

	getBuildingNames()
	{
		return this.buildings.map(buildingId => {
			const data = g_GameData.getProvinceBuildingData(buildingId);
			return data ? data.name : buildingId;
		});
	}

	getConstructionStatusText()
	{
		if (!this.buildQueue.length)
			return "";

		const definition = g_GameData.getProvinceBuildingData(this.buildQueue[0]);
		if (!definition)
			return "";

		return `${definition.name} (${this.buildProgress}/${this.getBuildingTime(definition.id)})`;
	}

	/** Construções ainda não feitas, com o nível pedido (portos só na costa). */
	getBuildableStructures()
	{
		return g_GameData.getProvinceBuildingDefinitions().filter(def =>
			this.buildings.indexOf(def.id) == -1 && this.buildQueue.indexOf(def.id) == -1 &&
			(!def.coastal || this.isCoastal()));
	}

	canBuild(buildingId)
	{
		const def = g_GameData.getProvinceBuildingData(buildingId);
		return !!def && TW_LEVELS.indexOf(def.level || "village") <= TW_LEVELS.indexOf(this.getSettlementLevel()) &&
			(!def.requires || this.buildings.indexOf(def.requires) != -1);
	}

	getAllStructures()
	{
		return g_GameData.getProvinceBuildingDefinitions();
	}

	/** Custo de uma construção, com o desconto das tecnologias do dono. */
	getBuildingCost(buildingId)
	{
		const data = g_GameData.getProvinceBuildingData(buildingId);
		if (!data)
			return 0;
		const techs = g_GameData.tribes[this.ownerTribe]?.techs;
		return Math.round(data.cost * (techs ? techs.getBuildCostMultiplier() : 1));
	}

	/** Turnos de uma construção, com a redução das tecnologias do dono. */
	getBuildingTime(buildingId)
	{
		const data = g_GameData.getProvinceBuildingData(buildingId);
		if (!data)
			return 0;
		const techs = g_GameData.tribes[this.ownerTribe]?.techs;
		return Math.max(1, data.buildTime - (techs ? techs.get("buildTime") : 0));
	}

	startBuilding(buildingId)
	{
		if (!g_GameData.getProvinceBuildingData(buildingId) || !this.canBuild(buildingId))
			return false;
		if (this.buildQueue.length >= 1)
			return false;
		const tribe = g_GameData.tribes[this.ownerTribe];
		if (!tribe || tribe.money < this.getBuildingCost(buildingId))
			return false;
		tribe.money -= this.getBuildingCost(buildingId);
		this.buildQueue = [buildingId];
		this.buildProgress = 0;
		this.buildingOwner = this.ownerTribe;
		return true;
	}

	processConstruction()
	{
		if (!this.buildQueue.length || !this.ownerTribe)
			return false;
		this.buildProgress++;
		const definition = g_GameData.getProvinceBuildingData(this.buildQueue[0]);
		if (!definition)
			return false;
		if (this.buildProgress >= this.getBuildingTime(definition.id))
		{
			this.buildings.push(this.buildQueue.shift());
			this.buildProgress = 0;
			return true;
		}
		return false;
	}
	// TODO: A*
	canTravel(code)
	{
		return this.getLinks().indexOf(code) !== -1;
	}

	getCenterPoint()
	{
		if (this.data.centerpoint)
			return this.data.centerpoint;

		let center =
			g_GameData.geo
				.getPixelCenter(
					this.code
				);

		return [
			center.x,
			center.y
		];
	}

	getPosition()
	{
		if (this.data.position)
		{
			return [
				this.data.position.x,
				this.data.position.y
			];
		}

		let bounds = this.getBounds();

		return [
			bounds[0],
			bounds[1]
		];
	}

	isCoastal()
	{
		for (let neighbour of this.getLinks())
		{
			let province =
				g_GameData.provinces[
					neighbour
				];

			if (
				province &&
				province.data.provinceType ==
				"sea"
			)
			{
				return true;
			}
		}

		return false;
	}
	isSea()
	{
		return this.data.provinceType ==
			"sea";
	}
	isLand()
	{
		return this.data.provinceType !=
			"sea";
	}
	getBounds()
	{
		let bounds =
			g_GameData.geo.getPixelBounds(
				this.code
			);

		return bounds;
	}

	// Happiness management
	getHappiness()
	{
		return Math.max(0, Math.min(100, this.happiness));
	}

	setHappiness(value)
	{
		this.happiness = Math.max(0, Math.min(100, value));
	}

	changeHappiness(delta)
	{
		this.happiness = Math.max(0, Math.min(100, this.happiness + delta));
	}

	getTaxRate()
	{
		// Happiness affects tax collection
		// At 100 happiness: 100% tax
		// At 50 happiness: 75% tax
		// At 0 happiness: 0% tax
		return this.getHappiness() / 100;
	}
}
