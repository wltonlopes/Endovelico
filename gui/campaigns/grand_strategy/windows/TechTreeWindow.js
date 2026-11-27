/**
 * Janela da árvore de tecnologias: eras em linhas, ramos em colunas
 * (2 colunas por ramo), com linhas ligando os pré-requisitos.
 */
class TechTreeWindow
{
	constructor(menu)
	{
		this.menu = menu;
		this.selected = undefined;

		this.window = Engine.GetGUIObjectByName("techTreeWindow");
		Engine.GetGUIObjectByName("techTreeClose").onPress = () => this.close();
		Engine.GetGUIObjectByName("techDetailButton").onPress = () => this.onDetailButton();
	}

	isOpen()
	{
		return !this.window.hidden;
	}

	open()
	{
		const techs = this.getTechs();
		if (!this.selected)
			this.selected = techs.current || techs.getAvailable()[0]?.id || getTechData().technologies[0]?.id;

		this.menu.displayContextualPanel(-1);
		this.window.hidden = false;
		this.layout();
		this.refresh();
	}

	close()
	{
		this.window.hidden = true;
	}

	toggle()
	{
		if (this.isOpen())
			this.close();
		else
			this.open();
	}

	getTechs()
	{
		return g_GameData.tribes[g_GameData.playerTribe].techs;
	}

	/**
	 * Posiciona eras, ramos e cartões conforme o tamanho da tela.
	 * Guarda o retângulo de cada cartão para desenhar as linhas.
	 */
	layout()
	{
		const data = getTechData();
		const grid = Engine.GetGUIObjectByName("techGrid").getComputedSize();
		const width = grid.right - grid.left;
		const height = grid.bottom - grid.top;

		const columns = Math.max(1, data.branches.length * 2);
		const colW = (width - this.LABEL_WIDTH) / columns;
		const eraH = (height - this.HEADER_HEIGHT) / Math.max(1, data.eras.length);
		this.eraH = eraH;

		data.eras.forEach((era, i) => {
			const band = Engine.TryGetGUIObjectByName(`techEra[${i}]`);
			if (!band)
				return;
			band.size = this.sizeString(0, this.HEADER_HEIGHT + i * eraH, width, this.HEADER_HEIGHT + (i + 1) * eraH);
			band.sprite = i % 2 ? "gsEraBandB" : "gsEraBandA";
			Engine.GetGUIObjectByName(`techEraNumeral[${i}]`).caption = era.numeral;
			Engine.GetGUIObjectByName(`techEraName[${i}]`).caption = era.name;
		});

		data.branches.forEach((branch, b) => {
			const header = Engine.TryGetGUIObjectByName(`techBranch[${b}]`);
			if (!header)
				return;
			const x0 = this.LABEL_WIDTH + b * 2 * colW;
			header.size = this.sizeString(x0, 0, x0 + 2 * colW, this.HEADER_HEIGHT);
			header.caption = branch.name;
			header.textcolor = branch.color;
			Engine.GetGUIObjectByName(`techBranchLine[${b}]`).sprite = `color:${branch.color} 255`;
		});

		const cardW = Math.min(colW - 16, 150);
		const cardH = Math.min(eraH - 20, 104);
		this.compact = cardH < 86;

		this.rects = {};
		data.technologies.forEach((tech, i) => {
			const card = Engine.TryGetGUIObjectByName(`techCard[${i}]`);
			if (!card)
				return;
			const branchIndex = data.branches.findIndex(b => b.id === tech.branch);
			const eraIndex = data.eras.findIndex(e => e.id === tech.era);
			const cx = this.LABEL_WIDTH + (branchIndex * 2 + (tech.slot || 0) + 0.5) * colW;
			const cy = this.HEADER_HEIGHT + (eraIndex + 0.5) * eraH;
			const rect = [cx - cardW / 2, cy - cardH / 2, cx + cardW / 2, cy + cardH / 2];
			this.rects[tech.id] = rect;

			card.size = this.sizeString(...rect);
			card.hidden = false;
			card.onPress = () => this.select(tech.id);
			card.onDoublePress = () => {
				this.select(tech.id);
				this.research(tech.id);
			};

			// Em telas baixas o ícone encolhe e o nome sobe.
			const icon = this.compact ? Math.max(24, cardH - 46) : 44;
			Engine.GetGUIObjectByName(`techCardIcon[${i}]`).size = `50%-${icon / 2} 5 50%+${icon / 2} ${5 + icon}`;
			Engine.GetGUIObjectByName(`techCardName[${i}]`).size = `4 ${6 + icon} 100%-4 ${this.compact ? `100%-16` : 6 + icon + 28}`;
		});

		for (let i = data.technologies.length; Engine.TryGetGUIObjectByName(`techCard[${i}]`); ++i)
			Engine.GetGUIObjectByName(`techCard[${i}]`).hidden = true;
	}

	/** Atualiza cores, estados, linhas e o painel de detalhes. */
	refresh()
	{
		if (!this.isOpen())
			return;

		const data = getTechData();
		const techs = this.getTechs();

		data.technologies.forEach((tech, i) => {
			if (!Engine.TryGetGUIObjectByName(`techCard[${i}]`))
				return;
			this.renderCard(tech, i, techs);
		});
		this.renderLines(techs);
		this.renderHeader(techs);
		this.renderDetail(techs);
	}

	renderCard(tech, i, techs)
	{
		const status = techs.getStatus(tech.id);
		const branch = getTechData().branches.find(b => b.id === tech.branch);
		const card = Engine.GetGUIObjectByName(`techCard[${i}]`);

		const sprites = {
			"researched": "gsCardResearched",
			"researching": "gsCardResearching",
			"available": "gsCardAvailable",
			"locked": "gsCardLocked"
		};
		const selected = this.selected === tech.id;
		card.sprite = selected ? "gsCardSelected" : sprites[status];
		card.sprite_over = selected ? "gsCardSelected" : "gsCardHover";
		card.tooltip = this.getTooltip(tech);

		Engine.GetGUIObjectByName(`techCardAccent[${i}]`).sprite =
			`color:${branch?.color || "200 200 200"} ${status === "locked" ? 80 : 255}`;

		const iconPath = `stretched:session/portraits/technologies/${tech.icon}.png`;
		Engine.GetGUIObjectByName(`techCardIcon[${i}]`).sprite = status === "locked" ? "grayscale:" + iconPath : iconPath;

		const name = Engine.GetGUIObjectByName(`techCardName[${i}]`);
		name.caption = tech.name;
		name.textcolor = status === "locked" ? "140 140 140" : status === "researched" ? "255 225 150" : "240 240 240";

		const statusText = Engine.GetGUIObjectByName(`techCardStatus[${i}]`);
		statusText.hidden = this.compact;
		statusText.caption = {
			"researched": coloredText("Researched", "230 200 110"),
			"researching": coloredText(sprintf("Researching · %s t", techs.getTurnsLeft(tech.id)), "120 210 255"),
			"available": sprintf("%s pts · %s t", getTechCost(tech), techs.getTurnsLeft(tech.id)),
			"locked": coloredText("Locked", "130 130 130")
		}[status];

		const researching = status === "researching";
		Engine.GetGUIObjectByName(`techCardProgressBg[${i}]`).hidden = !researching;
		if (researching)
			Engine.GetGUIObjectByName(`techCardProgress[${i}]`).size =
				`0 0 ${this.percent(techs.progress, getTechCost(tech))}% 100%`;
	}

	/**
	 * Linhas em "cotovelo" do pai até o filho: desce até a divisa das
	 * eras, anda na horizontal e desce até o cartão.
	 */
	renderLines(techs)
	{
		const data = getTechData();
		let n = 0;
		const addLine = (x0, y0, x1, y1, color) => {
			const line = Engine.TryGetGUIObjectByName(`techLine[${n++}]`);
			if (!line)
				return;
			const t = this.LINE_WIDTH / 2;
			line.size = this.sizeString(Math.min(x0, x1) - t, Math.min(y0, y1) - t, Math.max(x0, x1) + t, Math.max(y0, y1) + t);
			line.sprite = `color:${color}`;
			line.hidden = false;
		};

		// Linhas cinzas primeiro, douradas por cima.
		const links = [];
		for (const tech of data.technologies)
			for (const req of tech.requires)
				if (this.rects[req] && this.rects[tech.id])
					links.push({ "from": req, "to": tech.id, "done": techs.has(req) });
		links.sort((a, b) => a.done - b.done);

		for (const link of links)
		{
			const p = this.rects[link.from];
			const c = this.rects[link.to];
			const px = (p[0] + p[2]) / 2;
			const cx = (c[0] + c[2]) / 2;
			const eraIndex = data.eras.findIndex(e => e.id === data.byId[link.to].era);
			const midY = this.HEADER_HEIGHT + eraIndex * this.eraH;
			const color = link.done ? "230 190 90 230" : "130 130 130 140";

			addLine(px, p[3], px, midY, color);
			if (Math.abs(px - cx) > 1)
				addLine(px, midY, cx, midY, color);
			addLine(cx, midY, cx, c[1], color);
		}

		for (; Engine.TryGetGUIObjectByName(`techLine[${n}]`); ++n)
			Engine.GetGUIObjectByName(`techLine[${n}]`).hidden = true;
	}

	renderHeader(techs)
	{
		const total = getTechData().technologies.length;
		const rate = Engine.GetGUIObjectByName("techTreeRate");
		const civBonuses = typeof twCivBonusTooltip == "function" ? twCivBonusTooltip(techs.tribe) : "";
		rate.caption = sprintf(
			"Research: %s pts/turn   ·   %s / %s researched",
			techs.getResearchRate(), techs.researched.length, total) + (civBonuses ? "   ·   Civilization bonuses (hover)" : "");
		rate.tooltip = civBonuses;

		const tech = getTechData().byId[techs.current];
		const bar = Engine.GetGUIObjectByName("techCurrentBar");
		const barText = Engine.GetGUIObjectByName("techCurrentBarText");
		if (tech)
		{
			Engine.GetGUIObjectByName("techCurrentText").caption = "Researching: " + coloredText(tech.name, "120 210 255");
			bar.size = `0 0 ${this.percent(techs.progress, getTechCost(tech))}% 100%`;
			barText.caption = sprintf("%s / %s pts  ·  %s turn(s)",
				Math.floor(techs.progress), getTechCost(tech), techs.getTurnsLeft());
		}
		else
		{
			Engine.GetGUIObjectByName("techCurrentText").caption =
				coloredText("No research in progress", "255 170 90");
			bar.size = "0 0 0% 100%";
			barText.caption = "Choose an available technology";
		}
	}

	renderDetail(techs)
	{
		const data = getTechData();
		const tech = data.byId[this.selected];
		const button = Engine.GetGUIObjectByName("techDetailButton");
		if (!tech)
		{
			Engine.GetGUIObjectByName("techDetail").hidden = true;
			return;
		}
		Engine.GetGUIObjectByName("techDetail").hidden = false;

		const status = techs.getStatus(tech.id);
		const era = data.eras.find(e => e.id === tech.era);
		const branch = data.branches.find(b => b.id === tech.branch);

		const iconPath = `stretched:session/portraits/technologies/${tech.icon}.png`;
		Engine.GetGUIObjectByName("techDetailIcon").sprite = status === "locked" ? "grayscale:" + iconPath : iconPath;
		Engine.GetGUIObjectByName("techDetailName").caption = tech.name;
		Engine.GetGUIObjectByName("techDetailSub").caption =
			`${era?.name || ""} (${era?.numeral || "?"}) · ` + coloredText(branch?.name || "", branch?.color || "200 200 200");

		const lines = [tech.description || "", ""];
		lines.push(setStringTags("Effects", { "font": "sans-bold-stroke-14", "color": "235 200 120" }));
		for (const key in tech.effects)
			lines.push(coloredText("• " + formatTechEffect(key, tech.effects[key]), "150 220 150"));

		if (tech.requires.length)
		{
			lines.push("");
			lines.push(setStringTags("Requires", { "font": "sans-bold-stroke-14", "color": "235 200 120" }));
			for (const req of tech.requires)
				lines.push(coloredText("• " + (data.byId[req]?.name || req), techs.has(req) ? "150 220 150" : "230 120 100"));
		}

		lines.push("");
		lines.push(sprintf("Cost: %s points (~%s turns)", getTechCost(tech), techs.getTurnsLeft(tech.id)));
		Engine.GetGUIObjectByName("techDetailText").caption = lines.join("\n");

		button.tooltip = "";
		switch (status)
		{
		case "researched":
			button.caption = "Researched";
			button.enabled = false;
			break;
		case "researching":
			button.caption = "Cancel Research";
			button.enabled = true;
			button.tooltip = "Current progress will be lost.";
			break;
		case "available":
			button.caption = techs.current ? "Switch Research" : "Research";
			button.enabled = true;
			if (techs.current)
				button.tooltip = "Progress on the current research will be lost.";
			break;
		default:
			button.caption = "Locked";
			button.enabled = false;
		}
	}

	getTooltip(tech)
	{
		const effects = Object.keys(tech.effects).map(key => "• " + formatTechEffect(key, tech.effects[key]));
		return setStringTags(tech.name, { "font": "sans-bold-14" }) + "\n" + effects.join("\n");
	}

	select(id)
	{
		this.selected = id;
		this.refresh();
	}

	onDetailButton()
	{
		const techs = this.getTechs();
		if (techs.getStatus(this.selected) === "researching")
			techs.cancelResearch();
		else
			this.research(this.selected);
		this.refresh();
	}

	research(id)
	{
		if (this.getTechs().startResearch(id))
		{
			g_GameData.save();
			this.refresh();
		}
	}

	percent(value, total)
	{
		return Math.max(0, Math.min(100, Math.round(100 * value / Math.max(1, total))));
	}

	sizeString(x0, y0, x1, y1)
	{
		return `${Math.round(x0)} ${Math.round(y0)} ${Math.round(x1)} ${Math.round(y1)}`;
	}
}

TechTreeWindow.prototype.LABEL_WIDTH = 74;
TechTreeWindow.prototype.HEADER_HEIGHT = 34;
TechTreeWindow.prototype.LINE_WIDTH = 2;
