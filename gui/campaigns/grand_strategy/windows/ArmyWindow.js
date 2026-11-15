/**
 * Janela do exército (Total Warfield): ícones dos batalhões do general
 * selecionado (com soldados, barra de força e estrelas de nível) e das
 * unidades que a província onde ele está pode recrutar (com custo; as
 * indisponíveis ficam em cinza com cadeado e o motivo no tooltip).
 *
 * Clique: seleciona e mostra os detalhes. Duplo clique ou botão direito
 * num recruta: recruta direto.
 */
var TW_ARMY_SLOT_WIDTH = 82;
var TW_ARMY_SLOT_HEIGHT = 98;
var TW_ARMY_COLUMNS = 5;

class ArmyWindow
{
	constructor(menu)
	{
		this.menu = menu;
		this.window = Engine.GetGUIObjectByName("armyWindow");
		this.detail = Engine.GetGUIObjectByName("armyDetail");
		this.message = "";
		this.selectedBattalion = -1;
		this.selectedRecruit = -1;
		this.options = [];

		Engine.GetGUIObjectByName("armyClose").onPress = () => this.close();
		Engine.GetGUIObjectByName("armyRecruit").onPress = () => this.recruit(this.selectedRecruit);
		Engine.GetGUIObjectByName("armyDisband").onPress = () => this.disband();

		for (let i = 0; i < 12; ++i)
		{
			const slot = Engine.GetGUIObjectByName(`armyBattalionSlot[${i}]`);
			slot.size = this.slotSize(i);
			slot.onPress = () => {
				this.selectedBattalion = i;
				this.selectedRecruit = -1;
				this.refresh();
			};
		}
		for (let i = 0; i < 20; ++i)
		{
			const slot = Engine.GetGUIObjectByName(`armyRecruitSlot[${i}]`);
			slot.size = this.slotSize(i);
			slot.onPress = () => {
				this.selectedRecruit = i;
				this.selectedBattalion = -1;
				this.refresh();
			};
			slot.onDoublePress = () => this.recruit(i);
			slot.onMouseRightPress = () => this.recruit(i);
		}
	}

	slotSize(i)
	{
		const x = (i % TW_ARMY_COLUMNS) * TW_ARMY_SLOT_WIDTH;
		const y = Math.floor(i / TW_ARMY_COLUMNS) * TW_ARMY_SLOT_HEIGHT;
		return `${x} ${y} ${x + TW_ARMY_SLOT_WIDTH - 6} ${y + TW_ARMY_SLOT_HEIGHT - 6}`;
	}

	static portrait(unit)
	{
		return unit && unit.icon ? "session/portraits/" + unit.icon : "session/portraits/units/default.png";
	}

	isOpen()
	{
		return !this.window.hidden;
	}

	open()
	{
		this.message = "";
		this.selectedBattalion = -1;
		this.selectedRecruit = -1;
		this.window.hidden = false;
		this.refresh();
	}

	close()
	{
		this.window.hidden = true;
	}

	refresh()
	{
		const hero = g_GameData.playerHero;
		if (!hero)
			return;
		const tribe = g_GameData.tribes[g_GameData.playerTribe];
		const province = g_GameData.provinces[hero.location];
		const home = province.ownerTribe == hero.tribe;

		Engine.GetGUIObjectByName("armyTitle").caption = (hero.title || "General") + " — " + province.getName();
		Engine.GetGUIObjectByName("armySummary").caption =
			hero.getArmySummary() + "   Upkeep: " + twArmyUpkeep(hero.battalions) + " gold/turn   Treasury: " + Math.floor(tribe.money) + " gold" +
			(home ? "   " + TW_LEVEL_NAMES[province.getSettlementLevel()] + ", population " + Math.round(province.population) : "");
		if (hero.drilling)
			Engine.GetGUIObjectByName("armySummary").caption += "   " + coloredText("Drilling: +" + hero.drilling + " xp/turn", "150 220 150");
		else if (home)
			Engine.GetGUIObjectByName("armySummary").caption += "   " + coloredText("Stay here a turn to drill (+" + twDrillRate(province) + " xp)", "170 170 170");
		Engine.GetGUIObjectByName("armyRecruitTitle").caption = home ? "Recruit in " + province.getName() :
			coloredText("Recruit (only in your own provinces)", "170 170 170");

		this.selectedBattalion = Math.min(this.selectedBattalion, hero.battalions.length - 1);
		for (let i = 0; i < 12; ++i)
		{
			const slot = Engine.GetGUIObjectByName(`armyBattalionSlot[${i}]`);
			const battalion = hero.battalions[i];
			slot.hidden = !battalion;
			if (!battalion)
				continue;
			const unit = twUnit(battalion.civ, battalion.key);
			const size = unit ? unit.size : battalion.strength;
			const level = twBattalionLevel(battalion);
			Engine.GetGUIObjectByName(`armyBattalionIcon[${i}]`).sprite = "stretched:" + ArmyWindow.portrait(unit);
			Engine.GetGUIObjectByName(`armyBattalionSelected[${i}]`).hidden = this.selectedBattalion != i;
			// Estrelas de nível e, ao lado, a inicial de cada acompanhante.
			const marks = (battalion.upgrades || []).map(kind => ({ "priest": "P", "high_priest": "H", "musician": "M", "standard": "S" })[kind] || "+").join("");
			Engine.GetGUIObjectByName(`armyBattalionStars[${i}]`).caption = (marks ? coloredText(marks, "160 210 255") + " " : "") + (level ? "*".repeat(level) : "");
			Engine.GetGUIObjectByName(`armyBattalionBar[${i}]`).size = `0 0 ${Math.round(100 * battalion.strength / Math.max(1, size))}% 100%`;
			Engine.GetGUIObjectByName(`armyBattalionText[${i}]`).caption = battalion.strength + "/" + size;
			slot.tooltip = unit ? this.describeUnit(unit) + "\nSoldiers " + battalion.strength + "/" + size +
				", experience " + (battalion.xp || 0) + " (level " + level + ")" +
				((battalion.upgrades || []).length ? "\nWith: " + battalion.upgrades.map(k => TW_ATTACHMENT_NAMES[k] || k).join(", ") : "") : battalion.key;
		}

		this.options = home ? twRecruitOptions(province, tribe) : [];
		this.selectedRecruit = Math.min(this.selectedRecruit, this.options.length - 1);
		for (let i = 0; i < 20; ++i)
		{
			const slot = Engine.GetGUIObjectByName(`armyRecruitSlot[${i}]`);
			const option = this.options[i];
			slot.hidden = !option;
			if (!option)
				continue;
			const affordable = tribe.money >= option.cost;
			Engine.GetGUIObjectByName(`armyRecruitIcon[${i}]`).sprite = (option.unavailable ? "grayscale:" : "") + "stretched:" + ArmyWindow.portrait(option.unit);
			Engine.GetGUIObjectByName(`armyRecruitLock[${i}]`).hidden = !option.unavailable;
			Engine.GetGUIObjectByName(`armyRecruitSelected[${i}]`).hidden = this.selectedRecruit != i;
			Engine.GetGUIObjectByName(`armyRecruitCost[${i}]`).caption = option.unavailable ? coloredText("locked", "170 170 170") :
				affordable ? option.cost + " gold" : coloredText(option.cost + " gold", "230 120 100");
			slot.tooltip = this.describeUnit(option.unit) + "\n" + (option.unavailable ?
				coloredText(option.unavailable, "230 130 110") :
				coloredText("Double-click or right-click to recruit.", "140 220 120"));
		}
		this.updateDetail();
	}

	static formationNames(unit)
	{
		const names = { "wedge": "Wedge", "crane_wing": "Crane Wing", "phalanx": "Phalanx", "syntagma": "Syntagma", "testudo": "Testudo",
			"shield_wall": "Shield Wall", "fish_scale": "Fish Scale", "volley_ranks": "Volley Ranks" };
		return (unit.formations || []).map(f => names[f] || f);
	}

	describeUnit(unit)
	{
		const s = unit.stats;
		return coloredText(unit.name + (unit.specificName ? " (" + unit.specificName + ")" : ""), "235 200 120") +
			" — " + (TW_CATEGORY_NAMES[unit.category] || unit.category) + ", " + unit.size + " soldiers\n" +
			"Health " + s.hp + ", armour " + s.armor +
			(s.melee ? ", melee " + s.melee + "/s" : "") + (s.ranged ? ", ranged " + s.ranged + "/s (range " + s.range + ")" : "") +
			", speed " + s.speed + "\n" +
			"Cost " + unit.cost + " gold, upkeep " + unit.upkeep + "/turn. Requires: " + TW_LEVEL_NAMES[unit.level] +
			(unit.building != "none" ? ", " + (g_GameData.getProvinceBuildingDefinitions().find(b => b.recruits == unit.building)?.name || unit.building) : "") +
			(ArmyWindow.formationNames(unit).length ? "\nFormations: " + ArmyWindow.formationNames(unit).join(", ") : "") +
			(unit.charge ? "\nCharges." : "") + (unit.brace ? " Braces against charges." : "") + (unit.stealth ? " Hides in woods and on high ground." : "");
	}

	updateDetail()
	{
		const hero = g_GameData.playerHero;
		let text;
		const battalion = this.selectedBattalion != -1 && hero.battalions[this.selectedBattalion];
		const option = this.selectedRecruit != -1 && this.options[this.selectedRecruit];
		if (battalion)
		{
			const unit = twUnit(battalion.civ, battalion.key);
			text = unit ? this.describeUnit(unit) + "\nSoldiers " + battalion.strength + "/" + unit.size +
				", experience " + (battalion.xp || 0) + " (level " + twBattalionLevel(battalion) + ")" : battalion.key;
		}
		else if (option)
			text = this.describeUnit(option.unit) + (option.unavailable ? "\n" + coloredText(option.unavailable, "230 130 110") : "");
		else
			text = "Select a battalion to inspect it, or a unit to recruit (double-click or right-click recruits at once). " +
				"Battalions in your own provinces replenish their losses every turn.";
		if (this.message)
			text += "\n" + coloredText(this.message, "255 200 110");
		this.detail.caption = text;

		Engine.GetGUIObjectByName("armyRecruit").enabled = !!option && !option.unavailable;
		Engine.GetGUIObjectByName("armyDisband").enabled = !!battalion;
		this.updateUpgrades(battalion);
	}

	/** Botões de melhoramento (acompanhantes) do batalhão selecionado. */
	updateUpgrades(battalion)
	{
		const hero = g_GameData.playerHero;
		const options = battalion ? twAttachmentOptions(hero, battalion) : [];
		for (let i = 0; i < 4; ++i)
		{
			const button = Engine.GetGUIObjectByName(`armyUpgrade[${i}]`);
			const option = options[i];
			button.hidden = !option;
			if (!option)
				continue;
			button.size = `${20 + i * 214} 100%-84 ${224 + i * 214} 100%-54`;
			const has = (battalion.upgrades || []).indexOf(option.kind) != -1;
			button.caption = has ? coloredText(option.name + " ✓", "150 220 150") : option.name + " (" + option.cost + ")";
			button.enabled = !option.unavailable;
			button.tooltip = coloredText(option.name + (option.unitName ? " — " + option.unitName : ""), "235 200 120") + "\n" +
				(TW_ATTACHMENT_HELP[option.kind] || "") + "\nCost " + option.cost + " gold, upkeep " + option.upkeep + "/turn." +
				(option.unavailable ? "\n" + coloredText(option.unavailable, "230 130 110") : "");
			button.onPress = () => {
				const result = twBuyAttachment(hero, battalion, option.kind);
				this.message = result === true ? option.name + " joins the battalion." : result;
				g_GameData.save();
				this.refresh();
			};
		}
	}

	recruit(index)
	{
		const option = this.options[index];
		if (!option)
			return;
		const result = twRecruit(g_GameData.playerHero, option.unit.key);
		this.message = result === true ? option.unit.name + " recruited." : result;
		g_GameData.save();
		this.refresh();
	}

	disband()
	{
		const hero = g_GameData.playerHero;
		const index = this.selectedBattalion;
		if (index == -1 || !hero.battalions[index])
			return;
		const battalion = hero.battalions.splice(index, 1)[0];
		// Os soldados voltam para a população da província.
		const province = g_GameData.provinces[hero.location];
		if (province.ownerTribe == hero.tribe)
			province.population += battalion.strength * 10;
		this.selectedBattalion = -1;
		this.message = "Battalion disbanded.";
		g_GameData.save();
		this.refresh();
	}
}
