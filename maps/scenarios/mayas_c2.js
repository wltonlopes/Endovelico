warn("executing trigger script");


var introMessageCounter = 0;

var defendTime = () => randFloat(10, 10);//25minutes long


Trigger.prototype.IntroductionMessage = function(data) 
{
	var output = ["Welcome my Ajaw!", "A group of raiders are around the region" , " prosper our city and fortify it as quickly as possible!","My Ajaw une fortress is very preciosos in we posision!"];
	
	if (this.state != "start")
		return;

	var cmpGUIInterface = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
	cmpGUIInterface.PushNotification({
		"players": [2],
		"message": markForTranslation(output[introMessageCounter]),
		translateMessage: true

	});
	
	introMessageCounter++;
	
};
var disabledTemplates = (civ) => [
	// Expansions
	"structures/" + civ + "/civil_centre",
	"structures/" + civ + "/military_colony"
];

Trigger.prototype.Timer = function()// Code that creates a timer
{
	if (this.state != "start")
		return;

	    let time = defendTime() * 60 * 1000;
	    Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).AddTimeNotification({
	        "message": markForTranslation("OS ataques acabaram em! %(time)s!"),
	        "translateMessage": true
	    }, time);
		 this.DoAfterDelay(time, "Victory", {});
	};

	Trigger.prototype.AttackI = function()
{
	let infIntruders = ["units/mayap/infantry_javelineer_b","units/mayap/infantry_spearman_b"]
	var intruders = TriggerHelper.SpawnUnitsFromTriggerPoints(
			pickRandom(["B"]),pickRandom(infIntruders), 10, 0);

	for (var origin in intruders)
	{
		var playerID = TriggerHelper.GetOwner(+origin);
		var cmd = null;
		for (var target of this.GetTriggerPoints("A"))
		{
			if (TriggerHelper.GetOwner(target) != playerID)
				continue;
			var cmpPosition = Engine.QueryInterface(target, IID_Position);
			if (!cmpPosition || !cmpPosition.IsInWorld)
				continue;
			// store the x and z coordinates in the command
			cmd = cmpPosition.GetPosition();
			break;
		}
		if (!cmd)
			continue;
		cmd.type = "attack-walk";
		cmd.entities = intruders[origin];
		cmd.targetClasses = { "attack": ["Unit", "Structure"] };
		cmd.allowCapture = false;
		cmd.queued = true;
		ProcessCommand(0, cmd);
	}
};

Trigger.prototype.AttackII = function()
{
	let invShips = ["units/mayap/ship_fishing","units/mayap/ship_fishing"]
	var intruders = TriggerHelper.SpawnUnitsFromTriggerPoints(
			pickRandom(["C"]),pickRandom(invShips), 3, 0);

	for (var origin in intruders)
	{
		var playerID = TriggerHelper.GetOwner(+origin);
		var cmd = null;
		for (var target of this.GetTriggerPoints("A"))
		{
			if (TriggerHelper.GetOwner(target) != playerID)
				continue;
			var cmpPosition = Engine.QueryInterface(target, IID_Position);
			if (!cmpPosition || !cmpPosition.IsInWorld)
				continue;
			// store the x and z coordinates in the command
			cmd = cmpPosition.GetPosition();
			break;
		}
		if (!cmd)
			continue;
		cmd.type = "attack-walk";
		cmd.entities = intruders[origin];
		cmd.targetClasses = { "attack": ["Unit", "Structure"] };
		cmd.allowCapture = false;
		cmd.queued = true;
		ProcessCommand(0, cmd);
	}
};

Trigger.prototype.Reforces = function()
{
	var alieds = TriggerHelper.SpawnUnitsFromTriggerPoints(
			pickRandom(["C"]),"units/mayap/ship_arrow",5, 1);
	// var alieds = TriggerHelper.SpawnUnitsFromTriggerPoints(
	// 		pickRandom(["A"]),"units/mayap/infantry_spearman_e", 5, 1);
};

//Trigger.prototype.AlliedSupport = function()
//{
//	var food = TriggerHelper.SpawnUnitsFromTriggerPoints(
//			pickRandom(["D"]),"gaia/treasure/food_jars", 3, 1);
//	var wood = TriggerHelper.SpawnUnitsFromTriggerPoints(
//			pickRandom(["D"]),"gaia/treasure/wood_lumber", 3, 1);
//};

Trigger.prototype.Victory = function(playerID)//Makes Player 1 win.
{
	TriggerHelper.SetPlayerWon(
		1,
		n => markForPluralTranslation(
			"%(lastPlayer)s has won (Nossos inimigos desistiram da iniciativa, por enquanto.).",
			"%(players)s and %(lastPlayer)s have won (Nossos inimigos desistiram da iniciativa, por enquanto.).",
			n),
		n => markForPluralTranslation(
			"%(lastPlayer)s has been defeated (Nossos inimigos desistiram da iniciativa, por enquanto. ).",
			"%(players)s and %(lastPlayer)s have been defeated (Nossos inimigos desistiram da iniciativa, por enquanto.).",
			n));
};

var cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
cmpTrigger.state = "start";
cmpTrigger.DoAfterDelay(2000, "IntroductionMessage", {});
cmpTrigger.DoAfterDelay(10000, "IntroductionMessage", {});
cmpTrigger.DoAfterDelay(20000, "IntroductionMessage", {});
cmpTrigger.DoAfterDelay(30000, "Timer", {});
cmpTrigger.DoAfterDelay(31000, "AttackI", {});
cmpTrigger.DoAfterDelay(35000, "AttackI", {});
cmpTrigger.DoAfterDelay(80000, "AttackII", {});
cmpTrigger.DoAfterDelay(120000, "AttackI", {});
cmpTrigger.DoAfterDelay(180000, "IntroductionMessage", {});

cmpTrigger.DoAfterDelay(200000, "AttackI", {});