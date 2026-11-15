/**
 */
var g_CampaignMenu = undefined;
class CampaignMenu extends AutoWatcher
{
	constructor(run, closePageCallback)
	{
		super("render");
		g_CampaignMenu = this;
		this.run = run;
		this.closePageCallback = closePageCallback;

		this.selectedProvince = -1;
		

		this.window = Engine.GetGUIObjectByName("campaignMenuWindow");
		this.window.onTick = () => this.onTick();
		Engine.GetGUIObjectByName("finishTurn").onPress = () => this.doFinishTurn();
		Engine.GetGUIObjectByName('backToMain').onPress = () => this.goBackToMainMenu();

		Engine.GetGUIObjectByName('loadSaveButton').onPress = () => this.openLoadSave(true);

		this.infoTicker = new InfoTicker();
		this.eventPanel = new EventPanel();
		this.windows = new CampaignWindows(this);

		Engine.GetGUIObjectByName("techTreeButton").onPress = () => this.windows.TechTree.toggle();
		Engine.GetGUIObjectByName("topResearch").onPress = () => this.windows.TechTree.open();

		Engine.GetGUIObjectByName("campaignMenuWindow").onMouseLeftPress = () => this.onBlur();
		Engine.GetGUIObjectByName("campaignMenuWindow").onMouseRightPress = () => this.onBlur();

		/*Engine.SetGlobalHotkey("grand_strategy.camera.left", "Down", () => { this.cameraX -= 5; });
		Engine.SetGlobalHotkey("grand_strategy.camera.right", "Down", () => { this.cameraX += 5; });
		Engine.SetGlobalHotkey("grand_strategy.camera.up", "Down", () => { this.cameraZ -= 5; });
		Engine.SetGlobalHotkey("grand_strategy.camera.down", "Down", () => { this.cameraZ += 5; });
		*/
		this.worldMap =
			Engine.GetGUIObjectByName(
				"worldMap"
			);
		this.cameraX = 0;
		this.cameraZ = 0;

		const size =
			this.window.getComputedSize();

		this.mouseX = size.right / 2;
		this.mouseY = size.bottom / 2;


		this.lastRender = Date.now();
		// Zoom do mapa: roda do mouse (no cursor) ou teclas +/- (no centro).
		// Começa em 100%, a metade do antigo fixo de 200%.
		this.zoom = 1.0;
		Engine.SetGlobalHotkey("camera.zoom.wheel.in", "Press", () => this.zoomBy(this.WHEEL_ZOOM_STEP));
		Engine.SetGlobalHotkey("camera.zoom.wheel.out", "Press", () => this.zoomBy(1 / this.WHEEL_ZOOM_STEP));
		Engine.SetGlobalHotkey("camera.zoom.in", "Press", () => this.zoomBy(this.KEY_ZOOM_STEP, true));
		Engine.SetGlobalHotkey("camera.zoom.out", "Press", () => this.zoomBy(1 / this.KEY_ZOOM_STEP, true));
		this.baseMap =
			Engine.GetGUIObjectByName(
				"campaignBaseMap"
			);
		this.worldMap =
			Engine.GetGUIObjectByName(
				"worldMap"
			);
		Engine.GetGUIObjectByName("backToMain").onPress =() => this.goBackToMainMenu();

		this.closePageCallback =
			closePageCallback;

		// Marcha animada, rotas, batalhas, cercos, estações (MapAnimator.js).
		this.animator = new TWMapAnimator(this);
	}

	// initialise()
	// {

	// 	if (this.run.data.gameData)
	// 		GameData.loadRun();

	// 	this.centerScrollOnHero();
	// 	this.infoTicker.initialise();

	// 	this.render();
	// }

	initialise()
	{

		if (this.run.data.gameData)
			GameData.loadRun();



		this.centerScrollOnHero();



		this.infoTicker.initialise();



		this.render();



		// Relatório da batalha de campo que acabou de ser jogada (e, depois
		// dele, o destino da província tomada).
		if (g_GameData.lastBattleReport)
		{
			this.windows.Battle.showReport(g_GameData.lastBattleReport);
			g_GameData.lastBattleReport = undefined;
		}
		else
			this.windows.Battle.showCapture();

		// Ao voltar de uma batalha a conquista pode ter completado uma condição.
		if (this.run.data.gameData && !g_GameData.checkGameOver())
			g_GameData.checkVictory();
	}

	goBackToMainMenu()
	{
		g_GameData.save();

		this.closePageCallback({
			[Engine.openRequest]:
			{
				page: "page_pregame.xml"
			}
		});
	}

	openLoadSave()
	{
		SwitchGuiPage("campaigns/grand_strategy/loadsave/page.xml", {
			"gameData": g_GameData.Serialize(),
		});
	}

	doFinishTurn()
	{
		this.displayContextualPanel(-1);
		Engine.GetGUIObjectByName("computingTurn").hidden = false;
	}

	onTick()
	{
		// TODO: unhack this.
		if (!Engine.GetGUIObjectByName("computingTurn").hidden)
		{
			if (g_GameData.doFinishTurn())
				this.onTurnComputationEnd();
			return;
		}
		this.render();
	}

	onTurnComputationEnd()
	{
		Engine.GetGUIObjectByName("computingTurn").hidden = true;
		// Relatórios do turno (sítios, rendições).
		if (g_GameData.lastBattleReport)
		{
			this.windows.Battle.showReport(g_GameData.lastBattleReport);
			g_GameData.lastBattleReport = undefined;
		}
		this.infoTicker.onTurnEnd();
		// Generais com ordem de marcha seguem andando (game/Routes.js).
		for (const message of twAdvancePlayerRoutes())
			this.infoTicker.panelData.addItem(sprintf("• Turn %s: ", g_GameData.turn) + message);
		this.windows.TechTree.refresh();

		if (!g_GameData.checkGameOver())
			g_GameData.checkVictory();
	}

	// centerScrollOnHero()
	// {
	// 	const province =
	// 		g_GameData.provinces[
	// 			g_GameData.playerHero.location
	// 		];

	// 	if (!province)
	// 		return;

	// 	const pos =
	// 		province.getHeroPos();
	// }
	centerScrollOnHero()
	{
		const province =
			g_GameData.provinces[
				g_GameData.playerHero.location
			];

		const pos =
			province.getHeroPos();


		this.cameraX =
			pos[0] -
			this.window.getComputedSize().right /
			(2 * this.zoom);

		this.cameraZ =
			pos[1] -
			this.window.getComputedSize().bottom /
			(2 * this.zoom);

		this.clampCamera();
	}

	/**
	 * Menor zoom em que o mapa (4096x2048) ainda cobre a tela inteira.
	 */
	getMinZoom()
	{
		const size = this.window.getComputedSize();
		return Math.max(size.right / this.MAP_WIDTH, size.bottom / this.MAP_HEIGHT);
	}

	/**
	 * Multiplica o zoom por `factor`, mantendo parado o ponto do mapa sob o
	 * cursor (ou sob o centro da tela, com `atScreenCenter`).
	 */
	zoomBy(factor, atScreenCenter = false)
	{
		// Com a árvore de tecnologias aberta o mapa fica parado.
		if (this.windows?.TechTree?.isOpen())
			return;

		const size = this.window.getComputedSize();
		const anchorX = atScreenCenter || this.mouseX === null ? size.right / 2 : this.mouseX;
		const anchorY = atScreenCenter || this.mouseY === null ? size.bottom / 2 : this.mouseY;

		const worldX = anchorX / this.zoom + this.cameraX;
		const worldZ = anchorY / this.zoom + this.cameraZ;

		this.zoom = Math.max(this.getMinZoom(), Math.min(this.MAX_ZOOM, this.zoom * factor));

		this.cameraX = worldX - anchorX / this.zoom;
		this.cameraZ = worldZ - anchorY / this.zoom;
		this.clampCamera();
	}

	/**
	 * Mantém a câmera dentro do mapa.
	 */
	clampCamera()
	{
		const size = this.window.getComputedSize();
		this.zoom = Math.max(this.getMinZoom(), Math.min(this.MAX_ZOOM, this.zoom));
		const maxX = Math.max(0, this.MAP_WIDTH - size.right / this.zoom);
		const maxZ = Math.max(0, this.MAP_HEIGHT - size.bottom / this.zoom);
		this.cameraX = Math.max(0, Math.min(maxX, this.cameraX));
		this.cameraZ = Math.max(0, Math.min(maxZ, this.cameraZ));
	}
	/**
	 * Triggered when pressing the map background.
	 */
	onBlur()
	{
		Engine.GetGUIObjectByName("contextPanel").hidden = true;
		this.selectedProvince = -1;
	}

	displayProvinceDetails()
	{
		this.windows.Province.display();
	}

	openDiplomacy(tribeCode)
	{
		this.windows.Diplomacy.open(tribeCode);
	}

	displayTribeDetails(tribeCode)
	{
		this.windows.Tribe.display(tribeCode);
	}

	displayHeroDetails()
	{
		this.windows.Hero.render();
	}

	displayContextualPanel(code)
	{
		this.windows.Context.display(code);
	}

	render()
	{
		const delta =
			Date.now() -
			this.lastRender;

		this.lastRender =
			Date.now();

		const SCROLL_SPEED =
			delta * 0.8 / this.zoom;

		this.animator.beginFrame();

		this.worldMap.size = this.toGUISize(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);
		this.baseMap.size = "0 0 100% 100%";
		this.renderMapTiles();

		this.renderTopBar();

		this.windows.render();

		const stats = g_CampaignStatistics?.GetData?.() || g_GameData?.statistics?.GetData?.() || {};
		const historyList = Engine.TryGetGUIObjectByName("campaignStatsList");
		if (historyList)
		{
			historyList.list = [];
			for (const entry of stats.timeline || [])
				historyList.list.push(`${entry.turn} - ${entry.text}`);
		}

		// Visão: província do general e vizinhas; a Cartografia aumenta o alcance.
		const visible = new Set();
		const visionRange = g_GameData.tribes[g_GameData.playerTribe].techs.getVisionRange();

		for (const hero of
			g_GameData.tribes[
				g_GameData.playerTribe
			].generals)
		{
			let frontier = [hero.location];
			visible.add(hero.location);
			for (let step = 0; step < visionRange; ++step)
			{
				const next = [];
				for (const code of frontier)
					for (const p of g_GameData.provinces[code]?.getLinks() || [])
						if (!visible.has(p))
						{
							visible.add(p);
							next.push(p);
						}
				frontier = next;
			}
		}
		// Update heros
		const generals =
			g_GameData.tribes[
				g_GameData.playerTribe
			].generals;

		this.renderGenerals();

		// Update provinces
		let i = 0;
		for (let code in g_GameData.provinces)
		{
			
			let province = g_GameData.provinces[code];
			if (!province.icon)
			{
				let icon = Engine.GetGUIObjectByName(`mapProvinceSprite[${i++}]`);
				icon.hidden = false;
				icon.parent.hidden = false;
				icon.onPress = () => { this.displayTribeDetails(-1); this.selectedProvince = province.code; };
				icon.onMouseRightPress = () => { this.displayContextualPanel(province.code); };
				icon.onMouseEnter = () => this.animator.setHover(province.code);
				icon.onMouseLeave = () => this.animator.clearHover(province.code);
				province.icon = icon;
				province.icon.z = province.data.provinceType == "sea" ? 1 : 10;
				province.icon.mouse_event_mask ="texture:campaigns/grand_strategy/provinces/" + province.code + ".png";
			}

			let pos = province.getPosition();
			// Máscaras das províncias de Marte têm o tamanho da própria
			// província (maskSize); as antigas eram sempre 1024x1024.
			const maskSize = province.data.maskSize || [1024, 1024];

			province.icon.size =
				this.toGUISize(
					pos[0],
					pos[1],
					pos[0] + maskSize[0],
					pos[1] + maskSize[1]
				);

			let b = province.getBounds();


			const cityIcon = Engine.GetGUIObjectByName(province.icon.name.replace("Sprite", "City"));
			if (province.ownerTribe)
			{
				const hpos = province.getHeroPos();
				cityIcon.size = this.toGUISize(...this.centeredSizeAt(this.iconSize(12), hpos));
				cityIcon.hidden = false;
			}
			else
				cityIcon.hidden = true;

			const inLos =
			province.ownerTribe ===
				g_GameData.playerTribe ||
			visible.has(code);
			let color = province.data.provinceType === "sea" ?
				[255, 255, 255] :
				province.getColor();
			if (
				!color ||
				isNaN(color[0]) ||
				isNaN(color[1]) ||
				isNaN(color[2])
			)
			{
				color = [150, 150, 150];
			}

			color.push(
				province.ownerTribe ? 70 : 30
			);
			if (!inLos)
			{
				color[0] = Math.round(color[0] * 0.33);
				color[1] = Math.round(color[1] * 0.33);
				color[2] = Math.round(color[2] * 0.33);
				color[3] = 150;
			}
			if (province.code === this.selectedProvince)
				color[3] = 100;
			color = this.animator.provinceColor(province, color, inLos);
			let colorString = color.join(" ");
			let sprite =`color:${colorString}:textureAsMask:campaigns/grand_strategy/provinces/${province.code}.png`;
			province.icon.sprite = sprite;
		}


		this.animator.endFrame(visible);

		// Render event
		const didRenderEvent = this.eventPanel.renderEvents(g_GameData.turnEvents);

		// Sem fim de turno enquanto o destino de uma conquista não for decidido.
		Engine.GetGUIObjectByName("finishTurn").enabled = !didRenderEvent && g_GameData?.canAdvanceTurn() && !g_GameData.pendingCapture;

	const BORDER = 40;

	if (this.mouseX !== null && this.mouseY !== null && !this.windows.TechTree.isOpen())
	{
		if (this.mouseX <= BORDER)
			this.cameraX -= SCROLL_SPEED;

		if (this.mouseX >=
			this.window.getComputedSize().right - BORDER)
			this.cameraX += SCROLL_SPEED;

		if (this.mouseY <= BORDER)
			this.cameraZ -= SCROLL_SPEED;

		if (this.mouseY >=
			this.window.getComputedSize().bottom - BORDER)
			this.cameraZ += SCROLL_SPEED;

		this.clampCamera();
	}
	}

	/**
	 * Generais no mapa como estandartes da facção: retrato redondo num
	 * anel da cor da tribo, sombra, halo dourado no general selecionado,
	 * selo com os soldados e estrelas pela experiência média do exército.
	 * O estandarte cresce com o exército. Exércitos inimigos longe dos seus
	 * generais mostram só uma estimativa. Vários generais na mesma
	 * província ficam lado a lado.
	 */
	renderGenerals()
	{
		const playerTribe = g_GameData.playerTribe;
		const near = new Set();
		for (const hero of g_GameData.tribes[playerTribe]?.generals || [])
		{
			near.add(hero.location);
			for (const link of g_GameData.provinces[hero.location]?.getLinks() || [])
				near.add(link);
		}

		const byProvince = {};
		for (const tribeCode in g_GameData.tribes)
			for (const hero of g_GameData.tribes[tribeCode].generals)
				(byProvince[hero.location] = byProvince[hero.location] || []).push(hero);

		const dir = "campaigns/grand_strategy/general/";
		let index = 0;
		for (const code in byProvince)
		{
			const province = g_GameData.provinces[code];
			if (!province)
				continue;
			const heroes = byProvince[code];
			const center = province.getHeroPos();
			heroes.forEach((hero, k) => {
				const token = Engine.TryGetGUIObjectByName(`heroToken[${index}]`);
				if (!token)
					return;
				const id = index++;
				const tribe = g_GameData.tribes[hero.tribe];
				const isPlayer = hero.tribe == playerTribe;
				const selected = hero == g_GameData.playerHero;
				const soldiers = twArmySoldiers(hero.battalions);
				const visible = isPlayer || near.has(hero.location);

				// Tamanho: de 85% (exército pequeno) a 125% (250+ soldados).
				const scale = 0.85 + 0.4 * Math.min(1, soldiers / 250) + (selected ? 0.1 : 0);
				const offset = (k - (heroes.length - 1) / 2) * this.iconSize(17)[0] * 2.6;
				// Posição animada (marcha) e mini-exército. Com as tropas desenhadas
				// o retrato sai do mapa (fica só no painel do general): o
				// estandarte vira uma área de clique invisível sobre elas. Sem
				// sprites para a civ, volta o estandarte com retrato.
				const placement = this.animator.placeHero(hero, [center[0] + offset, center[1]]);
				const half = this.iconSize(17 * scale * (0.3 + 0.7 * placement.grow));
				const base = this.iconSize(17)[0];
				const army = this.animator.drawArmy(hero, placement, base, visible, selected);
				token.size = army ?
					this.toGUISize(...this.centeredSizeAt([base * 1.5, base * 0.8], [placement.pos[0], placement.pos[1] - base * 0.45])) :
					this.toGUISize(...this.centeredSizeAt(half, placement.pos));
				token.hidden = false;
				for (const part of ["heroShadow", "heroRing", "heroBadge", "heroStars"])
					Engine.GetGUIObjectByName(`${part}[${id}]`).hidden = army;

				const color = (tribe?.color || "200 200 200").split(/\s+/).slice(0, 3).join(" ");
				Engine.GetGUIObjectByName(`heroShadow[${id}]`).sprite = "color:0 0 0 160:textureAsMask:" + dir + "shadow.png";
				Engine.GetGUIObjectByName(`heroRing[${id}]`).sprite = "color:" + color + " 255:textureAsMask:" + dir + "ring.png";
				const glow = Engine.GetGUIObjectByName(`heroGlow[${id}]`);
				glow.hidden = !selected || army;
				glow.sprite = "color:255 215 90 230:textureAsMask:" + dir + "glow.png";

				const portrait = getRoundHeroPortrait(hero.portrait);
				const button = Engine.GetGUIObjectByName(`heroButton[${id}]`);
				button.sprite = army ? "" : "stretched:" + portrait;
				button.onPress = () => {
					if (isPlayer)
					{
						g_GameData.selectHero(hero.id);
						this.centerScrollOnHero();
						this.render();
					}
					else
						this.displayEnemyGeneral(hero);
				};

				const badge = Engine.GetGUIObjectByName(`heroBadge[${id}]`);
				badge.sprite = "color:20 18 14 220:textureAsMask:" + dir + "badge.png";
				Engine.GetGUIObjectByName(`heroBadgeText[${id}]`).caption = visible ? String(soldiers) :
					"~" + Math.max(10, Math.round(soldiers / 50) * 50);

				const levels = hero.battalions.map(b => twBattalionLevel(b));
				const average = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
				Engine.GetGUIObjectByName(`heroStars[${id}]`).caption = visible && average >= 0.5 ? "*".repeat(Math.round(average)) : "";

				const sieging = Object.keys(g_GameData.provinces).find(c => g_GameData.provinces[c].siege?.heroId == hero.id);
				button.tooltip = coloredText((hero.title || "General") + " of " + (tribe?.getName() || hero.tribe), "235 200 120") + "\n" +
					(visible ? hero.getArmySummary() + (average >= 0.5 ? ", veteran" : "") : "About " + Math.max(10, Math.round(soldiers / 50) * 50) + " soldiers") +
					(sieging ? "\nBesieging " + g_GameData.provinces[sieging].getName() : "") +
					(isPlayer ? "\nMoves: " + hero.actionsLeft : "");
			});
		}
		for (; index < 300; ++index)
		{
			const token = Engine.TryGetGUIObjectByName(`heroToken[${index}]`);
			if (!token || token.hidden)
				break;
			token.hidden = true;
		}
	}

	/**
	 * Blocos de alta resolução do mapa (campaigns/grand_strategy/data/map_tiles.json):
	 * a partir de TILE_ZOOM, mostra só os que cortam a tela; o resto fica
	 * escondido (o motor não desenha nem carrega o que nunca foi visto).
	 */
	renderMapTiles()
	{
		if (this.mapTiles === undefined)
			this.mapTiles = Engine.FileExists(this.MAP_TILES_FILE) ? Engine.ReadJSONFile(this.MAP_TILES_FILE) : null;
		const tiles = this.mapTiles;
		const useTiles = !!tiles && this.zoom >= this.TILE_ZOOM;
		const screen = this.window.getComputedSize();
		const left = this.cameraX;
		const top = this.cameraZ;
		const right = this.cameraX + screen.right / this.zoom;
		const bottom = this.cameraZ + screen.bottom / this.zoom;
		const count = tiles ? tiles.columns * tiles.rows : 0;
		for (let i = 0; i < 64; ++i)
		{
			const object = Engine.TryGetGUIObjectByName(`mapTile[${i}]`);
			if (!object)
				break;
			if (!useTiles || i >= count)
			{
				object.hidden = true;
				continue;
			}
			const column = i % tiles.columns;
			const row = Math.floor(i / tiles.columns);
			const x0 = column * tiles.size;
			const y0 = row * tiles.size;
			const visible = x0 < right && x0 + tiles.size > left && y0 < bottom && y0 + tiles.size > top;
			object.hidden = !visible;
			if (!visible)
				continue;
			object.size = this.toGUISize(x0, y0, x0 + tiles.size, y0 + tiles.size);
			const sprite = "stretched:campaigns/grand_strategy/map/tile_" + column + "_" + row + ".png";
			if (object.sprite != sprite)
				object.sprite = sprite;
		}
	}

	/** Barra superior: tribo, turno, ouro, pesquisa, território e zoom. */
	renderTopBar()
	{
		const tribe = g_GameData.tribes[g_GameData.playerTribe];
		const techs = tribe.techs;

		Engine.GetGUIObjectByName("playerEmblem").sprite = getCivEmblemSprite(tribe.civ);
		Engine.GetGUIObjectByName("playerTribeName").caption = tribe.getName() || g_GameData.playerTribe;
		Engine.GetGUIObjectByName("topTurn").caption = `Turn ${g_GameData.turn}`;

		const balance = Math.round(tribe.lastBalance || 0);
		Engine.GetGUIObjectByName("topGold").caption = `${Math.floor(tribe.money)}  ` +
			coloredText((balance >= 0 ? "+" : "") + balance, balance >= 0 ? "140 220 120" : "230 110 100");
		Engine.GetGUIObjectByName("topGold").tooltip =
			`Gold: ${Math.floor(tribe.money)}\nLast turn balance: ${balance}\n` +
			`Tax bonus: +${Math.round((techs.getTaxMultiplier() - 1) * 100)}% (technologies)`;

		const tech = getTechData().byId[techs.current];
		Engine.GetGUIObjectByName("topResearchText").caption = tech ?
			`${tech.name}  ` + coloredText(`${techs.getTurnsLeft()}t`, "170 170 170") :
			coloredText("Choose research", "255 170 90");
		Engine.GetGUIObjectByName("topResearchBar").size =
			`0 0 ${tech ? Math.min(100, Math.round(100 * techs.progress / getTechCost(tech))) : 0}% 100%`;
		Engine.GetGUIObjectByName("topResearch").tooltip =
			`Research: ${techs.getResearchRate()} points/turn\nClick to open the technology tree.`;

		Engine.GetGUIObjectByName("topTerritory").caption =
			`${Math.floor(g_GameData.getVictoryStatus().territoryShare * 100)}%`;
		Engine.GetGUIObjectByName("topZoom").caption = `Zoom ${Math.round(this.zoom * 100)}%`;
	}

	handleInputAfterGui(ev)
	{
		if (ev.type !== "mousemotion")
			return false;

		this.mouseX = ev.x;
		this.mouseY = ev.y;

		return false;
	}

	/**
	 * Meio-tamanho de um ícone (herói, cidade) em unidades do mapa. Com
	 * zoom menor os ícones diminuem menos que o mapa, para continuarem
	 * visíveis e clicáveis (em 200% ficam como antes).
	 */
	iconSize(halfSize)
	{
		const scale = Math.sqrt(2 / this.zoom);
		return [halfSize * scale, halfSize * scale];
	}

	centeredSizeAt(size, pos)
	{
		return [
			pos[0] - size[0],
			pos[1] - size[1],
			pos[0] + size[0],
			pos[1] + size[1]
		];
	}
	toGUISize(x0, z0, x1, z1)
	{
		return `${
			Math.round((x0 - this.cameraX) * this.zoom)
		} ${
			Math.round((z0 - this.cameraZ) * this.zoom)
		} ${
			Math.round((x1 - this.cameraX) * this.zoom)
		} ${
			Math.round((z1 - this.cameraZ) * this.zoom)
		}`;
	}
	// toGUISize(x0, z0, x1, z1)
	// {
	// 	return `${Math.round(x0 - this.cameraX)} ${Math.round(z0 - this.cameraZ)} ${Math.round(x1 - this.cameraX)} ${Math.round(z1 - this.cameraZ)}`;
	// }
displayEnemyGeneral(hero)
	{
		const tribe = g_GameData.tribes[hero.tribe];
		const province = g_GameData.provinces[hero.location];
		const near = g_GameData.playerHero && (hero.location == g_GameData.playerHero.location ||
			province.getLinks().indexOf(g_GameData.playerHero.location) != -1);
		// Só se vê a composição de exércitos vizinhos ao seu general.
		const army = near ? hero.battalions.map(b => "  " + twBattalionLabel(b)).join("\n") :
			"  " + hero.battalions.length + " battalions (move closer to see them).";
		this.windows.Battle.showReport({
			"title": (hero.title || "General") + " of " + (tribe?.getName() || hero.tribe),
			"report": "\nIn " + province.getName() + ", " + hero.getArmySummary() + "\n" + army
		});
	}
	showGameOver(title, message)
	{
		Engine.GetGUIObjectByName(
			"gameOverWindow"
		).hidden = false;

		Engine.GetGUIObjectByName(
			"title"
		).caption = title;

		Engine.GetGUIObjectByName(
			"message"
		).caption = message;

		Engine.GetGUIObjectByName(
			"newCampaignButton"
		).onPress = () =>
		{
			this.closePageCallback({
				[Engine.openRequest]:
				{
					page: "campaigns/grand_strategy/init/page.xml"
				}
			});
		};
	}

	/**
	 * Tela de vitória. "Continue Campaign" fecha a tela e o jogo segue sem
	 * fim; ela só volta a aparecer se outra condição for cumprida.
	 */
	showVictory(newlyAchieved, status)
	{
		const stats = g_CampaignStatistics?.GetData?.() || g_GameData?.statistics?.GetData?.() || {};
		const firstVictory = g_GameData.victory.achieved.length === newlyAchieved.length;

		Engine.GetGUIObjectByName("victoryTitle").caption =
			newlyAchieved.map(condition => condition.name).join(" & ") + " Victory!";

		Engine.GetGUIObjectByName("victoryMessage").caption =
			(firstVictory ?
				`Your nation has triumphed over the known world in ${g_GameData.turn} turns.` :
				`Another triumph for your nation, on turn ${g_GameData.turn}.`) +
			"\nYou may keep playing this campaign for as long as you wish.";

		Engine.GetGUIObjectByName("victoryConditions").caption = status.conditions.map(condition => {
			const state = condition.achieved ?
				'[color="120 220 120"]Achieved[/color]' :
				'[color="220 140 110"]Not yet[/color]';
			return `[font="sans-bold-14"]${condition.name}[/font] - ${state}\n` +
				`   ${condition.description}\n   ${condition.progress}`;
		}).join("\n");

		Engine.GetGUIObjectByName("victoryTurns").caption = String(g_GameData.turn);
		Engine.GetGUIObjectByName("victoryProvinces").caption =
			`${status.playerProvinces} / ${status.totalProvinces} (${Math.floor(status.territoryShare * 100)}%)`;
		Engine.GetGUIObjectByName("victoryEconomy").caption =
			`${Math.round(status.playerEconomy)} per turn`;
		Engine.GetGUIObjectByName("victoryGold").caption = String(Math.round(stats.goldEarned || 0));
		Engine.GetGUIObjectByName("victoryBattles").caption = `${stats.battlesWon || 0} won / ${stats.battlesLost || 0} lost`;
		Engine.GetGUIObjectByName("victoryAllies").caption =
			status.allies.map(code => g_GameData.tribes[code]?.getName?.() || code).join(", ") || "None";
		Engine.GetGUIObjectByName("victoryScore").caption = String(Math.round(stats.score || 0));

		Engine.GetGUIObjectByName("victoryTimeline").list =
			(stats.timeline || []).map(entry => `${entry.turn} - ${entry.text}`);

		Engine.GetGUIObjectByName("victoryContinueButton").onPress = () =>
		{
			g_GameData.victory.continued = true;
			g_GameData.save();
			Engine.GetGUIObjectByName("victoryWindow").hidden = true;
			this.render();
		};

		Engine.GetGUIObjectByName("victoryNewCampaignButton").onPress = () =>
		{
			g_GameData.save();
			this.closePageCallback({
				[Engine.openRequest]:
				{
					page: "campaigns/grand_strategy/init/page.xml"
				}
			});
		};

		Engine.GetGUIObjectByName("victoryMainMenuButton").onPress = () => this.goBackToMainMenu();

		Engine.GetGUIObjectByName("victoryWindow").hidden = false;
	}

}


/** Tamanho do mapa de campanha, em pixels da imagem base. */
CampaignMenu.prototype.MAP_WIDTH = 4096;
CampaignMenu.prototype.MAP_HEIGHT = 2048;
/** Zoom máximo (o mínimo é o que faz o mapa cobrir a tela). Com os blocos 2x, dá para chegar mais perto. */
CampaignMenu.prototype.MAX_ZOOM = 4.0;
/** A partir deste zoom os blocos de alta resolução substituem a visão geral. */
CampaignMenu.prototype.TILE_ZOOM = 1.1;
CampaignMenu.prototype.MAP_TILES_FILE = "campaigns/grand_strategy/data/map_tiles.json";
/** Passo do zoom por clique da roda do mouse e por toque em +/-. */
CampaignMenu.prototype.WHEEL_ZOOM_STEP = 1.15;
CampaignMenu.prototype.KEY_ZOOM_STEP = 1.25;

function handleInputAfterGui(ev, hoveredObject)
{
	if (!g_GrandStrategyPage || !g_GrandStrategyPage.menu)
		return false;

	return g_GrandStrategyPage.menu.handleInputAfterGui(
		ev,
		hoveredObject
	);
}


