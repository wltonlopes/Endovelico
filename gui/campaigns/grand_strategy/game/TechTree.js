/**
 * Árvore de tecnologias do mapa mundial.
 * Os dados ficam em campaigns/grand_strategy/data/technologies.json.
 */

/** Texto e formato de cada efeito, para a janela de tecnologias. */
const TECH_EFFECT_INFO = {
	"moveCap": { "label": "Stored movement points", "format": "plus" },
	"moveRegen": { "label": "Movement points per turn", "format": "plus" },
	"coastalNavigation": { "label": "Can enter coastal seas", "format": "flag" },
	"oceanNavigation": { "label": "Can enter oceans", "format": "flag" },
	"amphibious": { "label": "Can invade enemy land from the sea", "format": "flag" },
	"seaMoveDiscount": { "label": "Sea movement cost", "format": "minus" },
	"taxRate": { "label": "Tax income", "format": "percent" },
	"provinceIncome": { "label": "Gold per province", "format": "plus" },
	"coastalIncome": { "label": "Gold per coastal province", "format": "plus" },
	"tradeIncome": { "label": "Gold per trade treaty", "format": "percent" },
	"upkeepReduction": { "label": "Garrison upkeep", "format": "minusPercent" },
	"buildCost": { "label": "Construction cost", "format": "minusPercent" },
	"buildTime": { "label": "Construction time (turns)", "format": "minus" },
	"maxGenerals": { "label": "Maximum generals", "format": "plus" },
	"recruitCost": { "label": "General recruitment cost", "format": "minusPercent" },
	"happiness": { "label": "Province happiness per turn", "format": "plus" },
	"research": { "label": "Research speed", "format": "percent" },
	"garrisonCap": { "label": "Maximum garrison", "format": "plus" },
	"visionRange": { "label": "General vision range", "format": "plus" }
};

/** Valores sem tecnologia nenhuma. */
const TECH_BASE_VALUES = {
	"moveCap": 2,
	"moveRegen": 1,
	"garrisonCap": 6,
	"garrisonUpkeep": 15,
	"tradeIncome": 10,
	"generalCost": 500
};

var g_TechData;

function getTechData()
{
	if (g_TechData)
		return g_TechData;

	const data = Engine.ReadJSONFile("campaigns/grand_strategy/data/technologies.json") || {};
	data.eras = data.eras || [];
	data.branches = data.branches || [];
	data.technologies = data.technologies || [];
	data.research = data.research || { "base": 3, "perProvinceSqrt": 2, "perAcademy": 3 };

	data.byId = {};
	for (const tech of data.technologies)
	{
		tech.requires = tech.requires || [];
		tech.effects = tech.effects || {};
		data.byId[tech.id] = tech;
	}
	data.oceanSet = new Set(data.oceanProvinces || []);

	g_TechData = data;
	return data;
}

function getTechCost(tech)
{
	const era = getTechData().eras.find(e => e.id === tech.era);
	return tech.cost || era?.cost || 50;
}

function formatTechEffect(key, value)
{
	const info = TECH_EFFECT_INFO[key];
	if (!info)
		return `${key}: ${value}`;

	switch (info.format)
	{
	case "flag": return info.label;
	case "percent": return `${info.label} +${Math.round(value * 100)}%`;
	case "minusPercent": return `${info.label} -${Math.round(value * 100)}%`;
	case "minus": return `${info.label} -${value}`;
	default: return `${info.label} +${value}`;
	}
}

/** Se o código é uma província de mar aberto (exige Navegação Oceânica). */
function isOceanProvince(code)
{
	return getTechData().oceanSet.has(code);
}

/**
 * Estado das tecnologias de uma tribo.
 */
class TribeTechs
{
	constructor(tribe)
	{
		this.tribe = tribe;
		this.researched = [];
		this.current = undefined;
		this.progress = 0;
		this.effects = {};
	}

	Serialize()
	{
		return {
			"researched": this.researched,
			"current": this.current,
			"progress": this.progress
		};
	}

	Deserialize(data)
	{
		const techData = getTechData();
		this.researched = (data?.researched || []).filter(id => techData.byId[id]);
		this.current = techData.byId[data?.current] ? data.current : undefined;
		this.progress = data?.progress || 0;
		this.recalculate();
	}

	recalculate()
	{
		const techData = getTechData();
		this.effects = {};
		for (const id of this.researched)
			for (const key in techData.byId[id].effects)
				this.effects[key] = (this.effects[key] || 0) + techData.byId[id].effects[key];
	}

	/** Soma do efeito em todas as tecnologias pesquisadas. */
	get(key)
	{
		return this.effects[key] || 0;
	}

	has(id)
	{
		return this.researched.indexOf(id) !== -1;
	}

	// ------------------------------------------------ valores derivados

	getMoveCap() { return TECH_BASE_VALUES.moveCap + this.get("moveCap"); }
	getMoveRegen() { return TECH_BASE_VALUES.moveRegen + this.get("moveRegen"); }
	getGarrisonCap() { return TECH_BASE_VALUES.garrisonCap + this.get("garrisonCap"); }
	getTaxMultiplier() { return 1 + this.get("taxRate"); }
	getTradeIncome() { return Math.round(TECH_BASE_VALUES.tradeIncome * (1 + this.get("tradeIncome"))); }
	getGarrisonUpkeep() { return TECH_BASE_VALUES.garrisonUpkeep * Math.max(0, 1 - this.get("upkeepReduction")); }
	getBuildCostMultiplier() { return Math.max(0.2, 1 - this.get("buildCost")); }
	/** Desconto no recrutamento de batalhões (Total Warfield). */
	getRecruitCostMultiplier() { return Math.max(0.5, 1 - this.get("recruitCost")); }
	/** Desconto na manutenção dos exércitos (Total Warfield). */
	getArmyUpkeepMultiplier() { return Math.max(0.5, 1 - this.get("upkeepReduction")); }
	getRecruitCost() { return Math.round(TECH_BASE_VALUES.generalCost * Math.max(0.2, 1 - this.get("recruitCost"))); }
	getMaxGeneralsBonus() { return this.get("maxGenerals"); }
	getVisionRange() { return 1 + this.get("visionRange"); }

	/** Custo em movimentos para entrar numa província marítima. */
	getSeaMoveCost()
	{
		return Math.max(0.5, 1 - this.get("seaMoveDiscount"));
	}

	/**
	 * Se a tribo pode mover-se de `fromCode` para `toCode` segundo as
	 * tecnologias de navegação (não verifica diplomacia nem ligações).
	 */
	canNavigate(fromCode, toCode)
	{
		const from = g_GameData.provinces[fromCode];
		const to = g_GameData.provinces[toCode];
		if (!to)
			return false;

		if (to.isSea())
		{
			if (isOceanProvince(toCode))
				return !!this.get("oceanNavigation");
			return !!this.get("coastalNavigation");
		}

		// Do mar para terra de outra tribo: exige desembarque anfíbio.
		if (from?.isSea() && to.ownerTribe && to.ownerTribe !== this.tribe.code)
			return !!this.get("amphibious");

		return true;
	}

	/** Texto curto explicando por que não dá para navegar até lá. */
	getNavigationBlockReason(fromCode, toCode)
	{
		const to = g_GameData.provinces[toCode];
		if (!to || this.canNavigate(fromCode, toCode))
			return "";
		const techName = id => getTechData().byId[id]?.name || id;
		if (to.isSea())
			return "Requires " + techName(isOceanProvince(toCode) ? "navegacao_oceanica" : "construcao_naval");
		return "Requires " + techName("desembarque");
	}

	// ------------------------------------------------ pesquisa

	getResearchRate()
	{
		const research = getTechData().research;
		const provinces = this.tribe.controlledProvinces.length;
		let academies = 0;
		if (research.academyBuilding)
			for (const code of this.tribe.controlledProvinces)
				academies += (g_GameData.provinces[code]?.buildings || []).filter(b => b === research.academyBuilding).length;

		const base = research.base + research.perProvinceSqrt * Math.sqrt(provinces) + research.perAcademy * academies;
		return Math.round(base * (1 + this.get("research")) * 10) / 10;
	}

	/**
	 * Estado de uma tecnologia: "researched", "researching",
	 * "available" ou "locked".
	 */
	getStatus(id)
	{
		if (this.has(id))
			return "researched";
		if (this.current === id)
			return "researching";
		const tech = getTechData().byId[id];
		if (tech && tech.requires.every(req => this.has(req)))
			return "available";
		return "locked";
	}

	canResearch(id)
	{
		const status = this.getStatus(id);
		return status === "available";
	}

	/** Começa (ou troca para) uma pesquisa. Trocar perde o progresso. */
	startResearch(id)
	{
		if (!this.canResearch(id))
			return false;
		this.current = id;
		this.progress = 0;
		return true;
	}

	cancelResearch()
	{
		this.current = undefined;
		this.progress = 0;
	}

	/** Turnos restantes da pesquisa atual (ou de `id`). */
	getTurnsLeft(id = this.current)
	{
		const tech = getTechData().byId[id];
		if (!tech)
			return 0;
		const rate = Math.max(0.1, this.getResearchRate());
		const done = id === this.current ? this.progress : 0;
		return Math.max(1, Math.ceil((getTechCost(tech) - done) / rate));
	}

	getAvailable()
	{
		return getTechData().technologies.filter(tech => this.canResearch(tech.id));
	}

	/**
	 * Chamado uma vez por turno. Retorna a tecnologia concluída, se houver.
	 */
	processTurn(isAI)
	{
		if (!this.current && isAI)
			this.pickAIResearch();

		if (!this.current || !this.tribe.controlledProvinces.length)
			return undefined;

		const tech = getTechData().byId[this.current];
		this.progress += this.getResearchRate();
		if (this.progress < getTechCost(tech))
			return undefined;

		this.researched.push(tech.id);
		this.current = undefined;
		this.progress = 0;
		this.recalculate();

		if (isAI)
			this.pickAIResearch();

		return tech;
	}

	/** IA: prefere as eras mais baixas e navegação se tiver litoral. */
	pickAIResearch()
	{
		const available = this.getAvailable();
		if (!available.length)
			return;

		const minEra = Math.min(...available.map(t => t.era));
		let pool = available.filter(t => t.era === minEra);

		const coastal = this.tribe.controlledProvinces.some(code => g_GameData.provinces[code]?.isCoastal());
		if (coastal && randBool(0.5))
		{
			const naval = pool.filter(t => t.branch === "naval");
			if (naval.length)
				pool = naval;
		}
		this.startResearch(pickRandom(pool).id);
	}
}
