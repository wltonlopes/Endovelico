class ProvinceDetailsWindow
{
	constructor(menu)
	{
		this.menu = menu;
		this.buildOptionsOpen = false;
		this.constructionPanelOpen = false;

		Engine.GetGUIObjectByName("provinceDetailsClose").onPress = () => this.close();
	}

	/**
	 * Fecha o painel (desseleciona a província). Clicar em qualquer
	 * província abre de novo.
	 */
	close()
	{
		this.menu.selectedProvince = -1;
		this.buildOptionsOpen = false;
		this.constructionPanelOpen = false;
		for (const name of ["provinceBuildPanel", "provinceConstructionPanel"])
		{
			const panel = Engine.TryGetGUIObjectByName(name);
			if (panel)
				panel.hidden = true;
		}
		Engine.GetGUIObjectByName("provinceDetails").hidden = true;
	}

	showConstructionPanel(province, panel, text, forceOpen = true)
	{
		if (!province || !panel || !text)
			return;

		const lines = [];
		const structures = province.getBuildingNames();
		if (structures.length)
			lines.push(`Structures: ${structures.join(", ")}`);
		else
			lines.push("Structures: None");

		if (province.buildQueue.length)
		{
			const definition = g_GameData.getProvinceBuildingData(province.buildQueue[0]);
			if (definition)
				lines.push(`Construction: ${definition.name} (${province.buildProgress}/${province.getBuildingTime(definition.id)})`);
		}
		else
			lines.push("Construction: None");

		text.caption = lines.join("\n");
		panel.hidden = !forceOpen;
		this.constructionPanelOpen = forceOpen;
	}

	showBuildOptions(province)
	{
		if (!province)
			return;

		const panel = Engine.TryGetGUIObjectByName("provinceBuildPanel");
		if (!panel)
			return;

		const defs = province.getBuildableStructures();
		const tribe = g_GameData.tribes[province.ownerTribe];
		for (let i = 0; i < 16; ++i)
		{
			const button = Engine.TryGetGUIObjectByName(`provinceBuildOption[${i}]`);
			if (!button)
				continue;
			button.size = `6 ${4 + i * 22} 100%-6 ${24 + i * 22}`;
			if (i < defs.length)
			{
				const def = defs[i];
				const cost = province.getBuildingCost(def.id);
				const allowed = province.canBuild(def.id);
				button.hidden = false;
				const needs = TW_LEVELS.indexOf(def.level || "village") > TW_LEVELS.indexOf(province.getSettlementLevel()) ?
					`a ${TW_LEVEL_NAMES[def.level]}` : g_GameData.getProvinceBuildingData(def.requires)?.name;
				button.caption = allowed ? `${def.name} (${cost} gold, ${province.getBuildingTime(def.id)} turns)` :
					coloredText(`${def.name} — needs ${needs}`, "150 150 150");
				button.tooltip = def.description || "";
				button.enabled = allowed && !province.buildQueue.length && !!tribe && tribe.money >= cost;
				button.onPress = () =>
				{
					if (province.startBuilding(def.id))
					{
						g_GameData.save();
						this.buildOptionsOpen = false;
						panel.hidden = true;
						this.display();
					}
				};
			}
			else
				button.hidden = true;
		}
		panel.hidden = false;
		this.buildOptionsOpen = true;
	}

	render()
	{
		this.display();
	}

	display()
	{
		if (this.menu.selectedProvince === -1 || !Engine.GetGUIObjectByName("tribeDetails").hidden)
		{
			Engine.GetGUIObjectByName("provinceDetails").hidden = true;
			return;
		}

		const province = g_GameData.provinces[this.menu.selectedProvince];
		const tribe = g_GameData.tribes[g_GameData.playerTribe];
		const infoLevel = province.getInfoLevel(g_GameData.playerTribe);

		Engine.GetGUIObjectByName("provinceDetails").hidden = false;

		let str = `Name: ${province.name}\n` +
			`Owner: ${g_GameData.tribes?.[province.ownerTribe]?.getName() || "No-one"}` +
			(g_GameData.tribes?.[province.ownerTribe]?.vassalOf ? ` (vassal of ${g_GameData.tribes[g_GameData.tribes[province.ownerTribe].vassalOf]?.getName()})` : "") + `\n`;

		if (!province.isSea())
			str += `${TW_LEVEL_NAMES[province.getSettlementLevel()]}, population ${Math.round(province.population)}` +
				(province.ownerTribe ? ` (${province.getGrowthRate() >= 0 ? "+" : ""}${province.getGrowthRate().toFixed(1)}%/turn)` : "") + "\n";
		if (!province.ownerTribe && !province.isSea())
			str += `Natives: ${province.getNativeCivs().map(civ => twCivName(civ)).join(", ")}\n`;
		const walls = province.getWallType();
		if (walls)
			str += `Walls: ${walls == "stone" ? "stone walls" : "palisade"}\n`;
		if (province.siege)
			str += coloredText(`Besieged by ${g_GameData.tribes[province.siege.tribe]?.getName() || province.siege.tribe} (turn ${province.siege.turns}, ${province.siege.rams} rams)`, "255 140 100") + "\n";
		if (infoLevel >= 1)
			str += `Garrison: ${province.garrison} battalions` + (province.getBuildingBonus("defense") ? `, defences +${province.getBuildingBonus("defense")}%` : "") + "\n";

		if (infoLevel >= 2)
		{
			const structures = province.getBuildingNames();
			str += `Balance: ${province.getBalance()}\n`;
			str += `Public order: ${Math.round(province.getHappiness())}\n`;
			if (typeof twProvinceMechanicsText == "function")
				str += twProvinceMechanicsText(province);
			str += `Structures: ${structures.length ? structures.join(", ") : "None"}\n`;
			if (province.buildQueue.length)
				str += `Construction: ${province.getConstructionStatusText()}\n`;
		}

		str += `\nGenerals: ${tribe.generals.length}/${tribe.getMaxGenerals()}\n`;
		str += `\n\n` + coloredText("Right-click the province to make actions", "green");

		Engine.GetGUIObjectByName("provinceDetailsText").caption = str;

		const ownerBtn = Engine.GetGUIObjectByName("provinceOwnerButton");
		if (province.ownerTribe && province.ownerTribe !== g_GameData.playerTribe)
		{
			ownerBtn.enabled = true;
			ownerBtn.onPress = () => this.menu.openDiplomacy(province.ownerTribe);

			const ownerTribe = g_GameData.tribes[province.ownerTribe];
			const civ = ownerTribe?.civ || ownerTribe?.data?.civ;
			ownerBtn.sprite = getCivEmblemSprite(civ);
		}
		else
		{
			ownerBtn.enabled = false;
			ownerBtn.sprite = getCivEmblemSprite(undefined);
		}

		const buildBtn = Engine.TryGetGUIObjectByName("provinceBuildButton");
		const buildPanel = Engine.TryGetGUIObjectByName("provinceBuildPanel");
		const constructionBtn = Engine.TryGetGUIObjectByName("provinceConstructionButton");
		const constructionPanel = Engine.TryGetGUIObjectByName("provinceConstructionPanel");
		const constructionText = Engine.TryGetGUIObjectByName("provinceConstructionPanelText");
		const constructionCloseBtn = Engine.TryGetGUIObjectByName("provinceConstructionCloseButton");
		if (constructionCloseBtn)
			constructionCloseBtn.onPress = () => { if (constructionPanel) { constructionPanel.hidden = true; this.constructionPanelOpen = false; } };
		if (buildPanel)
			buildPanel.hidden = !this.buildOptionsOpen || province.ownerTribe !== g_GameData.playerTribe;
		if (buildBtn)
		{
			buildBtn.hidden = province.ownerTribe !== g_GameData.playerTribe;
			if (constructionBtn)
				constructionBtn.hidden = province.ownerTribe !== g_GameData.playerTribe;
			if (province.ownerTribe === g_GameData.playerTribe)
			{
				buildBtn.caption = "Build Structure";
				buildBtn.onPress = () =>
				{
					this.showBuildOptions(province);
				};
				if (constructionBtn)
				{
					constructionBtn.onPress = () =>
					{
						if (constructionPanel && constructionText)
							this.showConstructionPanel(province, constructionPanel, constructionText, true);
					};
				}
			}
		}
		if (constructionPanel && constructionText)
		{
			if (this.constructionPanelOpen)
				this.showConstructionPanel(province, constructionPanel, constructionText, true);
			else
				constructionPanel.hidden = true;
		}

		// Especialização (game/zz_CampaignMechanics.js): cada clique passa para a próxima.
		const specBtn = Engine.TryGetGUIObjectByName("provinceSpecializeButton");
		if (specBtn)
		{
			const mine = province.ownerTribe === g_GameData.playerTribe && !province.isSea() && typeof twSpecialization == "function";
			specBtn.hidden = !mine;
			if (mine)
			{
				const current = twSpecialization(province);
				const next = TW_SPECIALIZATION_ORDER[(TW_SPECIALIZATION_ORDER.indexOf(current) + 1) % TW_SPECIALIZATION_ORDER.length];
				const block = twSpecializationBlock(province, tribe);
				specBtn.caption = `Specialization: ${TW_SPECIALIZATIONS[current].name}` + (block ? "" : ` → ${TW_SPECIALIZATIONS[next].name}`);
				specBtn.enabled = !block;
				specBtn.tooltip = TW_SPECIALIZATION_ORDER.map(id => (id == current ? "▶ " : "   ") + TW_SPECIALIZATIONS[id].name + ": " + TW_SPECIALIZATIONS[id].help).join("\n") +
					"\n\n" + (block ? coloredText(block, "230 130 110") : `Click to change to ${TW_SPECIALIZATIONS[next].name} (${TW_SPECIALIZATION_COST} gold).`);
				specBtn.onPress = () =>
				{
					if (twSetSpecialization(province, tribe, next) === true)
					{
						g_GameData.save();
						this.display();
						this.menu.render?.();
					}
				};
			}
		}

		const trainBtn = Engine.TryGetGUIObjectByName("trainGeneral");
		if (!trainBtn)
			return;

		trainBtn.hidden = true;
		const GENERAL_COST = tribe.techs.getRecruitCost();

		if (this.menu.selectedProvince === tribe.getCapital())
		{
			trainBtn.hidden = false;
			trainBtn.caption = `Train General (${GENERAL_COST})`;
			trainBtn.enabled = tribe.money >= GENERAL_COST && tribe.generals.length < tribe.getMaxGenerals();
			trainBtn.onPress = () =>
			{
				let hero = g_GameData.recruitGeneral(g_GameData.playerTribe);
				if (!hero)
					return;

				g_GameData.playerHero = hero;
				g_GameData.save();
				this.menu.centerScrollOnHero();
				this.menu.render();
			};
		}
	}
}
