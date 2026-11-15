/**
 * Regras de exército do Total Warfield no mapa de campanha.
 *
 * - Cada general comanda batalhões (hero.battalions): { id, civ, key,
 *   strength, xp }. A unidade vem da lista da civ
 *   (simulation/data/total_warfield/rosters/<civ>.json, gerada por
 *   tools/gen_battalions.py): tamanho, custo, manutenção, construção e
 *   nível de assentamento exigidos e estatísticas.
 * - Recrutar: numa província própria, com a construção e o nível pedidos;
 *   custa ouro e população da província. Batalhões em território próprio
 *   repõem baixas a cada turno (pagando), e todos cobram manutenção.
 * - Guarnição (province.garrison) e nativos viram batalhões só na hora da
 *   batalha (twGarrisonArmy), com a civ dona ou nativa.
 * - Resolução automática: poder de cada lado (soldados, ataque, vida,
 *   armadura, experiência, general, defesa da província) decide o
 *   vencedor e as baixas.
 */

var TW_ROSTER_PATH = "simulation/data/total_warfield/rosters/";
var TW_FALLBACK_PATH = "campaigns/grand_strategy/data/civ_fallback.json";
/** Máximo de batalhões por general (como a pilha de 20 do Total War). */
var TW_MAX_BATTALIONS = 12;
/** XP por nível (mesmo que BattalionTactics: 150, 450, 900). */
var TW_LEVEL_XP = [150, 450, 900];
var TW_LEVELS = ["village", "town", "city"];
var TW_LEVEL_NAMES = { "village": "Village", "town": "Town", "city": "City" };
/** População para cada nível de assentamento. */
var TW_LEVEL_POPULATION = { "village": 0, "town": 2500, "city": 6000 };
/** Reposição por turno em território próprio (fração do tamanho). */
var TW_REPLENISH_RATE = 0.2;
/** Categorias e nomes curtos. */
var TW_CATEGORY_NAMES = {
	"infantry_melee": "Infantry",
	"infantry_ranged": "Missile infantry",
	"cavalry_melee": "Cavalry",
	"cavalry_ranged": "Missile cavalry",
	"champion_infantry": "Champion infantry",
	"champion_cavalry": "Champion cavalry",
	"chariot": "Chariots",
	"elephant": "War elephants",
	"siege": "Siege engines"
};

var g_TWRosters = {};
var g_TWFallback;
var g_TWLoadedCivs;
var g_TWNextBattalionId;

/** Civs carregadas (simulation/data/civs) neste jogo. */
function twLoadedCivs()
{
	if (!g_TWLoadedCivs)
	{
		g_TWLoadedCivs = loadCivFiles(false);
		// Os nomes vêm dos templates como objetos com contexto de tradução.
		translateObjectKeys(g_TWLoadedCivs, ["Name"]);
	}
	return g_TWLoadedCivs;
}

/** Nome legível da civ (texto puro, já traduzido). */
function twCivName(civ)
{
	const name = twLoadedCivs()[civ]?.Name;
	if (typeof name == "string")
		return name;
	return name?._string || name?.message || civ;
}

/**
 * Civ jogável para `civ`: ela mesma se estiver carregada e tiver lista de
 * batalhões; senão a substituta (civ_fallback.json); senão "athen".
 */
function twResolveCiv(civ)
{
	if (civ && twLoadedCivs()[civ] && twRoster(civ, true))
		return civ;
	if (!g_TWFallback)
		g_TWFallback = Engine.ReadJSONFile(TW_FALLBACK_PATH) || {};
	const fallback = g_TWFallback[civ];
	if (fallback && twLoadedCivs()[fallback] && twRoster(fallback, true))
		return fallback;
	return "athen";
}

function twRoster(civ, quiet)
{
	if (g_TWRosters[civ] === undefined)
	{
		const path = TW_ROSTER_PATH + civ + ".json";
		g_TWRosters[civ] = Engine.FileExists(path) ? Engine.ReadJSONFile(path) : null;
		if (!g_TWRosters[civ] && !quiet)
			warn("Total Warfield: no battalion roster for civ '" + civ + "'.");
	}
	return g_TWRosters[civ];
}

function twUnit(civ, key)
{
	return twRoster(civ)?.units.find(unit => unit.key == key);
}

function twNewBattalionId()
{
	if (g_TWNextBattalionId === undefined)
		g_TWNextBattalionId = Date.now() % 1000000;
	return "b" + (++g_TWNextBattalionId).toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

/** Batalhão novo, completo, da unidade `key` da civ. */
function twNewBattalion(civ, key, xp = 0)
{
	const unit = twUnit(civ, key);
	if (!unit)
		return undefined;
	return { "id": twNewBattalionId(), "civ": civ, "key": key, "strength": unit.size, "xp": xp };
}

function twBattalionLevel(battalion)
{
	let level = 0;
	while (level < TW_LEVEL_XP.length && (battalion.xp || 0) >= TW_LEVEL_XP[level])
		++level;
	return level;
}

/** Nome do batalhão para a interface: "Roman Swordsman 18/24 ★★". */
function twBattalionLabel(battalion)
{
	const unit = twUnit(battalion.civ, battalion.key);
	const level = twBattalionLevel(battalion);
	return (unit ? unit.name : battalion.key) + "  " + battalion.strength + "/" + (unit ? unit.size : "?") + (unit?.siege ? " engines" : unit?.naval ? " ships" : "") +
		(level ? "  " + "*".repeat(level) : "");
}

/**
 * Poder de combate de um soldado: dano por segundo vezes a vida efetiva
 * (vida e armadura), com bônus da cavalaria e dos atiradores.
 */
function twUnitPower(unit)
{
	const stats = unit.stats;
	const damage = stats.melee + stats.ranged * (1 + Math.min(stats.range, 80) / 160);
	const durability = stats.hp * (1 + stats.armor * 0.09);
	const mobility = unit.category.indexOf("cavalry") != -1 || unit.category == "chariot" ? 1.15 : 1;
	return Math.sqrt(Math.max(1, damage) * durability) * mobility;
}

/**
 * @param naval - batalha no mar: valem as esquadras; as tropas embarcadas
 *   só ajudam na abordagem (TW_MARINE_SHARE). Em terra os navios não lutam.
 */
function twBattalionPower(battalion, naval = false)
{
	const unit = twUnit(battalion.civ, battalion.key);
	if (!unit)
		return 0;
	if (!!unit.naval != naval)
		return naval ? battalion.strength * twUnitPower(unit) * TW_MARINE_SHARE : 0;
	if (unit.naval)
		return battalion.strength * twUnitPower(unit) * (unit.transport ? 0.25 : 1) * (1 + 0.1 * twBattalionLevel(battalion));
	// Máquinas de cerco valem pouco em campo aberto (contra muralhas,
	// valem pelo bônus de defesa que anulam: twSiegeEngines).
	return battalion.strength * twUnitPower(unit) * (1 + 0.1 * twBattalionLevel(battalion)) * (unit.siege ? 0.25 : 1) *
		(1 + 0.06 * (battalion.upgrades || []).length);
}

/** Máquinas de cerco num exército (soma das "forças" dos batalhões de cerco). */
function twSiegeEngines(battalions)
{
	return battalions.reduce((sum, b) => sum + (twUnit(b.civ, b.key)?.siege ? b.strength : 0), 0);
}

/** Aríete da civ (para os aríetes construídos durante um cerco). */
function twRamUnit(civ)
{
	const units = twRoster(civ)?.units || [];
	return units.find(u => u.siege && u.ram) || units.find(u => u.siege);
}

/** Quantos aríetes o cerco já construiu para este general. */
function twSiegeRams(hero, provinceCode)
{
	const siege = g_GameData.provinces[provinceCode]?.siege;
	return siege && siege.heroId == hero.id ? siege.rams : 0;
}

/** Abordagem: parte da força das tropas embarcadas numa batalha naval. */
var TW_MARINE_SHARE = 0.1;

function twArmyPower(battalions, naval = false)
{
	return battalions.reduce((sum, battalion) => sum + twBattalionPower(battalion, naval), 0);
}

/** Esquadras (batalhões navais) de um exército. */
function twFleet(battalions)
{
	return battalions.filter(battalion => twUnit(battalion.civ, battalion.key)?.naval);
}

/** Batalhões que lutam em terra (sem as esquadras). */
function twLandBattalions(battalions)
{
	return battalions.filter(battalion => !twUnit(battalion.civ, battalion.key)?.naval);
}

/** Navio mercante da civ (transporte de quem vai ao mar sem esquadra). */
function twTransportUnit(civ)
{
	const units = twRoster(civ)?.units || [];
	return units.find(u => u.naval && u.transport) || units.find(u => u.naval);
}

/** Civ e navio de transporte; povos sem porto (do interior) alugam mercantes. */
function twTransportFor(civ)
{
	for (const candidate of [civ, "athen", "cart", "rome"])
	{
		const unit = twTransportUnit(candidate);
		if (unit)
			return { "civ": candidate, "unit": unit };
	}
	return undefined;
}

function twArmySoldiers(battalions)
{
	return battalions.reduce((sum, battalion) => sum + battalion.strength, 0);
}

function twArmyUpkeep(battalions)
{
	return battalions.reduce((sum, battalion) => sum + (twUnit(battalion.civ, battalion.key)?.upkeep || 0) +
		(battalion.upgrades || []).reduce((extra, kind) => extra + (twRoster(battalion.civ)?.attachments?.[kind]?.upkeep || 0), 0), 0);
}

// ------------------------------------------------ acompanhantes (melhoramentos)

var TW_ATTACHMENT_NAMES = { "priest": "Priest", "high_priest": "High Priest", "musician": "War Musician", "standard": "Standard Bearer" };
var TW_ATTACHMENT_HELP = {
	"priest": "Heals the soldiers and steadies their morale (less morale lost, faster recovery). Needs a Temple.",
	"high_priest": "A special priest of this people: heals and greatly steadies morale, raises maximum morale. Needs a Temple in a City.",
	"musician": "Horns and drums: much faster morale recovery and more fearsome charges.",
	"standard": "The battalion's standard: higher maximum morale, steadier ranks, stronger charges."
};

/**
 * Melhoramentos que o batalhão pode receber agora, com o motivo de cada um
 * não estar disponível. Só existem os que a civ tem (lista gerada).
 */
function twAttachmentOptions(hero, battalion)
{
	const attachments = twRoster(battalion.civ)?.attachments || {};
	const province = g_GameData.provinces[hero.location];
	const tribe = g_GameData.tribes[hero.tribe];
	const unit = twUnit(battalion.civ, battalion.key);
	return Object.keys(attachments).map(kind => {
		const data = attachments[kind];
		let unavailable;
		if (unit?.siege || unit?.naval)
			unavailable = unit.naval ? "Not for ships" : "Not for siege engines";
		else if ((battalion.upgrades || []).indexOf(kind) != -1)
			unavailable = "Already has one";
		else if (province?.ownerTribe != hero.tribe)
			unavailable = "Only in your own provinces";
		else if ((kind == "priest" || kind == "high_priest") && province.buildings.indexOf("temple") == -1)
			unavailable = "Needs a Temple here";
		else if (kind == "high_priest" && province.getSettlementLevel() != "city")
			unavailable = "Needs a City";
		else if (tribe.money < data.cost)
			unavailable = "Not enough gold";
		return { "kind": kind, "name": TW_ATTACHMENT_NAMES[kind] || kind, "unitName": data.unitName, "cost": data.cost,
			"upkeep": data.upkeep, "icon": data.icon, "unavailable": unavailable };
	});
}

function twBuyAttachment(hero, battalion, kind)
{
	const option = twAttachmentOptions(hero, battalion).find(o => o.kind == kind);
	if (!option)
		return "Not available to this people.";
	if (option.unavailable)
		return option.unavailable;
	g_GameData.tribes[hero.tribe].money -= option.cost;
	battalion.upgrades = (battalion.upgrades || []).concat([kind]);
	return true;
}

// ------------------------------------------------ recrutamento

/** Construções da província que liberam recrutas ("none" sempre vale). */
function twProvinceRecruitBuildings(province)
{
	const buildings = new Set(["none"]);
	for (const id of province.buildings || [])
	{
		const data = g_GameData.getProvinceBuildingData(id);
		if (data && data.recruits)
			buildings.add(data.recruits);
	}
	return buildings;
}

/**
 * Batalhões que a tribo pode recrutar na província, com o motivo de cada
 * um não estar disponível (unavailable) e o custo já com descontos.
 */
function twRecruitOptions(province, tribe)
{
	const civ = twResolveCiv(tribe.civ);
	const roster = twRoster(civ);
	if (!roster)
		return [];
	const buildings = twProvinceRecruitBuildings(province);
	const level = province.getSettlementLevel();
	return roster.units.map(unit => {
		let unavailable;
		if (TW_LEVELS.indexOf(unit.level) > TW_LEVELS.indexOf(level))
			unavailable = "Needs a " + TW_LEVEL_NAMES[unit.level];
		else if (!buildings.has(unit.building))
			unavailable = "Needs " + (g_GameData.getProvinceBuildingDefinitions().find(b => b.recruits == unit.building)?.name || unit.building);
		else if (province.population < unit.size * 10)
			unavailable = "Not enough population";
		return {
			"unit": unit,
			"civ": civ,
			"cost": Math.round(unit.cost * (tribe.techs?.getRecruitCostMultiplier?.() || 1)),
			"unavailable": unavailable
		};
	}).sort((a, b) => !!a.unavailable - !!b.unavailable || a.cost - b.cost);
}

/** Experiência inicial dos recrutados (quartéis, fortalezas...). */
function twRecruitXp(province)
{
	let xp = 0;
	for (const id of province.buildings || [])
		xp = Math.max(xp, g_GameData.getProvinceBuildingData(id)?.xp || 0);
	return xp;
}

/**
 * Recruta um batalhão para o general (na província onde ele está).
 * @return true ou o motivo da recusa.
 */
function twRecruit(hero, key)
{
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
	province.population -= option.unit.size * 10;
	hero.battalions.push(twNewBattalion(option.civ, key, twRecruitXp(province)));
	g_GameData.statistics?.AddGold?.(-option.cost);
	return true;
}

/** Exército inicial: linha de infantaria, atiradores e cavalaria básicos. */
function twStartingArmy(civ, size = 4)
{
	civ = twResolveCiv(civ);
	const roster = twRoster(civ);
	if (!roster)
		return [];
	const basic = roster.units.filter(u => !u.siege && !u.naval && (u.building == "none" || u.level == "village"));
	const pickOf = category => basic.find(u => u.category == category) || roster.units.find(u => u.category == category);
	const plan = ["infantry_melee", "infantry_melee", "infantry_ranged", "cavalry_melee", "infantry_melee", "cavalry_ranged", "infantry_ranged", "infantry_melee"];
	const army = [];
	for (const category of plan)
	{
		if (army.length >= size)
			break;
		const unit = pickOf(category) || pickOf("infantry_melee");
		if (unit)
			army.push(twNewBattalion(civ, unit.key));
	}
	return army;
}

/**
 * Defensores de uma província sem general: a guarnição (nível 0-10) e as
 * torres viram batalhões da civ dona; províncias sem dono têm nativos,
 * mais numerosos com mais população.
 */
function twGarrisonArmy(province)
{
	const owner = g_GameData.tribes[province.ownerTribe];
	const civ = twResolveCiv(owner ? owner.civ : pickRandom(province.getNativeCivs()));
	const roster = twRoster(civ);
	if (!roster)
		return [];
	let count = owner ? province.garrison + province.getBuildingBonus("garrison") :
		{ "low": 2, "medium": 3, "high": 4 }[province.data.population] || 2;
	if (province.getSettlementLevel() != "village")
		++count;
	count = Math.max(1, Math.min(10, count));
	const level = province.getSettlementLevel();
	const allowed = roster.units.filter(u => TW_LEVELS.indexOf(u.level) <= TW_LEVELS.indexOf(level) && u.category.indexOf("champion") == -1 && !u.siege && !u.naval);
	const of = category => allowed.filter(u => u.category == category);
	const melee = of("infantry_melee");
	const ranged = of("infantry_ranged");
	const cavalry = of("cavalry_melee").concat(of("cavalry_ranged"));
	const army = [];
	for (let i = 0; i < count; ++i)
	{
		const pool = i % 3 == 1 && ranged.length ? ranged : i % 5 == 4 && cavalry.length ? cavalry : melee.length ? melee : allowed;
		const unit = pickRandom(pool);
		if (!unit)
			continue;
		const battalion = twNewBattalion(civ, unit.key, owner ? 0 : 50);
		battalion.garrison = true;
		army.push(battalion);
	}
	return army;
}

// ------------------------------------------------ manutenção e reposição

/**
 * Fim de turno de um general: paga a manutenção; em território próprio
 * repõe baixas (pagando pelos soldados novos). Sem dinheiro, os batalhões
 * perdem soldados (deserção).
 * @return ouro gasto.
 */
function twProcessArmyTurn(hero)
{
	const tribe = g_GameData.tribes[hero.tribe];
	if (!tribe || !hero.battalions)
		return 0;
	twDrillArmy(hero);
	let spent = Math.round(twArmyUpkeep(hero.battalions) * (tribe.techs?.getArmyUpkeepMultiplier?.() || 1));
	tribe.money -= spent;
	if (tribe.money < 0)
	{
		for (const battalion of hero.battalions)
			battalion.strength = Math.max(1, Math.floor(battalion.strength * 0.9));
		return spent;
	}

	const province = g_GameData.provinces[hero.location];
	if (!province || province.ownerTribe != hero.tribe)
		return spent;
	const rate = TW_REPLENISH_RATE * (province.hasRecruitBuilding() ? 1.5 : 1);
	for (const battalion of hero.battalions)
	{
		const unit = twUnit(battalion.civ, battalion.key);
		if (!unit || battalion.strength >= unit.size)
			continue;
		const add = Math.min(unit.size - battalion.strength, Math.max(1, Math.round(unit.size * rate)),
			Math.floor(province.population / 10));
		const cost = Math.round(unit.cost * add / unit.size * 0.6);
		if (add <= 0 || tribe.money < cost)
			continue;
		tribe.money -= cost;
		spent += cost;
		province.population -= add * 10;
		// Recrutas novos diluem a experiência.
		battalion.xp = Math.round((battalion.xp || 0) * battalion.strength / (battalion.strength + add));
		battalion.strength += add;
	}
	return spent;
}

/** Experiência de treino por turno parado; dobra com quartel ou fortaleza. */
var TW_DRILL_XP = 30;
/** Treino leva até o nível 2; o nível 3 só se ganha lutando. */
var TW_DRILL_CAP = 450;

/**
 * Exército que passou o turno inteiro parado numa província própria treina:
 * cada batalhão ganha experiência (até TW_DRILL_CAP).
 * @return experiência ganha por batalhão neste turno (0 se não treinou).
 */
function twDrillArmy(hero)
{
	const stayed = hero.lastTurnLocation == hero.location;
	hero.lastTurnLocation = hero.location;
	const province = g_GameData.provinces[hero.location];
	if (!stayed || !province || province.ownerTribe != hero.tribe)
	{
		hero.drilling = 0;
		return 0;
	}
	const gain = twDrillRate(province);
	for (const battalion of hero.battalions)
		if (!twUnit(battalion.civ, battalion.key)?.siege && (battalion.xp || 0) < TW_DRILL_CAP)
			battalion.xp = Math.min(TW_DRILL_CAP, (battalion.xp || 0) + gain);
	hero.drilling = gain;
	return gain;
}

function twDrillRate(province)
{
	return TW_DRILL_XP * (province.buildings.some(id => id == "barracks" || id == "fortress") ? 2 : 1);
}

// ------------------------------------------------ resolução automática

/**
 * Bônus do lado: general (+10%, mais os bônus de herói), defesa da
 * província para quem defende, e dificuldade para a IA.
 */
function twSideMultiplier(side)
{
	let multiplier = 1;
	if (side.hero)
		multiplier += 0.1 + (side.hero.bonuses?.battle || 0);
	if (side.defenseBonus)
		multiplier += side.defenseBonus / 100;
	if (side.difficulty)
		multiplier *= side.difficulty;
	return multiplier;
}

/**
 * Decide uma batalha sem jogá-la.
 * @param attacker/defender - { battalions, hero, defenseBonus, difficulty }
 * @return { winner: "attacker"|"defender", chance, battalions: {id: força}, xp: {id: xp} }
 */
function twAutoResolve(attacker, defender, naval = false)
{
	const powerA = twArmyPower(attacker.battalions, naval) * twSideMultiplier(attacker);
	const powerD = twArmyPower(defender.battalions, naval) * twSideMultiplier(defender);
	const total = Math.max(1, powerA + powerD);
	const chance = powerA / total;
	const attackerWins = !defender.battalions.length || Math.random() < Math.pow(chance, 1.6) / (Math.pow(chance, 1.6) + Math.pow(1 - chance, 1.6));

	// Baixas: o perdedor sofre mais; desigualdade grande = vitória barata.
	const ratio = attackerWins ? powerD / Math.max(1, powerA) : powerA / Math.max(1, powerD);
	const winnerLoss = Math.min(0.6, 0.12 + 0.45 * Math.min(1, ratio));
	const loserLoss = Math.min(0.95, 0.5 + 0.3 * Math.min(1, ratio));
	const result = { "winner": attackerWins ? "attacker" : "defender", "chance": chance, "battalions": {}, "xp": {} };
	const apply = (battalions, loss, won) => {
		for (const battalion of battalions)
		{
			// No mar quem sofre são os navios; os embarcados afundam com eles
			// depois (TWBattle.applyNavalLosses). Em terra os navios ficam de fora.
			if (!!twUnit(battalion.civ, battalion.key)?.naval != naval)
				continue;
			const lost = loss * (0.7 + Math.random() * 0.6);
			result.battalions[battalion.id] = Math.max(0, Math.round(battalion.strength * (1 - lost)));
			result.xp[battalion.id] = (battalion.xp || 0) + (won ? 120 : 50) + Math.round(80 * Math.random());
		}
	};
	apply(attacker.battalions, attackerWins ? winnerLoss : loserLoss, attackerWins);
	apply(defender.battalions, attackerWins ? loserLoss : winnerLoss, !attackerWins);
	return result;
}

/**
 * Aplica sobreviventes e experiência a uma lista de batalhões (remove os
 * aniquilados ou com menos de 2 soldados). Devolve soldados perdidos.
 */
function twApplyCasualties(battalions, survivors, xp, attachments)
{
	let lost = 0;
	for (let i = battalions.length - 1; i >= 0; --i)
	{
		const battalion = battalions[i];
		if (survivors[battalion.id] === undefined)
			continue;
		const strength = Math.max(0, Math.round(survivors[battalion.id]));
		lost += Math.max(0, battalion.strength - strength);
		battalion.strength = strength;
		if (xp && xp[battalion.id] !== undefined)
			battalion.xp = Math.max(battalion.xp || 0, xp[battalion.id]);
		// Acompanhantes que morreram na batalha se perdem.
		if (attachments && attachments[battalion.id] && battalion.upgrades)
			battalion.upgrades = battalion.upgrades.filter(kind => attachments[battalion.id].indexOf(kind) != -1);
		// Navios e máquinas contam um a um: basta um para continuar.
		const unit = twUnit(battalion.civ, battalion.key);
		if (battalion.strength < (unit?.naval || unit?.siege ? 1 : 2))
			battalions.splice(i, 1);
	}
	return lost;
}

/** As duas tribos estão em guerra (vassalo e senhor nunca estão)? */
function twAtWar(a, b)
{
	if (!a || !b || a == b || TWConquest.isVassalPair(a, b))
		return false;
	return g_GameData.tribes[a]?.getDiplomacy(b).status === GSDiplomacy.prototype.WAR;
}

/**
 * Os exércitos de `tribe` podem entrar nas províncias de `owner`? Nas
 * próprias e nas sem dono sim; nas do inimigo em guerra sim (para lutar);
 * nas dos outros só com acesso militar, aliança ou vassalagem.
 */
function twCanEnterTerritory(tribe, owner)
{
	if (!owner || owner == tribe || twAtWar(tribe, owner))
		return true;
	return twHasPassage(tribe, owner);
}

/** Passagem pacífica (sem guerra): acesso militar, aliança ou vassalagem. */
function twHasPassage(tribe, owner)
{
	if (!owner || owner == tribe)
		return true;
	if (TWConquest.isVassalPair(tribe, owner))
		return true;
	const treaties = g_GameData.tribes[tribe]?.getDiplomacy(owner).treaties || {};
	return !!(treaties.militaryAccess || treaties.alliance);
}
