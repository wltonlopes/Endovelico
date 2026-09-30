/**
 * Battle Mode: tela de escolha do mapa e dos exércitos iniciais.
 *
 * - Mapas: mapas aleatórios padrão do 0 A.D. listados em
 *   simulation/data/battle_mode/battle_maps.json.
 * - Unidades e custos: simulation/data/battle_mode/army_catalog.json.
 * - A partida é sempre você (jogador 1) contra a IA (jogador 2). Vence quem
 *   eliminar todas as unidades do outro ou segurar mais da metade dos pontos
 *   de controle pelo tempo escolhido. O trigger maps/scripts/BattleMode.js
 *   troca as bases iniciais pelos exércitos e comanda a IA; os reforços
 *   entram pela borda do mapa mais próxima de cada jogador.
 */

const g_BattleMapsList = "simulation/data/battle_mode/battle_maps.json";
const g_BattleCatalogPath = "simulation/data/battle_mode/army_catalog.json";
const g_BattleTriggerScript = "scripts/BattleMode.js";
const g_BattleHoldTimes = [60, 120, 180, 300];
const g_BattleDefaultHoldTime = 120;
const g_BattleRowHeight = 40;
const g_BattleRowGap = 4;
const g_AIDifficulties = [
	translateWithContext("aiDiff", "Sandbox"),
	translateWithContext("aiDiff", "Very Easy"),
	translateWithContext("aiDiff", "Easy"),
	translateWithContext("aiDiff", "Medium"),
	translateWithContext("aiDiff", "Hard"),
	translateWithContext("aiDiff", "Very Hard")
];

var g_BattleModePage;

function init(data)
{
	return new Promise(closePageCallback => {
		g_BattleModePage = new BattleModePage(closePageCallback);
	});
}

class BattleModePage
{
	constructor(closePageCallback)
	{
		this.closePageCallback = closePageCallback;
		this.catalog = Engine.ReadJSONFile(g_BattleCatalogPath);
		this.civData = loadCivData(true, false);
		this.civs = Object.keys(this.catalog.Civs).filter(civ => this.civData[civ]);
		this.unitData = {};

		// Lado 0 = você, lado 1 = inimigo.
		this.sides = [
			this.newSide(this.civs[0]),
			this.newSide(this.civs[1] || this.civs[0])
		];
		this.activeSide = 0;
		this.autoFill(1);

		this.setupMaps();
		this.setupControls();
		this.render();
	}

	newSide(civ)
	{
		return {
			"civ": civ,
			"budget": this.catalog.DefaultBudget,
			"counts": {}
		};
	}

	// ------------------------------------------------ mapas

	setupMaps()
	{
		const list = Engine.ReadJSONFile(g_BattleMapsList)?.Maps || [];
		this.maps = list.filter(path => Engine.FileExists(path + ".json")).map(path => {
			const data = Engine.ReadJSONFile(path + ".json");
			return {
				"path": path,
				"name": translate(data?.settings?.Name || path.split("/").pop()),
				"description": translate(data?.settings?.Description || ""),
				"preview": data?.settings?.Preview
			};
		}).sort((a, b) => a.name.localeCompare(b.name));

		// Previews são quadrados: ajusta a área para não esticar a imagem.
		const preview = Engine.GetGUIObjectByName("mapPreview");
		const box = preview.getComputedSize();
		const side = Math.min(box.right - box.left, box.bottom - box.top);
		const parent = preview.parent.getComputedSize();
		const left = Math.round((parent.right - parent.left - side) / 2);
		const top = Math.round(box.top - parent.top);
		preview.size = left + " " + top + " " + (left + side) + " " + (top + side);

		const mapList = Engine.GetGUIObjectByName("mapList");
		mapList.list = this.maps.map(map => map.name);
		mapList.list_data = this.maps.map(map => map.path);
		mapList.onSelectionChange = () => this.renderMap();
		if (this.maps.length)
			mapList.selected = 0;

		const sizes = g_Settings.MapSizes;
		const mapSize = Engine.GetGUIObjectByName("mapSize");
		mapSize.list = sizes.map(size => size.Name);
		mapSize.list_data = sizes.map(size => size.Tiles);
		mapSize.selected = Math.max(0, sizes.findIndex(size => size.Tiles == 256));
	}

	renderMap()
	{
		const map = this.maps[Engine.GetGUIObjectByName("mapList").selected];
		Engine.GetGUIObjectByName("mapDescription").caption = map ? map.description : "";
		Engine.GetGUIObjectByName("mapPreview").sprite = map && map.preview ?
			"stretched:session/icons/mappreview/" + map.preview : "";
		this.renderStatus();
	}

	// ------------------------------------------------ controles

	setupControls()
	{
		Engine.GetGUIObjectByName("tabPlayer").onPress = () => this.selectSide(0);
		Engine.GetGUIObjectByName("tabEnemy").onPress = () => this.selectSide(1);

		const civSelect = Engine.GetGUIObjectByName("civSelect");
		civSelect.list = this.civs.map(civ => this.civData[civ].Name);
		civSelect.list_data = this.civs;
		civSelect.onSelectionChange = () => {
			const side = this.sides[this.activeSide];
			const civ = this.civs[civSelect.selected];
			if (!civ || civ == side.civ)
				return;
			side.civ = civ;
			side.counts = {};
			if (this.activeSide == 1)
				this.autoFill(1);
			this.render();
		};

		const budgetSelect = Engine.GetGUIObjectByName("budgetSelect");
		budgetSelect.list = this.catalog.Budgets.map(budget => sprintf(translate("%(points)s points"), { "points": budget }));
		budgetSelect.list_data = this.catalog.Budgets;
		budgetSelect.onSelectionChange = () => {
			const side = this.sides[this.activeSide];
			const budget = this.catalog.Budgets[budgetSelect.selected];
			if (budget === undefined || budget == side.budget)
				return;
			side.budget = budget;
			// Ao reduzir o saldo, tira unidades até caber.
			this.trimToBudget(side);
			if (this.activeSide == 1)
				this.autoFill(1);
			this.render();
		};

		Engine.GetGUIObjectByName("autoFillButton").onPress = () => {
			this.autoFill(this.activeSide);
			this.render();
		};
		Engine.GetGUIObjectByName("clearButton").onPress = () => {
			this.sides[this.activeSide].counts = {};
			this.render();
		};

		// Duas colunas: as linhas pares à esquerda, as ímpares à direita.
		for (let i = 0; i < this.rowCount(); ++i)
		{
			const top = Math.floor(i / 2) * (g_BattleRowHeight + g_BattleRowGap);
			Engine.GetGUIObjectByName("unitRow[" + i + "]").size = i % 2 ?
				"50%+3 " + top + " 100% " + (top + g_BattleRowHeight) :
				"0 " + top + " 50%-3 " + (top + g_BattleRowHeight);
			Engine.GetGUIObjectByName("unitMinus[" + i + "]").onPress = () => this.changeCount(i, -1);
			Engine.GetGUIObjectByName("unitPlus[" + i + "]").onPress = () => this.changeCount(i, +1);
		}

		const holdTime = Engine.GetGUIObjectByName("holdTime");
		holdTime.list = g_BattleHoldTimes.map(seconds => sprintf(translatePlural("%(min)s minute", "%(min)s minutes", seconds / 60), { "min": seconds / 60 }));
		holdTime.list_data = g_BattleHoldTimes;
		holdTime.selected = g_BattleHoldTimes.indexOf(g_BattleDefaultHoldTime);

		const aiDifficulty = Engine.GetGUIObjectByName("aiDifficulty");
		aiDifficulty.list = g_AIDifficulties;
		aiDifficulty.list_data = g_AIDifficulties.map((name, i) => i);
		aiDifficulty.selected = 3;

		Engine.GetGUIObjectByName("backButton").onPress = () => this.closePageCallback({
			[Engine.openRequest]: { "page": "page_pregame.xml" }
		});
		Engine.GetGUIObjectByName("startButton").onPress = () => this.startBattle();
	}

	rowCount()
	{
		let count = 0;
		while (Engine.TryGetGUIObjectByName("unitRow[" + count + "]"))
			++count;
		return count;
	}

	selectSide(side)
	{
		this.activeSide = side;
		this.render();
	}

	// ------------------------------------------------ exército

	catalogFor(civ)
	{
		const order = this.catalog.Categories.map(category => category.Id);
		return (this.catalog.Civs[civ] || [])
			.filter(entry => Engine.TemplateExists(entry.Template))
			.sort((a, b) => order.indexOf(a.Category) - order.indexOf(b.Category));
	}

	getUnitData(entry)
	{
		const template = entry.Template;
		if (!this.unitData[template])
		{
			const identity = Engine.GetTemplate(template)?.Identity || {};
			this.unitData[template] = {
				"name": translate(entry.Name || identity.SpecificName || identity.GenericName || template.split("/").pop()),
				"icon": identity.Icon
			};
		}
		return this.unitData[template];
	}

	spent(side)
	{
		return this.catalogFor(side.civ).reduce((sum, entry) => sum + entry.Cost * (side.counts[entry.Template] || 0), 0);
	}

	canBuy(side, entry)
	{
		return (side.counts[entry.Template] || 0) < entry.Max && this.spent(side) + entry.Cost <= side.budget;
	}

	changeCount(row, delta)
	{
		const side = this.sides[this.activeSide];
		const entry = this.catalogFor(side.civ)[row];
		if (!entry)
			return;
		const count = side.counts[entry.Template] || 0;
		if (delta > 0 && !this.canBuy(side, entry))
			return;
		side.counts[entry.Template] = Math.max(0, count + delta);
		this.render();
	}

	trimToBudget(side)
	{
		const entries = this.catalogFor(side.civ).slice().sort((a, b) => b.Cost - a.Cost);
		while (this.spent(side) > side.budget)
		{
			const entry = entries.find(e => side.counts[e.Template] > 0);
			if (!entry)
				break;
			--side.counts[entry.Template];
		}
	}

	/**
	 * Exército aleatório equilibrado (pesos em AutoFillWeights do catálogo):
	 * mais infantaria, alguma cavalaria, poucos campeões, cerco e heróis.
	 */
	autoFill(sideIndex)
	{
		const side = this.sides[sideIndex];
		side.counts = {};
		const weights = this.catalog.AutoFillWeights || {};
		const weightOf = category => weights[category] !== undefined ? weights[category] : 1;
		const entries = this.catalogFor(side.civ);
		for (let guard = 0; guard < 200; ++guard)
		{
			const options = entries.filter(entry => this.canBuy(side, entry));
			if (!options.length)
				break;
			const total = options.reduce((sum, entry) => sum + weightOf(entry.Category), 0);
			let roll = Math.random() * total;
			const pick = options.find(entry => (roll -= weightOf(entry.Category)) < 0) || options[0];
			side.counts[pick.Template] = (side.counts[pick.Template] || 0) + 1;
		}
	}

	// ------------------------------------------------ desenho

	render()
	{
		const side = this.sides[this.activeSide];

		Engine.GetGUIObjectByName("tabPlayer").sprite = this.activeSide == 0 ? "StoneButtonGlow" : "StoneButton";
		Engine.GetGUIObjectByName("tabEnemy").sprite = this.activeSide == 1 ? "StoneButtonGlow" : "StoneButton";

		const civSelect = Engine.GetGUIObjectByName("civSelect");
		if (civSelect.selected != this.civs.indexOf(side.civ))
			civSelect.selected = this.civs.indexOf(side.civ);
		const budgetSelect = Engine.GetGUIObjectByName("budgetSelect");
		if (budgetSelect.selected != this.catalog.Budgets.indexOf(side.budget))
			budgetSelect.selected = this.catalog.Budgets.indexOf(side.budget);

		const spent = this.spent(side);
		Engine.GetGUIObjectByName("budgetText").caption = sprintf(translate("Points spent: %(spent)s / %(budget)s"), {
			"spent": spent,
			"budget": side.budget
		});
		Engine.GetGUIObjectByName("budgetBar").size = "0 0 " + Math.min(100, Math.round(spent / side.budget * 100)) + "% 100%";

		const categories = {};
		for (const category of this.catalog.Categories)
			categories[category.Id] = translate(category.Name);

		const entries = this.catalogFor(side.civ);
		for (let i = 0; i < this.rowCount(); ++i)
		{
			const entry = entries[i];
			Engine.GetGUIObjectByName("unitRow[" + i + "]").hidden = !entry;
			if (!entry)
				continue;
			const data = this.getUnitData(entry);
			const count = side.counts[entry.Template] || 0;
			Engine.GetGUIObjectByName("unitIcon[" + i + "]").sprite = data.icon ?
				"stretched:session/portraits/" + data.icon : "";
			Engine.GetGUIObjectByName("unitName[" + i + "]").caption = data.name;
			Engine.GetGUIObjectByName("unitInfo[" + i + "]").caption = categories[entry.Category] || entry.Category;
			Engine.GetGUIObjectByName("unitCost[" + i + "]").caption = sprintf(translate("%(cost)s pts"), { "cost": entry.Cost });
			Engine.GetGUIObjectByName("unitCount[" + i + "]").caption = String(count);
			Engine.GetGUIObjectByName("unitMinus[" + i + "]").enabled = count > 0;
			Engine.GetGUIObjectByName("unitPlus[" + i + "]").enabled = this.canBuy(side, entry);
		}

		this.renderStatus();
	}

	renderStatus()
	{
		const problem = this.getProblem();
		Engine.GetGUIObjectByName("statusText").caption = problem ? coloredText(problem, "255 150 110") : "";
		Engine.GetGUIObjectByName("startButton").enabled = !problem;
	}

	getProblem()
	{
		if (!this.maps || !this.maps.length)
			return translate("No maps listed in simulation/data/battle_mode/battle_maps.json.");
		if (Engine.GetGUIObjectByName("mapList").selected < 0)
			return translate("Choose a map.");
		if (!this.spent(this.sides[0]))
			return translate("Your army is empty.");
		if (!this.spent(this.sides[1]))
			return translate("The enemy army is empty.");
		return undefined;
	}

	// ------------------------------------------------ início da partida

	armyFor(side)
	{
		return this.catalogFor(side.civ)
			.filter(entry => side.counts[entry.Template] > 0)
			.map(entry => ({
				"template": entry.Template,
				"category": entry.Category,
				"count": side.counts[entry.Template]
			}));
	}

	startBattle()
	{
		if (this.getProblem())
			return;

		const map = this.maps[Engine.GetGUIObjectByName("mapList").selected];
		const mapSize = Engine.GetGUIObjectByName("mapSize");
		const difficulty = Engine.GetGUIObjectByName("aiDifficulty").selected;

		const gameSettings = new GameSettings().init();
		gameSettings.map.setType("random");
		gameSettings.map.selectMap(map.path);
		gameSettings.mapSize.setSize(+mapSize.list_data[mapSize.selected]);
		gameSettings.playerCount.setNb(2);
		gameSettings.playerCiv.setValue(0, this.sides[0].civ);
		gameSettings.playerCiv.setValue(1, this.sides[1].civ);
		gameSettings.playerAI.set(1, {
			"bot": "petra",
			"difficulty": difficulty,
			"behavior": "aggressive"
		});
		// Sem nômade: o mapa põe cada jogador na posição planejada; o trigger
		// remove a base e cria o exército ali.
		gameSettings.nomad.setEnabled(false);
		// Duas formas de vencer: eliminar o inimigo ou segurar a maioria dos
		// pontos de controle.
		gameSettings.victoryConditions.fromList(["conquest_units", "control_points"]);
		gameSettings.triggerScripts.customScripts.add(g_BattleTriggerScript);
		gameSettings.battleMode.setValue({
			"armies": {
				"1": this.armyFor(this.sides[0]),
				"2": this.armyFor(this.sides[1])
			},
			// Pontos não gastos viram pontos de reforço na partida.
			"reinforcements": {
				"1": this.sides[0].budget - this.spent(this.sides[0]),
				"2": this.sides[1].budget - this.spent(this.sides[1])
			},
			"aiAttack": true,
			"controlPoints": {
				"holdTime": g_BattleHoldTimes[Engine.GetGUIObjectByName("holdTime").selected] || g_BattleDefaultHoldTime
			}
		});

		const playerAssignments = {
			"local": {
				"player": 1,
				"name": Engine.ConfigDB_GetValue("user", "playername.singleplayer") || Engine.GetSystemUsername()
			}
		};
		gameSettings.launchGame(playerAssignments, true);

		this.closePageCallback({
			[Engine.openRequest]: {
				"page": "page_loading.xml",
				"argument": {
					"attribs": gameSettings.finalizedAttributes,
					"playerAssignments": playerAssignments
				}
			}
		});
	}
}
