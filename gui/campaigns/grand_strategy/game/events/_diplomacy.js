class GSDiplomacyEvent extends GSEvent
{
	constructor(name, data)
	{
		super(name);
		this.data = data;
		super._check("from", "target");
	}

	needUserInput()
	{
		if (this.cachedNeedUserInput === undefined)
			this.cachedNeedUserInput = this.data.target === g_GameData.playerTribe &&
				g_GameData.tribes[g_GameData.playerTribe].getDiplomacy(this.data.from).getResponses(this).length > 0;
		return this.cachedNeedUserInput;
	}

	setupPanel(descObj, buttons, desc, respFunc)
	{
		const responses = g_GameData.tribes[g_GameData.playerTribe].getDiplomacy(this.data.from).getResponses(this);
		let str = desc;
		if (responses.length === 1)
			str += "\n\n" + responses[0].tooltip;
		descObj.caption = str;
		return responses.map(x => {
			const f = respFunc(x);
			if (typeof f === "string")
				return {
					"caption": f,
					"tooltip": x.tooltip,
					"action": x.action,
				};
			return f;
		});
	}

	sprintfTribes(text)
	{
		return sprintf(text, {
			"from": g_GameData.tribes[this.data.from].getName(),
			"target": g_GameData.tribes[this.data.target].getName(),
		});
	}
}

class GSAllianceProposal extends GSDiplomacyEvent
{
	constructor(data)
	{
		super("allianceProposal", data);
	}

	needUserInput()
	{
		return this.data.target === g_GameData.playerTribe;
	}

	setupPanel(descObj, buttons)
	{
		const str = "%(from)s wants to form an alliance with %(target)s."
			+ "\nDo we accept?";
		return super.setupPanel(descObj, buttons, sprintf(str, {
			"from": g_GameData.tribes[this.data.from].getName(),
			"target": g_GameData.tribes[this.data.target].getName(),
		}), x => x.id === "accept_alliance" ? "Accept Alliance" : "Decline");
	}

	getTickerText()
	{
		return this.sprintfTribes("%(from)s has proposed an alliance with %(target)s.");
	}
}

class GSTradeProposal extends GSDiplomacyEvent
{
	constructor(data)
	{
		super("tradeProposal", data);
	}

	needUserInput()
	{
		return this.data.target === g_GameData.playerTribe;
	}

	setupPanel(descObj, buttons)
	{
		const str = "%(from)s wants to sign a trade agreement with %(target)s."
			+ "\nDo we accept?";
		return super.setupPanel(descObj, buttons, sprintf(str, {
			"from": g_GameData.tribes[this.data.from].getName(),
			"target": g_GameData.tribes[this.data.target].getName(),
		}), x => x.id === "accept_trade" ? "Accept Trade" : "Decline");
	}

	getTickerText()
	{
		return this.sprintfTribes("%(from)s has proposed a trade agreement with %(target)s.");
	}
}

class GSNonAggressionProposal extends GSDiplomacyEvent
{
	constructor(data)
	{
		super("nonAggressionProposal", data);
	}

	needUserInput()
	{
		return this.data.target === g_GameData.playerTribe;
	}

	setupPanel(descObj, buttons)
	{
		const str = "%(from)s wants to sign a non-aggression pact with %(target)s."
			+ "\nDo we accept?";
		return super.setupPanel(descObj, buttons, sprintf(str, {
			"from": g_GameData.tribes[this.data.from].getName(),
			"target": g_GameData.tribes[this.data.target].getName(),
		}), x => x.id === "accept_nap" ? "Accept Pact" : "Decline");
	}

	getTickerText()
	{
		return this.sprintfTribes("%(from)s has proposed a non-aggression pact with %(target)s.");
	}
}
