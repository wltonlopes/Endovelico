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
				lines.push(`Construction: ${definition.name} (${province.buildProgress}/${definition.buildTime})`);
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
		for (let i = 0; i < 5; ++i)
		{
			const button = Engine.TryGetGUIObjectByName(`provinceBuildOption[${i}]`);
			if (!button)
				continue;
			if (i < defs.length)
			{
				const def = defs[i];
				button.hidden = false;
				button.caption = `${def.name} (${def.cost} gold / ${def.buildTime} turns)`;
				button.sprite = "stretched:session/icons/construction.png";
				button.enabled = true;
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
			{
				button.hidden = true;
			}
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
			`Owner: ${g_GameData.tribes?.[province.ownerTribe]?.getName() || "No-one"}\n`;

		if (infoLevel >= 1)
			str += `Garrison strength: ${province.garrison}\n`;

		if (infoLevel >= 2)
		{
			const structures = province.getBuildingNames();
			str += `Balance: ${province.getBalance()}\n`;
			str += `Damage Bonus: ${province.getDamageBonus()}\n`;
			str += `Structures: ${structures.length ? structures.join(", ") : "None"}\n`;
			if (province.buildQueue.length)
				str += `Construction: ${province.getConstructionStatusText()}\n`;
		}

		str += `\nGenerals: ${tribe.generals.length}/${tribe.maxGenerals}\n`;
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

		const trainBtn = Engine.TryGetGUIObjectByName("trainGeneral");
		if (!trainBtn)
			return;

		trainBtn.hidden = true;
		const GENERAL_COST = 500;

		if (this.menu.selectedProvince === tribe.getCapital())
		{
			trainBtn.hidden = false;
			trainBtn.caption = `Train General (${GENERAL_COST})`;
			trainBtn.enabled = tribe.money >= GENERAL_COST && tribe.generals.length < tribe.maxGenerals;
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
