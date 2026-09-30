/**
 * Painel de reforços do modo batalha. Recebe a situação do jogador
 * (ver Trigger.prototype.BattleModeGetStatus) e devolve as tropas escolhidas;
 * a simulação confere pontos e população de novo antes de criar as tropas.
 */

const g_ReinforceCatalogPath = "simulation/data/battle_mode/army_catalog.json";
const g_ReinforceRowHeight = 40;
const g_ReinforceRowGap = 4;

var g_ReinforcePage;

function init(data)
{
	return new Promise(closePageCallback => {
		g_ReinforcePage = new ReinforcePage(data.status, closePageCallback);
	});
}

class ReinforcePage
{
	constructor(status, closePageCallback)
	{
		this.status = status;
		this.closePageCallback = closePageCallback;
		this.counts = {};

		const catalog = Engine.ReadJSONFile(g_ReinforceCatalogPath);
		this.categoryNames = {};
		const order = [];
		for (const category of catalog.Categories)
		{
			this.categoryNames[category.Id] = translate(category.Name);
			order.push(category.Id);
		}
		this.entries = status.catalog.slice().sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

		// Duas colunas: as linhas pares à esquerda, as ímpares à direita.
		for (let i = 0; i < this.rowCount(); ++i)
		{
			const top = Math.floor(i / 2) * (g_ReinforceRowHeight + g_ReinforceRowGap);
			Engine.GetGUIObjectByName("unitRow[" + i + "]").size = i % 2 ?
				"50%+3 " + top + " 100% " + (top + g_ReinforceRowHeight) :
				"0 " + top + " 50%-3 " + (top + g_ReinforceRowHeight);
			Engine.GetGUIObjectByName("unitMinus[" + i + "]").onPress = () => this.change(i, -1);
			Engine.GetGUIObjectByName("unitPlus[" + i + "]").onPress = () => this.change(i, +1);
		}
		Engine.GetGUIObjectByName("cancelButton").onPress = () => this.closePageCallback(undefined);
		Engine.GetGUIObjectByName("deployButton").onPress = () => this.deploy();

		this.render();
	}

	rowCount()
	{
		let count = 0;
		while (Engine.TryGetGUIObjectByName("unitRow[" + count + "]"))
			++count;
		return count;
	}

	unitData(entry)
	{
		const identity = Engine.GetTemplate(entry.template)?.Identity || {};
		return {
			"name": translate(entry.name || identity.SpecificName || identity.GenericName || entry.template.split("/").pop()),
			"icon": identity.Icon
		};
	}

	totals()
	{
		let cost = 0;
		let pop = 0;
		for (const entry of this.entries)
		{
			const count = this.counts[entry.template] || 0;
			cost += entry.cost * count;
			pop += entry.pop * count;
		}
		return { "cost": cost, "pop": pop };
	}

	popRoom()
	{
		return this.status.popLimit - this.status.popCount;
	}

	canAdd(entry)
	{
		const totals = this.totals();
		return totals.cost + entry.cost <= this.status.points && totals.pop + entry.pop <= this.popRoom();
	}

	change(row, delta)
	{
		const entry = this.entries[row];
		if (!entry || delta > 0 && !this.canAdd(entry))
			return;
		this.counts[entry.template] = Math.max(0, (this.counts[entry.template] || 0) + delta);
		this.render();
	}

	render()
	{
		const status = this.status;
		Engine.GetGUIObjectByName("statusText").caption =
			sprintf(translate("Reinforcement points: %(points)s    Population: %(count)s / %(limit)s"), {
				"points": Math.floor(status.points),
				"count": status.popCount,
				"limit": status.popLimit
			}) + "\n" +
			sprintf(translate("You hold %(held)s control points: +%(income)s points every %(time)s. Each control point also gives %(pop)s population. Reinforcements march in from the nearest map edge."), {
				"held": status.controlPoints,
				"income": status.income,
				"time": timeToString(status.interval),
				"pop": status.popPerControlPoint
			});

		for (let i = 0; i < this.rowCount(); ++i)
		{
			const entry = this.entries[i];
			Engine.GetGUIObjectByName("unitRow[" + i + "]").hidden = !entry;
			if (!entry)
				continue;
			const data = this.unitData(entry);
			const count = this.counts[entry.template] || 0;
			Engine.GetGUIObjectByName("unitIcon[" + i + "]").sprite = data.icon ? "stretched:session/portraits/" + data.icon : "";
			Engine.GetGUIObjectByName("unitName[" + i + "]").caption = data.name;
			Engine.GetGUIObjectByName("unitInfo[" + i + "]").caption = sprintf(translate("%(category)s · %(pop)s population"), {
				"category": this.categoryNames[entry.category] || entry.category,
				"pop": entry.pop
			});
			Engine.GetGUIObjectByName("unitCost[" + i + "]").caption = sprintf(translate("%(cost)s pts"), { "cost": entry.cost });
			Engine.GetGUIObjectByName("unitCount[" + i + "]").caption = String(count);
			Engine.GetGUIObjectByName("unitMinus[" + i + "]").enabled = count > 0;
			Engine.GetGUIObjectByName("unitPlus[" + i + "]").enabled = this.canAdd(entry);
		}

		const totals = this.totals();
		Engine.GetGUIObjectByName("summaryText").caption = sprintf(translate("Order: %(cost)s points, %(pop)s population."), totals);
		Engine.GetGUIObjectByName("deployButton").enabled = totals.cost > 0;
	}

	deploy()
	{
		const units = this.entries
			.filter(entry => this.counts[entry.template] > 0)
			.map(entry => ({ "template": entry.template, "count": this.counts[entry.template] }));
		this.closePageCallback(units.length ? { "units": units } : undefined);
	}
}
