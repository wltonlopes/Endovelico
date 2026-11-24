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

/** Opções liga/desliga do batalhão (comando "battalion-option"). */
var g_TWOptions = {
	"guard": {
		"name": markForTranslation("Guard Mode"),
		"sprite": "stretched:session/icons/stances/standground.png",
		"description": markForTranslation("Hold the line: soldiers keep their places and do not chase the enemy.")
	},
	"skirmish": {
		"name": markForTranslation("Skirmish Mode"),
		"sprite": "stretched:session/icons/formations/skirmish.png",
		"description": markForTranslation("Fall back when enemy melee troops come close, to keep shooting from a distance.")
	},
	"fireAtWill": {
		"name": markForTranslation("Fire at Will"),
		"sprite": "stretched:session/icons/stances/aggressive.png",
		"description": markForTranslation("Shoot at any enemy in range. Off: hold fire until ordered to attack.")
	},
	"fireArrows": {
		"name": markForTranslation("Fire Arrows"),
		"sprite": "stretched:session/portraits/technologies/fire_arrows.png",
		"description": markForTranslation("Burning arrows: triple damage against buildings and they frighten the enemy, but they are slower to shoot and a little weaker against troops.")
	},
	"cycleCharge": {
		"name": markForTranslation("Cycle Charge"),
		"sprite": "stretched:session/icons/formations/wedge.png",
		"description": markForTranslation("After the impact, the cavalry pulls back and charges again as soon as it can.")
	}
};
var g_TWOptionOrder = ["guard", "fireAtWill", "skirmish", "fireArrows", "cycleCharge"];

/** Habilidades (comando "battalion-ability"). */
var g_TWAbilities = {
	"warCry": {
		"name": markForTranslation("War Cry"),
		"sprite": "stretched:session/portraits/technologies/woad_warriors.png",
		"description": markForTranslation("Shakes nearby enemy battalions and gives this battalion more attack and steadier morale for a while.")
	},
	"rally": {
		"name": markForTranslation("Rally"),
		"sprite": "stretched:session/icons/focus-rally.png",
		"description": markForTranslation("The general rallies routing battalions nearby (if they can still rally) and restores the morale of the others.")
	},
	"inspire": {
		"name": markForTranslation("Inspire"),
		"sprite": "stretched:session/icons/promote.png",
		"description": markForTranslation("Battalions near the general lose half as much morale and hit harder for a while.")
	}
};
var g_TWVigorStates = {
	"fresh": markForTranslation("Fresh"),
	"winded": markForTranslation("Winded"),
	"tired": markForTranslation("Tired"),
	"exhausted": markForTranslation("Exhausted")
};
var g_TWVigorColors = { "fresh": "120 220 120", "winded": "220 220 120", "tired": "230 170 90", "exhausted": "230 100 90" };
var g_TWSideNames = {
	"front": markForTranslation("front"),
	"left": markForTranslation("left flank"),
	"right": markForTranslation("right flank"),
	"rear": markForTranslation("rear")
};
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

/** Botão de opção: aceso se todos os batalhões (que têm a opção) a têm ligada. */
function TWSetupOptionButton(data)
{
	const option = data.item.twOption;
	const info = g_TWOptions[option];
	const leaders = TWBattalionLeaders(data.unitEntStates).filter(entState =>
		(entState.battalion.tactics.availableOptions || []).indexOf(option) != -1);
	const on = leaders.length > 0 && leaders.every(entState => !!entState.battalion.tactics.options[option]);
	data.button.onPress = function()
	{
		Engine.PostNetworkCommand({
			"type": "battalion-option",
			"entities": leaders.map(entState => entState.id),
			"option": option,
			"value": !on
		});
	};
	data.button.onMouseRightPress = function() {};
	data.button.tooltip = translate(info.name) + " — " + (on ? coloredText(translate("On"), "120 220 120") : coloredText(translate("Off"), "200 200 200")) +
		"\n" + bodyFont(translate(info.description));
	data.button.enabled = controlsPlayer(data.player);
	data.guiSelection.hidden = !on;
	data.countDisplay.hidden = true;
	data.icon.sprite = (on ? "" : "grayscale:") + info.sprite;
	setPanelObjectPosition(data.button, data.i, data.rowLength);
	return true;
}

/** Botão de habilidade, com a recarga (segundos) no contador. */
function TWSetupAbilityButton(data)
{
	const ability = data.item.twAbility;
	const info = g_TWAbilities[ability];
	let users;
	let cooldown;
	if (ability == "warCry")
	{
		users = TWBattalionLeaders(data.unitEntStates).filter(entState => entState.battalion.tactics.warCry !== undefined);
		cooldown = Math.min(...users.map(entState => entState.battalion.tactics.warCry));
	}
	else
	{
		users = data.unitEntStates.filter(entState => entState.twGeneral);
		cooldown = Math.min(...users.map(entState => entState.twGeneral[ability]));
	}
	const ready = users.length > 0 && cooldown <= 0;
	data.button.onPress = function()
	{
		if (!ready)
			return;
		Engine.PostNetworkCommand({
			"type": "battalion-ability",
			"entities": users.map(entState => entState.id),
			"ability": ability
		});
	};
	data.button.onMouseRightPress = function() {};
	data.button.tooltip = translate(info.name) + "\n" + bodyFont(translate(info.description)) +
		(ready ? "" : "\n" + objectionFont(sprintf(translate("Ready in %(seconds)s s."), { "seconds": cooldown })));
	data.button.enabled = ready && controlsPlayer(data.player);
	data.guiSelection.hidden = true;
	data.countDisplay.hidden = ready;
	data.countDisplay.caption = ready ? "" : String(cooldown);
	data.icon.sprite = (ready ? "" : "grayscale:") + info.sprite;
	setPanelObjectPosition(data.button, data.i, data.rowLength);
	return true;
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
	if (tactics.vigorState)
		text += "\n" + sprintf(translate("Vigor: %(vigor)s%% (%(state)s)"), {
			"vigor": tactics.vigor,
			"state": coloredText(translate(g_TWVigorStates[tactics.vigorState]), g_TWVigorColors[tactics.vigorState])
		});
	if (tactics.ammoMax !== undefined)
		text += "\n" + (tactics.ammo > 0 ?
			sprintf(translate("Ammunition: %(ammo)s / %(max)s"), { "ammo": tactics.ammo, "max": tactics.ammoMax }) :
			coloredText(translate("Out of ammunition."), "230 100 90"));
	if (tactics.engaged)
	{
		text += "\n" + coloredText(translate("Engaged in melee: moves slowly, withdrawing exposes its back."), "255 150 110");
		const sides = (tactics.contactSides || []).filter(side => side != "front");
		if (sides.length >= 3)
			text += "\n" + coloredText(translate("Surrounded!"), "255 80 60");
		else if (sides.length)
			text += "\n" + coloredText(sprintf(translate("Attacked on the %(sides)s."), {
				"sides": sides.map(side => translate(g_TWSideNames[side])).join(", ")
			}), "255 120 90");
	}
	if (tactics.terrain && tactics.terrain.water)
		text += "\n" + coloredText(translate("In water: slow, weaker and vulnerable."), "120 170 230");
	else if (tactics.disordered)
		text += "\n" + coloredText(translate("Disordered by the woods: slower, weaker, cannot brace or charge."), "180 200 120");
	if (tactics.elite)
		text += "\n" + translate("Elite: steadier morale, rallies sooner.");
	if (tactics.unbreakable)
		text += "\n" + translate("Unbreakable: never routs.");
	if (tactics.inspired)
		text += "\n" + coloredText(translate("Inspired by the general."), "150 200 255");
	if (tactics.warCrying)
		text += "\n" + coloredText(translate("War cry!"), "255 210 90");
	if (tactics.cycling)
		text += "\n" + coloredText(translate("Pulling back to charge again."), "255 210 90");
	if (tactics.fightingRanks)
		text += "\n" + sprintf(translatePlural("The front rank fights; the others wait and fill the gaps.",
			"The first %(ranks)s ranks fight; the others wait and fill the gaps.", tactics.fightingRanks), { "ranks": tactics.fightingRanks });
	if (tactics.kills)
		text += "\n" + sprintf(translate("Kills: %(kills)s"), { "kills": tactics.kills });
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
		const generals = unitEntStates.filter(entState => entState.twGeneral);
		if (!unitEntStates.some(entState => entState.battalion))
			return generals.length ? ["rally", "inspire"].map(ability => ({ "twAbility": ability })) : getItems.call(this, unitEntStates);
		const leaders = TWBattalionLeaders(unitEntStates);
		if (!leaders.length)
			return [];
		// Só o que todos os batalhões selecionados conseguem formar.
		const items = g_TWPostureOrder.filter(posture => leaders.every(entState =>
			(entState.battalion.tactics.postures || ["normal", "line", "column", "loose"]).indexOf(posture) != -1))
			.map(posture => ({ "twPosture": posture }));
		// Opções que algum batalhão selecionado tem (vale para quem tem).
		for (const option of g_TWOptionOrder)
			if (leaders.some(entState => (entState.battalion.tactics.availableOptions || []).indexOf(option) != -1))
				items.push({ "twOption": option });
		if (leaders.some(entState => entState.battalion.tactics.warCry !== undefined))
			items.push({ "twAbility": "warCry" });
		if (generals.length)
			items.push({ "twAbility": "rally" }, { "twAbility": "inspire" });
		return items.slice(0, this.getMaxNumberOfItems());
	};

	panel.setupButton = function(data)
	{
		if (data.item.twOption)
			return TWSetupOptionButton(data);
		if (data.item.twAbility)
			return TWSetupAbilityButton(data);
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
