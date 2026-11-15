/**
 * Batalhões na interface da batalha (Total Warfield):
 *  - o painel de formações mostra as posturas do batalhão;
 *  - os detalhes de um batalhão mostram soldados vivos, moral e nível
 *    (a barra de vida vira a barra de soldados).
 */
var g_TWPostures = {
	"normal": {
		"name": markForTranslation("Normal"),
		"icon": "formations/box.png",
		"description": markForTranslation("The battalion's usual ranks.")
	},
	"line": {
		"name": markForTranslation("Line"),
		"icon": "formations/line_open.png",
		"description": markForTranslation("A single wide rank: every soldier fights or shoots, better accuracy and rate of fire, slower.")
	},
	"column": {
		"name": markForTranslation("Column"),
		"icon": "formations/column_open.png",
		"description": markForTranslation("Two files: 20% faster for marching, but vulnerable and easily shaken.")
	},
	"loose": {
		"name": markForTranslation("Loose"),
		"icon": "formations/scatter.png",
		"description": markForTranslation("Spread out: half damage from area attacks and steadier morale under missile fire.")
	}
};
Object.assign(g_TWPostures, {
	"wedge": {
		"name": markForTranslation("Wedge"),
		"icon": "formations/wedge.png",
		"description": markForTranslation("Cavalry wedge: the leader at the tip breaks enemy lines. Stronger charges, weaker armour.")
	},
	"crane_wing": {
		"name": markForTranslation("Crane Wing"),
		"icon": "formations/flank.png",
		"description": markForTranslation("A crescent whose wings close around the enemy: better charges and faster blows, a little slower.")
	},
	"phalanx": {
		"name": markForTranslation("Phalanx"),
		"icon": "formations/phalanx.png",
		"description": markForTranslation("Deep ranks of shields and spears: more armour and attack, steadier morale, braces against charges. Slow.")
	},
	"syntagma": {
		"name": markForTranslation("Syntagma"),
		"icon": "formations/syntagma.png",
		"description": markForTranslation("A square block of pikes: raised pikes deflect missiles, very steady, braces against charges. Very slow.")
	},
	"testudo": {
		"name": markForTranslation("Testudo"),
		"icon": "formations/testudo.png",
		"description": markForTranslation("The tortoise: shields on every side and overhead. Nearly immune to missiles, but very slow and poor at fighting.")
	},
	"shield_wall": {
		"name": markForTranslation("Shield Wall"),
		"icon": "formations/battle_line.png",
		"description": markForTranslation("Two tight ranks of overlapping shields: more armour (especially against missiles), steady morale, braces against charges. Slow.")
	},
	"fish_scale": {
		"name": markForTranslation("Fish Scale"),
		"icon": "formations/line_closed.png",
		"description": markForTranslation("A staggered arrowhead that drives into the enemy line: infantry charges hit harder and morale holds better.")
	},
	"volley_ranks": {
		"name": markForTranslation("Volley Ranks"),
		"icon": "formations/line_open.png",
		"description": markForTranslation("Three ranks taking turns to shoot: faster and more accurate volleys, slower march.")
	}
});

var g_TWPostureOrder = ["normal", "line", "column", "loose", "wedge", "crane_wing", "phalanx", "syntagma", "testudo", "shield_wall", "fish_scale", "volley_ranks"];
var g_TWMoraleStates = {
	"steady": markForTranslation("Steady"),
	"shaken": markForTranslation("Shaken"),
	"broken": markForTranslation("Routing")
};
var g_TWMoraleColors = { "steady": "120 220 120", "shaken": "230 200 90", "broken": "230 100 90" };

function TWBattalionLeaders(entStates)
{
	return entStates.filter(entState => entState.battalion && entState.battalion.tactics && entState.battalion.leader == entState.id);
}

function TWBattalionSummary(battalion)
{
	const tactics = battalion.tactics;
	let text = sprintf(translate("Soldiers: %(alive)s / %(max)s"), { "alive": battalion.strength, "max": battalion.maxStrength });
	if (!tactics)
		return text;
	text += "\n" + sprintf(translate("Morale: %(morale)s%% (%(state)s)"), {
		"morale": tactics.morale,
		"state": coloredText(translate(g_TWMoraleStates[tactics.moraleState]), g_TWMoraleColors[tactics.moraleState])
	});
	if (tactics.charging)
		text += "\n" + coloredText(translate("Charging!"), "255 210 90");
	else if (tactics.canCharge)
		text += "\n" + translate("Charges when attacking an enemy battalion from 15–90 m.");
	if (tactics.brace)
		text += "\n" + translate("Braces against charges from the front.");
	if (tactics.hidden)
		text += "\n" + coloredText(translate("Hidden from distant enemies."), "150 220 150");
	else if (tactics.canHide)
		text += "\n" + translate("Hides when standing still among trees or on high ground.");
	if (battalion.attachments && battalion.attachments.length)
		text += "\n" + sprintf(translate("With: %(attachments)s"), { "attachments": battalion.attachments.join(", ") });
	text += "\n" + (tactics.nextLevelXp !== undefined ?
		sprintf(translate("Level %(level)s — experience %(xp)s / %(next)s"), { "level": tactics.level, "xp": tactics.xp, "next": tactics.nextLevelXp }) :
		sprintf(translate("Level %(level)s (maximum)"), { "level": tactics.level }));
	return text;
}

{
	const panel = g_SelectionPanels.Formation;
	const getItems = panel.getItems;
	const setupButton = panel.setupButton;

	panel.getItems = function(unitEntStates)
	{
		if (!unitEntStates.some(entState => entState.battalion))
			return getItems.call(this, unitEntStates);
		const leaders = TWBattalionLeaders(unitEntStates);
		if (!leaders.length)
			return [];
		// Só o que todos os batalhões selecionados conseguem formar.
		return g_TWPostureOrder.filter(posture => leaders.every(entState =>
			(entState.battalion.tactics.postures || ["normal", "line", "column", "loose"]).indexOf(posture) != -1))
			.map(posture => ({ "twPosture": posture }));
	};

	panel.setupButton = function(data)
	{
		const posture = data.item.twPosture;
		if (!posture)
			return setupButton.call(this, data);

		const leaders = TWBattalionLeaders(data.unitEntStates);
		const info = g_TWPostures[posture];
		data.button.onPress = function()
		{
			Engine.PostNetworkCommand({
				"type": "battalion-posture",
				"entities": leaders.map(entState => entState.id),
				"posture": posture
			});
		};
		data.button.onMouseRightPress = function() {};
		data.button.tooltip = sprintf(translate("Posture: %(posture)s"), { "posture": translate(info.name) }) + "\n" +
			bodyFont(translate(info.description));
		data.button.enabled = controlsPlayer(data.player);
		data.guiSelection.hidden = !leaders.every(entState => entState.battalion.tactics.posture == posture);
		data.countDisplay.hidden = true;
		data.icon.sprite = "stretched:session/icons/" + info.icon;
		setPanelObjectPosition(data.button, data.i, data.rowLength);
		return true;
	};
}

{
	const twDisplaySingle = displaySingle;
	displaySingle = function(entState)
	{
		twDisplaySingle(entState);
		const battalion = entState.battalion;
		if (!battalion || battalion.strength === undefined)
			return;
		Engine.GetGUIObjectByName("healthBar").size.rright = 100 * Math.max(0, Math.min(1, battalion.strength / battalion.maxStrength));
		Engine.GetGUIObjectByName("healthStats").caption = sprintf(translate("%(alive)s / %(max)s soldiers"), {
			"alive": battalion.strength,
			"max": battalion.maxStrength
		});
		Engine.GetGUIObjectByName("healthSection").tooltip = TWBattalionSummary(battalion);
		const experience = Engine.GetGUIObjectByName("experience");
		if (battalion.tactics)
		{
			experience.hidden = false;
			experience.tooltip = TWBattalionSummary(battalion);
			const next = battalion.tactics.nextLevelXp;
			Engine.GetGUIObjectByName("experienceBar").size.rtop = next === undefined ? 0 :
				100 - 100 * Math.max(0, Math.min(1, battalion.tactics.xp / next));
		}
	};
}
