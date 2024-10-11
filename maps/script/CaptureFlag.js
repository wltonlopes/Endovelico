Trigger.prototype.InitCaptureTheFlag = function()
{
	let cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	let flagpointTemplates = shuffleArray(cmpTemplateManager.FindAllTemplates(false).filter(
		name => GetIdentityClasses(cmpTemplateManager.GetTemplate(name).Identity || {}).indexOf("Flagpoint") != -1));

	let potentialSpawnPoints = TriggerHelper.GetLandSpawnPoints();
	if (!potentialSpawnPoints.length)
	{
		error("No gaia entities found on this map that could be used as spawn points!");
		return;
	}

	let cmpEndGameManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager);
	let numSpawnedFlags = cmpEndGameManager.GetGameSettings().flagpointCount;
	this.playerFlagsCount = new Array(TriggerHelper.GetNumberOfPlayers()).fill(0, 1);
	this.playerFlagsCount[0] = numSpawnedFlags;

	for (let i = 0; i < numSpawnedFlags; ++i)
	{
		this.flags[i] = TriggerHelper.SpawnUnits(pickRandom(potentialSpawnPoints), flagpointTemplates[i], 1, 0)[0];

		let cmpPositionFlag = Engine.QueryInterface(this.flags[i], IID_Position);
		cmpPositionFlag.SetYRotation(randomAngle());
	}
};

Trigger.prototype.CheckCaptureTheFlagVictory = function(data)
{
	let cmpIdentity = Engine.QueryInterface(data.entity, IID_Identity);
	if (!cmpIdentity || !cmpIdentity.HasClass("Flagpoint") || data.from == INVALID_PLAYER)
		return;

	--this.playerFlagsCount[data.from];

	if (data.to == -1)
	{
		warn("Flagpoint entity " + data.entity + " has been destroyed.");
		this.flags.splice(this.flags.indexOf(data.entity), 1);
	}
	else
		++this.playerFlagsCount[data.to];

	this.DeleteCaptureTheFlagVictoryMessages();
	this.CheckCaptureTheFlagCountdown();
};

/**
 * Check if a group of mutually allied players have acquired all flagpoints.
 * The winning players are the flagpoint owners and all players mutually allied to all flagpoint owners.
 * Reset the countdown if the group of winning players changes or extends.
 */
Trigger.prototype.CheckCaptureTheFlagCountdown = function()
{
	if (this.playerFlagsCount[0])
	{
		this.DeleteCaptureTheFlagVictoryMessages();
		return;
	}

	let activePlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager).GetActivePlayers();
	let flagOwners = activePlayers.filter(playerID => this.playerFlagsCount[playerID]);
	if (!flagOwners.length)
	{
		this.DeleteCaptureTheFlagVictoryMessages();
		return;
	}

	let winningPlayers = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager).GetAlliedVictory() ?
		activePlayers.filter(playerID => flagOwners.every(owner => QueryPlayerIDInterface(playerID, IID_Diplomacy).IsMutualAlly(owner))) :
		[flagOwners[0]];

	// All flagOwners should be mutually allied
	if (flagOwners.some(owner => winningPlayers.indexOf(owner) == -1))
	{
		this.DeleteCaptureTheFlagVictoryMessages();
		return;
	}

	// Reset the timer when playerAndAllies isn't the same as this.flagsVictoryCountdownPlayers
	if (winningPlayers.length != this.flagsVictoryCountdownPlayers.length ||
	    winningPlayers.some(player => this.flagsVictoryCountdownPlayers.indexOf(player) == -1))
	{
		this.flagsVictoryCountdownPlayers = winningPlayers;
		this.StartCaptureTheFlagCountdown(winningPlayers);
	}
};

Trigger.prototype.DeleteCaptureTheFlagVictoryMessages = function()
{
	if (!this.flagsVictoryTimer)
		return;

	Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).CancelTimer(this.flagsVictoryTimer);
	this.flagsVictoryTimer = undefined;

	let cmpGuiInterface = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
	cmpGuiInterface.DeleteTimeNotification(this.ownFlagsVictoryMessage);
	cmpGuiInterface.DeleteTimeNotification(this.othersFlagsVictoryMessage);
	this.flagsVictoryCountdownPlayers = [];
};

Trigger.prototype.StartCaptureTheFlagCountdown = function(winningPlayers)
{
	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let cmpGuiInterface = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);

	if (this.flagsVictoryTimer)
	{
		cmpTimer.CancelTimer(this.flagsVictoryTimer);
		cmpGuiInterface.DeleteTimeNotification(this.ownFlagsVictoryMessage);
		cmpGuiInterface.DeleteTimeNotification(this.othersFlagsVictoryMessage);
	}

	if (!this.flags.length)
		return;

	let others = [-1];
	for (let playerID = 1; playerID < TriggerHelper.GetNumberOfPlayers(); ++playerID)
	{
		let cmpPlayer = QueryPlayerIDInterface(playerID);
		if (cmpPlayer.GetState() == "won")
			return;

		if (winningPlayers.indexOf(playerID) == -1)
			others.push(playerID);
	}

	let cmpPlayer = QueryOwnerInterface(this.flags[0], IID_Player);
	if (!cmpPlayer)
	{
		warn("Flagpoint entity " + this.flags[0] + " has no owner.");
		this.flags.splice(0, 1);

		this.CheckCaptureTheFlagCountdown();
		return;
	}
	let cmpEndGameManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager);
	let captureTheFlagDuration = cmpEndGameManager.GetGameSettings().flagpointDuration;

	let isTeam = winningPlayers.length > 1;
	this.ownFlagsVictoryMessage = cmpGuiInterface.AddTimeNotification({
		"message": isTeam ?
			markForTranslation("%(_player_)s and their allies have captured all flagpoints and will win in %(time)s.") :
			markForTranslation("%(_player_)s has captured all flagpoints and will win in %(time)s."),
		"players": others,
		"parameters": {
			"_player_": cmpPlayer.GetPlayerID()
		},
		"translateMessage": true,
		"translateParameters": []
	}, captureTheFlagDuration);

	this.othersFlagsVictoryMessage = cmpGuiInterface.AddTimeNotification({
		"message": isTeam ?
			markForTranslation("You and your allies have captured all flagpoints and will win in %(time)s.") :
			markForTranslation("You have captured all flagpoints and will win in %(time)s."),
		"players": winningPlayers,
		"translateMessage": true
	}, captureTheFlagDuration);

	this.flagsVictoryTimer = cmpTimer.SetTimeout(SYSTEM_ENTITY, IID_Trigger,
		"CaptureTheFlagVictorySetWinner", captureTheFlagDuration, winningPlayers);
};

Trigger.prototype.CaptureTheFlagVictorySetWinner = function(winningPlayers)
{
	let cmpEndGameManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager);
	cmpEndGameManager.MarkPlayersAsWon(
		winningPlayers,
		n => markForPluralTranslation(
			"%(lastPlayer)s has won (Capture the Flag).",
			"%(players)s and %(lastPlayer)s have won (Capture the Flag).",
			n),
		n => markForPluralTranslation(
			"%(lastPlayer)s has been defeated (Capture the Flag).",
			"%(players)s and %(lastPlayer)s have been defeated (Capture the Flag).",
			n));
};

{
	let cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.flags = [];
	cmpTrigger.playerFlagsCount = [];
	cmpTrigger.flagsVictoryTimer = undefined;
	cmpTrigger.ownFlagsVictoryMessage = undefined;
	cmpTrigger.othersFlagsVictoryMessage = undefined;
	cmpTrigger.flagsVictoryCountdownPlayers = [];

	cmpTrigger.DoAfterDelay(0, "InitCaptureTheFlag", {});
	cmpTrigger.RegisterTrigger("OnDiplomacyChanged", "CheckCaptureTheFlagCountdown", { "enabled": true });
	cmpTrigger.RegisterTrigger("OnOwnershipChanged", "CheckCaptureTheFlagVictory", { "enabled": true });
	cmpTrigger.RegisterTrigger("OnPlayerWon", "DeleteCaptureTheFlagVictoryMessages", { "enabled": true });
	cmpTrigger.RegisterTrigger("OnPlayerDefeated", "CheckCaptureTheFlagCountdown", { "enabled": true });
}
