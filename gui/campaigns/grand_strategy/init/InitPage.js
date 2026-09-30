// Regiões da Terra para filtrar a província inicial (geradas a partir do centro de cada província).
const REGION_DEFINITIONS = [
	{ id: "world", label: "Whole World", provinceCodes: null },
	{ id: "europe", label: "Europe", provinceCodes: [
		"aestia", "aquitania", "armenia", "baetica", "basque", "bavaria", "bohemia", "britain", "brittany", "carpathia", "celtica", "central_gaul", "cisalpine_gaul", "corsica_sardinia", "crete", "crimeia", "dacia", "daoi", "denmark", "eire", "epirus", "finland", "friuli", "galicia", "germania", "hellas", "helvecia", "hercynia", "iberia", "ibossim", "illyria", "kardousioi", "kolkhis", "latium", "london", "lowlands", "lusitania", "milano", "moravia", "napolia", "noreia", "numantia", "pannonia", "pella", "peloponnese", "sarmata", "scandinavia", "sicilia", "silesia", "suebia", "tarraco", "thessalia", "thracia", "venedia", "volga"
	] },
	{ id: "middle_east", label: "Middle East and Anatolia", provinceCodes: [
		"arabia_felix", "arabia_magna", "assyria", "catar", "cyprus", "ionia", "judea", "kapadocia", "karmania", "lidia", "mazun", "media", "mesopotamia", "nabatean", "parthia", "persia", "siria", "yemen"
	] },
	{ id: "africa", label: "Africa", provinceCodes: [
		"aksum", "angola", "azania", "benin", "cameroon", "cape", "carthage", "congo_basin", "cyrenaica", "fezzan", "gaetuli", "ghana", "great_lakes_africa", "kalahari", "kenya", "kush", "lake_chad", "libya", "lower_egypt", "madagascar", "mali", "mauretania", "mozambique", "namibia", "niger", "nigeria", "nile_delta", "numidia", "punt", "senegambia", "somalia", "tanzania", "tripolitania", "uganda", "upper_egypt", "upper_niger", "upper_volta", "zambia", "zimbabwe"
	] },
	{ id: "central_asia", label: "Central Asia and the Steppe", provinceCodes: [
		"arachosia", "arctic_russia", "bactria", "karelia", "massagetae", "northwest_russia", "sogdia", "tibet", "transoxiana", "ural", "western_siberia", "wushu"
	] },
	{ id: "india", label: "India", provinceCodes: [
		"avanti", "champa", "gedrosia", "himalaia", "india", "indraprastha", "kalinga", "kuntala", "lanka", "magadha", "maldivas", "satyaputras", "saurashtra", "vanga", "vidarbha"
	] },
	{ id: "east_asia", label: "East and Southeast Asia", provinceCodes: [
		"amur", "arctic_siberia", "assam", "baekje", "bing", "borneo", "burmese", "celebes", "central_siberia", "chenla", "chukchi_coast", "chukotka", "donghu", "eastern_siberia", "emishi_lands", "far_east", "funan", "gansu", "goguryeo", "hawaii", "hokkaido", "iacutia", "java", "ji", "jing", "kamchatka", "kyushu", "liang", "luzon", "malaya", "maluku", "minyue", "mongolia", "nanyue", "philippines", "polinesia", "qing", "ryukyu", "siam", "sili", "silla_gaya", "sumatra", "suvarnabhumi", "wa", "xivi", "xu", "yi", "yilou", "yizhou", "you", "yu"
	] },
	{ id: "oceania", label: "Oceania", provinceCodes: [
		"arrernte", "eora", "kanaky", "kulin", "lutruwita", "new_guinea", "noongar", "te_ika_a_maui", "tewaipounamu", "yolngu"
	] },
	{ id: "north_america", label: "North America", provinceCodes: [
		"alaska", "antilles", "apalaches", "arisona", "ayiti", "baja_california_peninsula", "boriken", "california", "canada", "caxcanes", "central_mexican_plateau", "cubanacan", "florida", "great_lakes", "great_plains", "greenland_interior", "iceland", "inside_passage", "kalaallit_nunaat", "karankawa", "kebec", "maya_highlands", "maya_lowlands", "michoacan", "mississippi_delta", "mississippi_northern", "mississippi_southern", "mixteca", "nunavut", "oasisamerica", "oaxaca", "olmecatl", "plains_central", "rocky_mountains", "sonora", "taqamkuk", "totonacapan", "tovaangar", "west_coast_na", "xaymaca", "yarumela", "yucatan", "zacatecas"
	] },
	{ id: "south_america", label: "South America", provinceCodes: [
		"amazon_eastern", "amazon_western", "andean_central_coast", "andean_northern_coast", "andes_northern", "andes_southern", "andes_southern_coast", "caatinga", "central_andean", "central_plateau", "colombia", "far_northern_andes", "guianas", "marajo", "maranhao", "mojos", "nicaragua", "orinoco", "pampas", "pampas_southern", "panama", "paraguai", "pindorama", "puna", "quitu", "rapa_nui", "ushuaia", "wallmapu"
	] },
];

class InitPage
{
	constructor(closePageCallback)
	{
		this.closePageCallback = closePageCallback;
		this.civs = this.loadCivData();
		this.provinces = this.loadProvinces();
		this.provincesByCode = Object.fromEntries(
			this.provinces.filter(p => p.code && p.provinceType !== "sea").map(p => [p.code, p])
		);
		this.regionDefinitions = REGION_DEFINITIONS;

		// UI setup.

		Engine.GetGUIObjectByName("abortButton").caption="Back to Main Menu";
		Engine.GetGUIObjectByName("abortButton").onPress =
			() => this.closePageCallback({
				[Engine.openRequest]:
				{
					page: "page_pregame.xml"
				}
			});

		Engine.GetGUIObjectByName("campaignTitle").caption = "Grand Strategy";
		let desc = "Destined for glory? Ever since you were young, you've had the spirit of a warrior. A strong soul, and the right combination of will, luck and destiny to wield it effectively. Now your people look to you to guide them into the future, whatever may come.";
		desc += "\nWelcome to 0 A.D.'s Grand Strategy campaign, where you will take control of a country through the eyes of a Hero character. Fortify your lands, conquer your neighbors, and lead your civilization to victory.";
		Engine.GetGUIObjectByName("campaignDescription").caption = desc;

		Engine.GetGUIObjectByName("campaignImage").sprite = "stretched:campaigns/grand_strategy/art/banner.png";

	    Engine.GetGUIObjectByName("playerSettings").caption = "Customize your civilization";

		Engine.GetGUIObjectByName("civSelectLabel").caption = "Civilization:";
		this.civSelect = Engine.GetGUIObjectByName("civSelect");
		Engine.GetGUIObjectByName("heroNameLabel").caption = "Hero Name:";
		this.heroName = Engine.GetGUIObjectByName("heroName");
		Engine.GetGUIObjectByName("regionSelectLabel").caption = "Region:";
		this.regionSelect = Engine.GetGUIObjectByName("regionSelect");
		Engine.GetGUIObjectByName("provinceSelectLabel").caption = "Starting Province:";
		this.provinceSelect = Engine.GetGUIObjectByName("provinceSelect");
		Engine.GetGUIObjectByName("tribeNameLabel").caption = "Tribe Name:";
		this.tribeName = Engine.GetGUIObjectByName("tribeName");

		Engine.GetGUIObjectByName("gameSettings").caption = "Game Settings";
		Engine.GetGUIObjectByName("difficultySelectLabel").caption = "Difficulty:";
		this.difficultySelect = Engine.GetGUIObjectByName("difficultySelect");

		this.startButton = Engine.GetGUIObjectByName("startButton");
		this.startButton.caption = "Start Campaign";
		this.startButton.onPress = () => this.onStartRequest();

		this.civSelect.onSelectionChange = () => this.onCivPick();
		this.regionSelect.onSelectionChange = () => this.onRegionPick();

		this.civSelect.list = Object.values(this.civs).map(x => x.Name);
		this.civSelect.list_data = Object.values(this.civs).map(x => x.Code);
		this.regionSelect.list = this.regionDefinitions.map(x => x.label);
		this.regionSelect.list_data = this.regionDefinitions.map(x => x.id);
		this.regionSelect.selected = this.regionDefinitions.findIndex(x => x.id === "world");

		this.applyProvinceFilter();
		this.difficultySelect.list = ["Easy", "Medium", "Hard"];
		this.difficultySelect.list_data = ["easy", "medium", "hard"];
		this.difficultySelect.selected = 0;
		this.difficultySelect.onHoverChange = () => {
			this.difficultySelect.tooltip = [
				"AI players will range from Sandbox to Easy difficulty",
				"AI players will range from Easy to Hard difficulty",
				"AI players will range from Medium to Very Hard difficulty",
			]?.[this.difficultySelect.hovered] ?? "";
		};

		this.customHeroName = false;
		this.customTribeName = false;
		this.customProvince = false;
		this.heroName.onTextEdit = () => { this.customHeroName = true; };
		this.tribeName.onTextEdit = () => { this.customTribeName = true; };
		this.provinceSelect.onSelectionChange = () => { this.customProvince = true; };

		const page = Engine.GetGUIObjectByName("initPageWindow");
		const pageSize = page.getComputedSize();
		this.usePagination = (pageSize.bottom - pageSize.top) < 900;
		if (this.usePagination)
		{
			const size = Engine.GetGUIObjectByName("initSubPanel").size;
			size.rtop = 50;
			size.top = -250;
			size.rbottom = 50;
			size.bottom = 250;
			Engine.GetGUIObjectByName("initSubPanel").size = size;
			Engine.GetGUIObjectByName("page2").hidden = true;
			const p1size = Engine.GetGUIObjectByName("page1").size;
			p1size.bottom += 30;
			Engine.GetGUIObjectByName("page1").size = p1size;
			Engine.GetGUIObjectByName("page1Button").hidden = false;
			Engine.GetGUIObjectByName("page1Button").caption = "Start";
			Engine.GetGUIObjectByName("page1Button").onPress = () => {
				Engine.GetGUIObjectByName("page1").hidden = true;
				Engine.GetGUIObjectByName("page2").hidden = false;
				const p2size = Engine.GetGUIObjectByName("page2").size;
				p2size.top = 0;
				Engine.GetGUIObjectByName("page2").size = p2size;
			};
		}
		// Done at the bottom: in case of errors earlier things won't bug out every frame.
		page.onTick = () => this.render();
	}

	onCivPick()
	{
		if (this.provinceSelect.selected === -1 || !this.customProvince)
		{
			// Província típica da civ; troca para a região dela se preciso.
			const code = this.getDefaultStartingProvince(this.civSelect.list_data[this.civSelect.selected]);
			if (code && this.provinceSelect.list_data.indexOf(code) === -1)
			{
				const region = this.regionDefinitions.find(r => r.provinceCodes && r.provinceCodes.indexOf(code) !== -1);
				if (region)
				{
					this.regionSelect.selected = this.regionSelect.list_data.indexOf(region.id);
					this.applyProvinceFilter();
				}
			}
			const index = this.provinceSelect.list_data.indexOf(code);
			if (index !== -1)
				this.provinceSelect.selected = index;

			this.customProvince = false;
		}

		if (!this.heroName.caption || !this.customHeroName)
			this.heroName.caption =
				pickRandom(
					this.civs[
						this.civSelect.list_data[
							this.civSelect.selected
						]
					].AINames
				);

		if (!this.tribeName.caption || !this.customTribeName)
			this.tribeName.caption =
				this.civSelect.list[
					this.civSelect.selected
				];
	}

	getRegionDefinition(regionId)
	{
		return this.regionDefinitions.find(x => x.id === regionId) ?? this.regionDefinitions[0];
	}

	getProvincesForRegion(regionId)
	{
		const region = this.getRegionDefinition(regionId);
		if (!region)
			return [];

		if (region.id === "world" || !region.provinceCodes)
			return this.provinces.filter(p => p.provinceType !== "sea");

		return region.provinceCodes
			.map(code => this.provincesByCode[code])
			.filter(Boolean)
			.filter(p => p.provinceType !== "sea");
	}

	onRegionPick()
	{
		this.applyProvinceFilter();
	}

	applyProvinceFilter()
	{
		const regionId = this.regionSelect.list_data[this.regionSelect.selected] ?? "world";
		const filteredProvinces = this.getProvincesForRegion(regionId);
		const previousSelectedCode = this.provinceSelect.list_data[this.provinceSelect.selected] ?? null;

		this.provinceSelect.list = filteredProvinces.map(p => p.name);
		this.provinceSelect.list_data = filteredProvinces.map(p => p.code);

		if (filteredProvinces.length === 0)
		{
			this.provinceSelect.selected = -1;
			return;
		}

		const preferredCode = this.getDefaultStartingProvince(
			this.civSelect.list_data[this.civSelect.selected]
		);
		let targetIndex = filteredProvinces.findIndex(p => p.code === previousSelectedCode);
		if (targetIndex === -1)
			targetIndex = filteredProvinces.findIndex(p => p.code === preferredCode);
		if (targetIndex === -1)
			targetIndex = 0;

		this.provinceSelect.selected = targetIndex;
		this.customProvince = false;
	}

	render()
	{
		this.updateCanStart();
	}

	updateCanStart()
	{
		const feedback = Engine.GetGUIObjectByName("feedbackText");
		const ok = (() => {
			if (this.civSelect.selected === -1)
			{
				feedback.caption = "Select a civilization to play.";
				return false;
			}
			if (this.provinceSelect.selected === -1)
			{
				feedback.caption = "Select a province to start from.";
				return false;
			}
			if (this.heroName.caption === "")
			{
				feedback.caption = "Choose a name for your Hero.";
				return false;
			}
			if (this.tribeName.caption === "")
			{
				feedback.caption = "Choose a name for your Tribe.";
				return false;
			}
			return true;
		})();
		if (ok)
			feedback.caption = "";
		this.startButton.enabled = ok;
	}

onStartRequest()
{
    this.actuallyStart();
}

	actuallyStart()
	{
		// Writes g_GameData
		warn("CREATE GAME");

		GameData.createNewGame(
			{
				"civ": this.civSelect.list_data[this.civSelect.selected],
				"tribeName": this.tribeName.caption,
				"startProvince": this.provinceSelect.list_data[this.provinceSelect.selected],
			},
			this.difficultySelect.list_data[this.difficultySelect.selected]
		);

		warn("GAME CREATED");

		const run = CampaignRun.getCurrentRun();

		warn("RUN = " + run.filename);

		warn("Saving GameData");

		g_GameData.save(run);

		warn("Saved");

		warn("Serialized keys = " + Object.keys(run.data));

		this.closePageCallback({
			[Engine.openRequest]:
			{
				page: "campaigns/grand_strategy/page.xml",
				argument:
				{
					filename: run.filename
				}
			}
		});
	}

	loadCivData()
	{
		const civData = loadCivFiles(true); // Selectables only.
		translateObjectKeys(civData, ["Name", "Description", "History", "Special"]);
		return civData;
	}

	loadProvinces()
	{
		let geo =
			new GeoProvinceManager();

		return geo.data.features.map(
			f => f.properties
		);
	}

	// getDefaultStartingProvince(code)
	// {
	// 	return this.provinces.findIndex(x => x.code === {
	// 		"athen": "thessalia",
	// 		"brit": "london",
	// 		"cart": "carthage",
	// 		"gaul": "central_gaul",
	// 		"iber": "iberia",
	// 		"mace": "macedonia",
	// 		"pers": "phrygia",
	// 		"ptol": "nile_delta",
	// 		"rome": "latium",
	// 		"sele": "thrace",
	// 		"spart": "peloponnese",
	// 		}[code]);
	// 	}
	/**
	 * Código da província inicial sugerida para a civ: a maior província em
	 * que ela é a civ principal (ou, na falta, em que aparece).
	 */
	getDefaultStartingProvince(civ)
	{
		const land = this.provinces.filter(p => p.provinceType !== "sea" && Array.isArray(p.civs));
		const byArea = (a, b) => (b.area || 0) - (a.area || 0);
		const main = land.filter(p => p.civs[0] === civ).sort(byArea);
		if (main.length)
			return main[0].code;
		const any = land.filter(p => p.civs.indexOf(civ) !== -1).sort(byArea);
		return any.length ? any[0].code : undefined;
	}
	}

	var g_InitPage;

	function init(initData)
	{
		return new Promise(closePageCallback =>
		{
			g_InitPage =
				new InitPage(closePageCallback);

			g_InitPage.render();
		});
	}