/**
 * Mecânicas do mapa de campanha (estilo Total War), por cima do jogo (este
 * arquivo carrega depois dos outros de game/, por isso o "zz_"):
 *
 * - Cultura e influência cultural: cada província tem uma mistura de culturas
 *   (o campo "Culture" das civs: celt, hele, iber...). Templo, mercado,
 *   academia e fortaleza espalham a cultura do dono na província e nas
 *   vizinhas; o tempo e a presença do general também ajudam.
 * - Assimilação: uma província de outra cultura só fica integrada quando a
 *   cultura do dono chega a TW_INTEGRATED; antes disso a ordem cai a cada
 *   turno e a arrecadação é menor.
 * - Ordem pública (a "felicidade" que já existia): também pesam integração,
 *   distância da capital, saque e conquista recentes. Com pouca ordem a
 *   população cresce menos, as obras param e o recrutamento fica mais caro
 *   ou impossível (a revolta abaixo de 20 já existia).
 * - Mercenários regionais: com Mercado, recrutam-se as tropas da cultura
 *   nativa da região (de outra civ), mais caras e com manutenção maior, sem
 *   gastar população.
 * - Recrutamento regional: elefantes e camelos só onde esses animais vivem;
 *   campeões só entre o próprio povo (cultura do dono majoritária).
 * - Suprimentos: um exército longe do território próprio (ou de quem dá
 *   passagem) definha, luta pior e chega cansado à batalha de campo.
 * - Manutenção militar: além do ouro (que já existia), os soldados comem:
 *   tiram população da província onde estão (e, em terra alheia, a ordem).
 * - Pilhagem: saquear e conquistar rendem ouro pelas construções destruídas
 *   ou tomadas.
 * - Especialização: vilas e cidades se especializam em comércio, agricultura
 *   ou guerra.
 * - Guarnições urbanas: vilas e cidades têm milícia própria além da guarnição.
 */

/** Cultura do dono a partir da qual a província está integrada. */
var TW_INTEGRATED = 0.6;
/** Espalhamento da cultura do dono por turno (fração), por fonte. */
var TW_CULTURE_BASE = 0.008;
var TW_CULTURE_BUILDINGS = { "temple": 0.03, "market": 0.015, "philosopher_academy": 0.03, "fortress": 0.01 };
var TW_CULTURE_NEIGHBOUR = 0.005;
var TW_CULTURE_GENERAL = 0.01;
/** Influência dos prédios de cultura sobre as províncias vizinhas. */
var TW_CULTURE_BUILDING_REACH = 0.4;
/** Ordem pública. */
var TW_ORDER_INTEGRATION = 6;
var TW_ORDER_DISTANCE_FREE = 3;
var TW_ORDER_PER_HOP = 0.25;
var TW_ORDER_DISTANCE_MAX = 2;
var TW_ORDER_SACKED = 4;
var TW_ORDER_SACKED_TURNS = 6;
var TW_ORDER_CONQUERED = 2;
var TW_ORDER_CONQUERED_TURNS = 8;
var TW_ORDER_UNREST = 40;
var TW_ORDER_DISORDER = 25;
/** Mercenários regionais. */
var TW_MERCENARY_COST = 1.6;
var TW_MERCENARY_UPKEEP = 1.5;
var TW_MERCENARY_BUILDING = "market";
/** Recrutamento regional. */
var TW_ELEPHANT_LANDS = ["savanna", "india", "tropical", "the_nile", "semi_arid"];
var TW_CAMEL_LANDS = ["desert", "semi_arid", "steppe", "the_nile"];
var TW_CHAMPION_CULTURE = 0.5;
/** Suprimentos: estado pela distância (províncias) até terra própria ou com passagem. */
var TW_SUPPLY = [
	{ "id": "supplied", "name": "Supplied", "battle": 1, "attrition": 0, "upkeep": 1, "vigor": 100 },
	{ "id": "foraging", "name": "Foraging", "battle": 1, "attrition": 0, "upkeep": 1, "vigor": 100 },
	{ "id": "stretched", "name": "Supply lines stretched", "battle": 0.9, "attrition": 0.03, "upkeep": 1.1, "vigor": 75 },
	{ "id": "cutoff", "name": "Cut off from supplies", "battle": 0.75, "attrition": 0.08, "upkeep": 1.25, "vigor": 50 }
];
/** População consumida por soldado por turno (manutenção em comida). */
var TW_FOOD_PER_SOLDIER = 0.1;
/** Pilhagem: parte do custo das construções destruídas (saque) ou tomadas (conquista). */
var TW_PLUNDER_SACK = 0.4;
var TW_PLUNDER_OCCUPY = 0.15;
/** Especialização das cidades. */
var TW_SPECIALIZATION_COST = 150;
var TW_SPECIALIZATION_COOLDOWN = 3;
var TW_SPECIALIZATIONS = {
	"none": { "name": "None", "help": "No specialization." },
	"trade": { "name": "Trade", "help": "Markets and caravans: +30% income from this settlement." },
	"agriculture": { "name": "Agriculture", "help": "Fields and herds: population grows 50% faster, and armies standing here eat nothing." },
	"military": { "name": "Military", "help": "Drill grounds: recruits cost 15% less here and start with more experience; the militia is stronger." }
};
var TW_SPECIALIZATION_ORDER = ["none", "trade", "agriculture", "military"];
/** Milícia urbana (batalhões além da guarnição) por nível do assentamento. */
var TW_MILITIA = { "village": 0, "town": 1, "city": 3 };

// ------------------------------------------------ cultura

var g_TWCultureCache = {};

/** Grupo cultural de uma civ (campo Culture do civs/<civ>.json). */
function twCultureOf(civ)
{
	if (!civ)
		return undefined;
	if (g_TWCultureCache[civ] === undefined)
	{
		let culture = civ;
		try
		{
			culture = Engine.ReadJSONFile("simulation/data/civs/" + civ + ".json")?.Culture || civ;
		}
		catch (e)
		{
			culture = civ;
		}
		g_TWCultureCache[civ] = culture;
	}
	return g_TWCultureCache[civ];
}

var TW_CULTURE_NAMES = {
	"celt": "Celtic", "hele": "Hellenic", "iber": "Iberian", "cart": "Punic", "rome": "Roman", "pers": "Persian",
	"maur": "Indian", "han": "Chinese", "germ": "Germanic", "kush": "Kushite", "ptol": "Egyptian"
};

function twCultureName(culture)
{
	return TW_CULTURE_NAMES[culture] || (culture ? culture.charAt(0).toUpperCase() + culture.slice(1) : "Unknown");
}

function twOwnerCulture(province)
{
	const owner = g_GameData.tribes[province.ownerTribe];
	return owner ? twCultureOf(owner.civ) : undefined;
}

/** Mistura cultural da província ({ cultura: fração }), criada na primeira consulta. */
function twProvinceCulture(province)
{
	if (province.culture)
		return province.culture;
	const culture = {};
	const natives = province.getNativeCivs().map(civ => twCultureOf(civ)).filter(Boolean);
	for (const c of natives)
		culture[c] = (culture[c] || 0) + 1 / natives.length;
	// Província inicial de uma tribo: já é terra dela.
	const owner = twOwnerCulture(province);
	if (owner && !(culture[owner] >= TW_INTEGRATED))
	{
		for (const c in culture)
			culture[c] *= 0.2;
		culture[owner] = (culture[owner] || 0) + 0.8;
	}
	province.culture = culture;
	return culture;
}

/** Acrescenta `amount` da cultura `culture`; as outras diminuem na mesma proporção. */
function twSpreadCulture(province, culture, amount)
{
	if (!culture || amount <= 0 || province.isSea())
		return;
	const mix = twProvinceCulture(province);
	const current = mix[culture] || 0;
	const gain = Math.min(1 - current, amount);
	if (gain <= 0)
		return;
	const others = 1 - current;
	for (const c in mix)
		if (c != culture)
			mix[c] = others > 0 ? mix[c] * (1 - gain / others) : 0;
	mix[culture] = current + gain;
	for (const c in mix)
		if (mix[c] < 0.005)
			delete mix[c];
}

/** Integração (0-1): cultura do dono em relação ao limiar TW_INTEGRATED. */
function twIntegration(province)
{
	const owner = twOwnerCulture(province);
	if (!owner || province.isSea())
		return 1;
	return Math.min(1, (twProvinceCulture(province)[owner] || 0) / TW_INTEGRATED);
}

function twCultureTurn()
{
	const turnSpread = {};
	for (const code in g_GameData.provinces)
	{
		const province = g_GameData.provinces[code];
		if (province.isSea() || !province.ownerTribe)
			continue;
		const owner = twOwnerCulture(province);
		let spread = TW_CULTURE_BASE * (0.5 + province.getHappiness() / 100);
		let reach = 0;
		for (const id of province.buildings)
			if (TW_CULTURE_BUILDINGS[id])
			{
				spread += TW_CULTURE_BUILDINGS[id];
				reach += TW_CULTURE_BUILDINGS[id] * TW_CULTURE_BUILDING_REACH;
			}
		const tribe = g_GameData.tribes[province.ownerTribe];
		if (tribe.generals.some(hero => hero.location == code))
			spread += TW_CULTURE_GENERAL;
		for (const link of province.getLinks())
		{
			const neighbour = g_GameData.provinces[link];
			if (!neighbour || neighbour.isSea())
				continue;
			if (twProvinceCulture(neighbour)[owner] >= 0.5)
				spread += TW_CULTURE_NEIGHBOUR;
			// Prédios de cultura também influenciam as vizinhas (de qualquer dono).
			if (reach)
				(turnSpread[link] || (turnSpread[link] = [])).push([owner, reach]);
		}
		(turnSpread[code] || (turnSpread[code] = [])).push([owner, spread]);
	}
	for (const code in turnSpread)
		for (const [culture, amount] of turnSpread[code])
			twSpreadCulture(g_GameData.provinces[code], culture, amount);
}

// ------------------------------------------------ ordem pública

/** Distância (províncias) de cada província até a capital da tribo. */
function twDistancesFrom(start)
{
	const distance = {};
	if (!start)
		return distance;
	distance[start] = 0;
	const queue = [start];
	while (queue.length)
	{
		const code = queue.shift();
		for (const link of g_GameData.provinces[code]?.getLinks() || [])
			if (distance[link] === undefined)
			{
				distance[link] = distance[code] + 1;
				queue.push(link);
			}
	}
	return distance;
}

/** Fatores extras da ordem pública da província ({ motivo: variação por turno }). */
function twOrderFactors(province, distances)
{
	const factors = {};
	const tribe = g_GameData.tribes[province.ownerTribe];
	if (!tribe || province.isSea())
		return factors;
	const integration = twIntegration(province);
	if (integration < 1)
		factors["Foreign culture (not yet integrated)"] = -TW_ORDER_INTEGRATION * (1 - integration);
	const hops = (distances || twDistancesFrom(tribe.getCapital()))[province.code];
	if (hops !== undefined && hops > TW_ORDER_DISTANCE_FREE)
		factors["Distance from the capital"] = -Math.min(TW_ORDER_DISTANCE_MAX, (hops - TW_ORDER_DISTANCE_FREE) * TW_ORDER_PER_HOP);
	const turn = g_GameData.turn || 0;
	if (province.sackedTurn !== undefined && turn - province.sackedTurn < TW_ORDER_SACKED_TURNS)
		factors["Recently sacked"] = -TW_ORDER_SACKED;
	else if (province.conqueredTurn !== undefined && turn - province.conqueredTurn < TW_ORDER_CONQUERED_TURNS)
		factors["Recently conquered"] = -TW_ORDER_CONQUERED;
	return factors;
}

function twOrderState(province)
{
	const order = province.getHappiness();
	return order < TW_ORDER_DISORDER ? "disorder" : order < TW_ORDER_UNREST ? "unrest" : "calm";
}

// ------------------------------------------------ suprimentos

/** Províncias até terra própria (ou de quem dá passagem); 0 = em casa. */
function twSupplyHops(hero)
{
	const supplied = code => {
		const owner = g_GameData.provinces[code]?.ownerTribe;
		return owner && (owner == hero.tribe || twHasPassage(hero.tribe, owner));
	};
	if (supplied(hero.location))
		return 0;
	const seen = { [hero.location]: 0 };
	const queue = [hero.location];
	while (queue.length)
	{
		const code = queue.shift();
		if (seen[code] >= TW_SUPPLY.length - 1)
			continue;
		for (const link of g_GameData.provinces[code]?.getLinks() || [])
		{
			if (seen[link] !== undefined)
				continue;
			seen[link] = seen[code] + 1;
			if (supplied(link))
				return seen[link];
			queue.push(link);
		}
	}
	return TW_SUPPLY.length - 1;
}

function twSupplyState(hero)
{
	if (!hero || !hero.location || !g_GameData.provinces[hero.location])
		return TW_SUPPLY[0];
	return TW_SUPPLY[Math.min(TW_SUPPLY.length - 1, twSupplyHops(hero))];
}

/** Vigor (0-100) com que os batalhões do general chegam à batalha de campo. */
function twSupplyVigor(hero)
{
	return twSupplyState(hero).vigor;
}

// ------------------------------------------------ especialização

function twSpecialization(province)
{
	return province.specialization || "none";
}

/** Motivo de não poder mudar a especialização agora (ou undefined). */
function twSpecializationBlock(province, tribe)
{
	if (!tribe || province.ownerTribe != tribe.code)
		return "Not your province.";
	if (province.getSettlementLevel() == "village")
		return "Only towns and cities can specialize.";
	if (province.specializationTurn !== undefined && (g_GameData.turn || 0) - province.specializationTurn < TW_SPECIALIZATION_COOLDOWN)
		return "Changed recently (wait " + (TW_SPECIALIZATION_COOLDOWN - ((g_GameData.turn || 0) - province.specializationTurn)) + " turn(s)).";
	if (tribe.money < TW_SPECIALIZATION_COST)
		return "Not enough gold (" + TW_SPECIALIZATION_COST + ").";
	return undefined;
}

function twSetSpecialization(province, tribe, specialization)
{
	const block = twSpecializationBlock(province, tribe);
	if (block)
		return block;
	tribe.money -= TW_SPECIALIZATION_COST;
	province.specialization = specialization;
	province.specializationTurn = g_GameData.turn || 0;
	return true;
}

/** IA: especializa vilas e cidades sem especialização (capital comércio, fronteira guerra, o resto agricultura). */
function twAISpecializations()
{
	for (const code in g_GameData.tribes)
	{
		if (code == g_GameData.playerTribe)
			continue;
		const tribe = g_GameData.tribes[code];
		for (const provinceCode of tribe.controlledProvinces)
		{
			const province = g_GameData.provinces[provinceCode];
			if (!province || province.specialization || province.getSettlementLevel() == "village")
				continue;
			const border = province.getLinks().some(link => {
				const owner = g_GameData.provinces[link]?.ownerTribe;
				return owner && owner != code;
			});
			province.specialization = tribe.getCapital() == provinceCode ? "trade" : border ? "military" : "agriculture";
			province.specializationTurn = g_GameData.turn || 0;
		}
	}
}

// ------------------------------------------------ ganchos

{
	// Província: novos campos salvos.
	const twSerialize = Province.prototype.Serialize;
	Province.prototype.Serialize = function()
	{
		return Object.assign(twSerialize.call(this), {
			"culture": this.culture,
			"specialization": this.specialization,
			"specializationTurn": this.specializationTurn,
			"sackedTurn": this.sackedTurn,
			"conqueredTurn": this.conqueredTurn
		});
	};
	const twDeserialize = Province.prototype.Deserialize;
	Province.prototype.Deserialize = function(data)
	{
		twDeserialize.call(this, data);
		this.culture = data.culture;
		this.specialization = data.specialization;
		this.specializationTurn = data.specializationTurn;
		this.sackedTurn = data.sackedTurn;
		this.conqueredTurn = data.conqueredTurn;
	};

	// Crescimento: agricultura acelera; agitação e desordem freiam.
	const twGrowth = Province.prototype.getGrowthRate;
	Province.prototype.getGrowthRate = function()
	{
		let rate = twGrowth.call(this);
		if (!this.ownerTribe || this.isSea())
			return rate;
		if (rate > 0 && twSpecialization(this) == "agriculture")
			rate *= 1.5;
		const state = twOrderState(this);
		if (rate > 0 && state == "unrest")
			rate *= 0.5;
		else if (state == "disorder")
			rate = Math.min(rate, 0);
		return Math.max(-3, Math.min(8, rate));
	};

	// Arrecadação: comércio rende mais; província não integrada rende menos.
	const twBalance = Province.prototype.getBalance;
	Province.prototype.getBalance = function()
	{
		let balance = twBalance.call(this);
		if (balance > 0 && twSpecialization(this) == "trade")
			balance = Math.round(balance * 1.3);
		return balance;
	};
	const twTaxRate = Province.prototype.getTaxRate;
	Province.prototype.getTaxRate = function()
	{
		return twTaxRate.call(this) * (0.5 + 0.5 * twIntegration(this));
	};

	// Obras param na desordem.
	const twConstruction = Province.prototype.processConstruction;
	Province.prototype.processConstruction = function()
	{
		if (this.ownerTribe && twOrderState(this) == "disorder" && this.buildQueue.length)
			return false;
		return twConstruction.call(this);
	};

	// Turno: ordem pública extra, cultura e especialização da IA.
	const twHappiness = GameData.prototype.processProvinceHappiness;
	GameData.prototype.processProvinceHappiness = function()
	{
		twHappiness.call(this);
		const distances = {};
		for (const code in this.provinces)
		{
			const province = this.provinces[code];
			const tribe = this.tribes[province.ownerTribe];
			if (!tribe || province.isSea())
				continue;
			if (!distances[tribe.code])
				distances[tribe.code] = twDistancesFrom(tribe.getCapital());
			const factors = twOrderFactors(province, distances[tribe.code]);
			let delta = 0;
			for (const key in factors)
				delta += factors[key];
			province.changeHappiness(delta);
		}
		twCultureTurn();
		twAISpecializations();
	};

	// Recrutamento: ordem pública, especialização militar, regiões e mercenários.
	const twOptions = twRecruitOptions;
	twRecruitOptions = function(province, tribe)
	{
		const options = twOptions(province, tribe);
		const terrain = province.data.terrain;
		const ownCulture = twCultureOf(tribe.civ);
		const ownShare = twProvinceCulture(province)[ownCulture] || 0;
		const state = twOrderState(province);
		const military = twSpecialization(province) == "military";
		for (const option of options)
		{
			const unit = option.unit;
			const name = (unit.key + " " + (unit.template || "")).toLowerCase();
			if (military)
				option.cost = Math.round(option.cost * 0.85);
			if (state == "unrest")
				option.cost = Math.round(option.cost * 1.2);
			if (option.unavailable)
				continue;
			if (province.inRevolt || state == "disorder")
				option.unavailable = "The province is in disorder (public order below " + TW_ORDER_DISORDER + ")";
			else if ((unit.category == "elephant" || name.indexOf("elephant") != -1) && TW_ELEPHANT_LANDS.indexOf(terrain) == -1)
				option.unavailable = "Elephants are only found in savanna, tropical and Indian lands";
			else if (name.indexOf("camel") != -1 && TW_CAMEL_LANDS.indexOf(terrain) == -1)
				option.unavailable = "Camels are only bred in deserts and steppes";
			else if (unit.category.indexOf("champion") != -1 && ownShare < TW_CHAMPION_CULTURE)
				option.unavailable = "Champions are raised only among your own people (" + twCultureName(ownCulture) + " culture below 50% here)";
		}
		// Mercenários da região: a cultura nativa (de outra civ), com Mercado.
		const ownCiv = twResolveCiv(tribe.civ);
		const hasMarket = province.buildings.indexOf(TW_MERCENARY_BUILDING) != -1;
		const level = province.getSettlementLevel();
		const seen = new Set();
		for (const native of province.getNativeCivs())
		{
			const civ = twResolveCiv(native);
			if (!civ || civ == ownCiv || seen.has(civ))
				continue;
			seen.add(civ);
			const roster = twRoster(civ, true);
			for (const unit of roster ? roster.units : [])
			{
				if (unit.siege || unit.naval || unit.category.indexOf("champion") != -1 || unit.category == "elephant" ||
					TW_LEVELS.indexOf(unit.level) > TW_LEVELS.indexOf(level))
					continue;
				options.push({
					"unit": Object.assign({}, unit, {
						"key": "merc|" + civ + "|" + unit.key,
						"name": unit.name + " (" + twCivName(civ) + " mercenaries)",
						"upkeep": Math.round(unit.upkeep * TW_MERCENARY_UPKEEP)
					}),
					"civ": civ,
					"mercenary": true,
					"cost": Math.round(unit.cost * TW_MERCENARY_COST * (tribe.techs?.getRecruitCostMultiplier?.() || 1)),
					"unavailable": !hasMarket ? "Mercenaries are hired at a Market" :
						province.inRevolt || state == "disorder" ? "The province is in disorder" : undefined
				});
			}
		}
		return options.sort((a, b) => !!a.unavailable - !!b.unavailable || a.cost - b.cost);
	};

	const twRecruitOne = twRecruit;
	twRecruit = function(hero, key)
	{
		if (!key || key.indexOf("merc|") != 0)
			return twRecruitOne(hero, key);
		const province = g_GameData.provinces[hero.location];
		const tribe = g_GameData.tribes[hero.tribe];
		if (!province || province.ownerTribe != hero.tribe)
			return "The general must be in one of your provinces.";
		if (hero.battalions.length >= TW_MAX_BATTALIONS)
			return "This army is full (" + TW_MAX_BATTALIONS + " battalions).";
		const option = twRecruitOptions(province, tribe).find(o => o.unit.key == key);
		if (!option)
			return "Unknown unit.";
		if (option.unavailable)
			return option.unavailable;
		if (tribe.money < option.cost)
			return "Not enough gold.";
		tribe.money -= option.cost;
		const battalion = twNewBattalion(option.civ, key.split("|")[2], twRecruitXp(province));
		battalion.mercenary = true;
		hero.battalions.push(battalion);
		g_GameData.statistics?.AddGold?.(-option.cost);
		return true;
	};

	const twXp = twRecruitXp;
	twRecruitXp = function(province)
	{
		return twXp(province) + (twSpecialization(province) == "military" ? 50 : 0);
	};

	// Mercenários custam mais para manter.
	const twUpkeep = twArmyUpkeep;
	twArmyUpkeep = function(battalions)
	{
		const extra = battalions.filter(b => b.mercenary).reduce((sum, b) => sum + (twUnit(b.civ, b.key)?.upkeep || 0) * (TW_MERCENARY_UPKEEP - 1), 0);
		return twUpkeep(battalions) + Math.round(extra);
	};

	// Turno do exército: suprimentos (desgaste, manutenção) e comida.
	const twArmyTurn = twProcessArmyTurn;
	twProcessArmyTurn = function(hero)
	{
		let spent = twArmyTurn(hero);
		const tribe = g_GameData.tribes[hero.tribe];
		if (!tribe || !hero.battalions || !hero.battalions.length)
			return spent;
		const supply = twSupplyState(hero);
		if (supply.upkeep > 1)
		{
			const extra = Math.round(twArmyUpkeep(hero.battalions) * (supply.upkeep - 1));
			tribe.money -= extra;
			spent += extra;
		}
		let attrition = supply.attrition;
		// Comida: a província onde o exército está alimenta os soldados.
		const province = g_GameData.provinces[hero.location];
		if (province && !province.isSea() && !(province.ownerTribe == hero.tribe && twSpecialization(province) == "agriculture"))
		{
			const need = twArmySoldiers(twLandBattalions(hero.battalions)) * TW_FOOD_PER_SOLDIER;
			const eaten = Math.min(need, Math.max(0, province.population - 100));
			province.population -= eaten;
			if (province.ownerTribe && province.ownerTribe != hero.tribe)
				province.changeHappiness(-2);
			if (eaten < need)
				attrition += 0.03;
		}
		if (attrition > 0)
			for (const battalion of twLandBattalions(hero.battalions))
				battalion.strength = Math.max(1, Math.round(battalion.strength * (1 - attrition)));
		hero.supply = supply.id;
		return spent;
	};

	// Resolução automática: suprimentos pesam na força.
	const twSide = twSideMultiplier;
	twSideMultiplier = function(side)
	{
		return twSide(side) * (side.hero ? twSupplyState(side.hero).battle : 1);
	};

	// Guarnições urbanas: milícia além da guarnição.
	const twGarrison = twGarrisonArmy;
	twGarrisonArmy = function(province)
	{
		const army = twGarrison(province);
		const owner = g_GameData.tribes[province.ownerTribe];
		if (!owner || !army.length)
			return army;
		let militia = TW_MILITIA[province.getSettlementLevel()] || 0;
		if (twSpecialization(province) == "military")
			militia += 2;
		if (province.getWallType())
			militia += 1;
		const civ = army[0].civ;
		const roster = twRoster(civ);
		const level = province.getSettlementLevel();
		const pool = (roster ? roster.units : []).filter(u => (u.category == "infantry_melee" || u.category == "infantry_ranged") &&
			TW_LEVELS.indexOf(u.level) <= TW_LEVELS.indexOf(level));
		for (let i = 0; i < militia && pool.length; ++i)
		{
			const battalion = twNewBattalion(civ, pickRandom(pool).key, 0);
			battalion.garrison = true;
			battalion.militia = true;
			army.push(battalion);
		}
		return army;
	};

	// Pilhagem e datas de conquista/saque.
	const twRecord = TWConquest.record;
	TWConquest.record = function(provinceCode, previousOwner, conqueror, wasCapital)
	{
		const province = g_GameData.provinces[provinceCode];
		if (province)
			province.conqueredTurn = g_GameData.turn || 0;
		return twRecord.call(this, provinceCode, previousOwner, conqueror, wasCapital);
	};
	const buildingValue = ids => ids.reduce((sum, id) => sum + (g_GameData.getProvinceBuildingData(id)?.cost || 0), 0);
	const twSack = TWConquest.sack;
	TWConquest.sack = function(capture)
	{
		const province = g_GameData.provinces[capture.province];
		const before = province.buildings.slice();
		let text = twSack.call(this, capture);
		const destroyed = before.filter(id => province.buildings.indexOf(id) == -1);
		const plunder = Math.round(buildingValue(destroyed) * TW_PLUNDER_SACK);
		if (plunder)
		{
			g_GameData.tribes[capture.conqueror].money += plunder;
			g_GameData.statistics?.AddGold?.(plunder);
			text += " Plunder from the ruined buildings: " + plunder + " gold.";
		}
		province.sackedTurn = g_GameData.turn || 0;
		return text;
	};
	const twOccupy = TWConquest.occupy;
	TWConquest.occupy = function(capture)
	{
		let text = twOccupy.call(this, capture);
		const province = g_GameData.provinces[capture.province];
		const spoils = Math.round(buildingValue(province.buildings) * TW_PLUNDER_OCCUPY);
		if (spoils)
		{
			g_GameData.tribes[capture.conqueror].money += spoils;
			g_GameData.statistics?.AddGold?.(spoils);
			text += " Spoils from the captured buildings: " + spoils + " gold.";
		}
		return text;
	};
}

/** Texto da província: cultura, ordem, especialização (janela da província). */
function twProvinceMechanicsText(province)
{
	if (province.isSea())
		return "";
	const lines = [];
	const mix = twProvinceCulture(province);
	const parts = Object.keys(mix).sort((a, b) => mix[b] - mix[a]).slice(0, 3)
		.map(c => twCultureName(c) + " " + Math.round(mix[c] * 100) + "%");
	lines.push("Culture: " + parts.join(", "));
	if (province.ownerTribe)
	{
		const integration = twIntegration(province);
		lines.push(integration >= 1 ? coloredText("Integrated", "150 220 150") :
			coloredText("Integration " + Math.round(integration * 100) + "% (tax " + Math.round((0.5 + 0.5 * integration) * 100) + "%)", "230 190 110"));
		const state = twOrderState(province);
		if (state != "calm")
			lines.push(coloredText(state == "disorder" ? "Disorder: no growth, no construction, no recruitment" :
				"Unrest: slower growth, recruits cost 20% more", "230 130 110"));
		const factors = twOrderFactors(province);
		for (const key in factors)
			lines.push(coloredText("  " + key + " " + factors[key].toFixed(1) + "/turn", "200 170 150"));
		if (province.getSettlementLevel() != "village" || twSpecialization(province) != "none")
			lines.push("Specialization: " + TW_SPECIALIZATIONS[twSpecialization(province)].name);
		const militia = TW_MILITIA[province.getSettlementLevel()] + (twSpecialization(province) == "military" ? 2 : 0) + (province.getWallType() ? 1 : 0);
		if (militia)
			lines.push("City militia: " + militia + " battalions");
	}
	return lines.join("\n") + "\n";
}

/** Texto do suprimento do general (janela do general / exército). */
function twSupplyText(hero)
{
	const supply = twSupplyState(hero);
	if (supply.id == "supplied")
		return coloredText("Supplied", "150 220 150");
	if (supply.id == "foraging")
		return coloredText("Foraging (one province from your lands)", "220 220 150");
	return coloredText(supply.name + ": battle strength " + Math.round(supply.battle * 100) + "%, losing " +
		Math.round(supply.attrition * 100) + "% of the soldiers per turn, troops arrive tired", "230 130 110");
}

/** Versão curta (painel do general). */
function twSupplyShortText(hero)
{
	const supply = twSupplyState(hero);
	const colour = { "supplied": "150 220 150", "foraging": "220 220 150" }[supply.id] || "230 130 110";
	return coloredText(supply.id == "supplied" ? "Supplied" : supply.id == "foraging" ? "Foraging" :
		supply.name.split(" ")[0] + " " + supply.name.split(" ").slice(1).join(" ") + " (" + Math.round(supply.battle * 100) + "%, -" + Math.round(supply.attrition * 100) + "%/turn)", colour);
}
