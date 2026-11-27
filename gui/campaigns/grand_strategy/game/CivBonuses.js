/**
 * Bônus de civilização no mapa de campanha.
 *
 * As batalhas de campo são partidas normais, então os bônus de unidades e de
 * equipe de cada civ (auras, simulation/components/HiberBonuses.js) já valem
 * lá. Aqui ficam as versões estratégicas dos bônus econômicos e de heróis.
 *
 * Hibérnios (hiber), com o gado medido pelas fazendas: cada fazenda (farmland)
 * das províncias da tribo conta como 5 cabeças, até 50.
 *  - Crech (redadas de gado): +2 de ouro por cabeça por turno.
 *  - Leis de Brehon: pesquisa +25% (as tecnologias custam 20% menos).
 *  - Imposto Bórana: recrutamento -0,5% por cabeça (até -25%).
 *  - Renda em gado: construção -0,5% por cabeça (até -25%).
 *  - Curadmír (porção do herói): o general ganha +0,5% de força na batalha a
 *    cada 10 inimigos abatidos, até +20%.
 */
const TW_CIV_BONUSES = {
	"hiber": {
		"cattlePerFarm": 5,
		"maxCattle": 50,
		"goldPerCattle": 2,
		"techs": { "research": 0.25 },
		"cattleTechs": { "recruitCost": 0.005, "buildCost": 0.005 },
		"heroBattlePerKills": [10, 0.005],
		"heroBattleMax": 0.2
	}
};

/** Texto dos bônus, para as janelas da campanha. */
const TW_CIV_BONUS_TEXT = {
	"hiber": [
		"Cattle raids (Crech): +2 gold per head of cattle per turn (5 heads per farmland, up to 50).",
		"Brehon laws: research +25%.",
		"Bórana tax: recruitment -0.5% per head of cattle.",
		"Rent in cattle: construction -0.5% per head of cattle.",
		"The hero's portion (Curadmír): generals +0.5% battle strength per 10 enemies killed (up to +20%)."
	]
};

function twCivOf(tribe)
{
	return tribe && (tribe.civ || (typeof tribe.getCiv == "function" && tribe.getCiv()));
}

/** Cabeças de gado da tribo (fazendas das províncias controladas). */
function twCivCattle(tribe)
{
	const bonus = TW_CIV_BONUSES[twCivOf(tribe)];
	if (!bonus || !bonus.cattlePerFarm || typeof g_GameData == "undefined")
		return 0;
	let farms = 0;
	for (const code of tribe.controlledProvinces || [])
	{
		const province = g_GameData.provinces[code];
		if (province)
			farms += province.buildings.filter(id => id == "farmland").length;
	}
	return Math.min(bonus.maxCattle, farms * bonus.cattlePerFarm);
}

/** Parte do efeito `key` das tecnologias que vem da civilização. */
function twCivTechBonus(tribe, key)
{
	const bonus = TW_CIV_BONUSES[twCivOf(tribe)];
	if (!bonus)
		return 0;
	let value = bonus.techs?.[key] || 0;
	if (bonus.cattleTechs?.[key])
		value += bonus.cattleTechs[key] * twCivCattle(tribe);
	return value;
}

/** Ouro extra por turno vindo da civilização. */
function twCivIncome(tribe)
{
	const bonus = TW_CIV_BONUSES[twCivOf(tribe)];
	return bonus && bonus.goldPerCattle ? Math.round(bonus.goldPerCattle * twCivCattle(tribe)) : 0;
}

/** Depois de uma batalha: o general ganha força pelos inimigos abatidos. */
function twCivAfterBattle(hero, enemiesKilled)
{
	if (!hero || !enemiesKilled)
		return;
	const bonus = TW_CIV_BONUSES[twCivOf(g_GameData.tribes[hero.tribe])];
	if (!bonus || !bonus.heroBattlePerKills)
		return;
	const [kills, gain] = bonus.heroBattlePerKills;
	// bonuses pode ser o mesmo objeto para todos os generais da civ (heroes/<civ>.json): copia.
	const bonuses = Object.assign({}, hero.bonuses);
	bonuses.kills = (bonuses.kills || 0) + enemiesKilled;
	bonuses.battle = Math.min(bonus.heroBattleMax, Math.floor(bonuses.kills / kills) * gain);
	hero.bonuses = bonuses;
}

/** Tooltip com os bônus da civilização da tribo (vazio se não tiver). */
function twCivBonusTooltip(tribe)
{
	const lines = TW_CIV_BONUS_TEXT[twCivOf(tribe)];
	if (!lines)
		return "";
	const cattle = TW_CIV_BONUSES[twCivOf(tribe)].cattlePerFarm ? "\nCattle now: " + twCivCattle(tribe) + " heads" : "";
	return lines.map(line => "• " + line).join("\n") + cattle;
}
