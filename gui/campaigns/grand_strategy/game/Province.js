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
			"buildingOwner": this.buildingOwner
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

	getNativeCivs()
	{
		if (!this.data.civs)
			return ["random"];

		if (typeof this.data.civs === "string")
			return [this.data.civs];

		return this.data.civs;
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

		let balance = 100 - this.garrison * 50;
		for (const buildingId of this.buildings)
		{
			const data = g_GameData.getProvinceBuildingData(buildingId);
			if (data)
				balance += data.damageBonus;
		}
		return balance;
	}

	getDamageBonus()
	{
		let bonus = 0;
		for (const buildingId of this.buildings)
		{
			const data = g_GameData.getProvinceBuildingData(buildingId);
			if (data)
				bonus += data.damageBonus;
		}
		return bonus;
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

		return `${definition.name} (${this.buildProgress}/${definition.buildTime})`;
	}

	getBuildableStructures()
	{
		return g_GameData.getProvinceBuildingDefinitions();
	}

	startBuilding(buildingId)
	{
		if (!g_GameData.getProvinceBuildingData(buildingId))
			return false;
		if (this.buildQueue.length >= 1)
			return false;
		const tribe = g_GameData.tribes[this.ownerTribe];
		if (!tribe || tribe.money < g_GameData.getProvinceBuildingData(buildingId).cost)
			return false;
		tribe.money -= g_GameData.getProvinceBuildingData(buildingId).cost;
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
		if (this.buildProgress >= definition.buildTime)
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
