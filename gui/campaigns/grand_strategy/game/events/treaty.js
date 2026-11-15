/**
 * Proposta de acesso militar: os exércitos dos dois povos podem atravessar
 * as províncias um do outro (sem lutar; a batalha só contra quem está em
 * guerra).
 */
class GSAccessProposal extends GSDiplomacyEvent
{
	constructor(data)
	{
		super("accessProposal", data);
	}

	needUserInput()
	{
		return this.data.target === g_GameData.playerTribe;
	}

	setupPanel(descObj, buttons)
	{
		const str = "%(from)s asks for military access: the armies of both peoples could cross each other's provinces."
			+ "\nDo we accept?";
		return super.setupPanel(descObj, buttons, this.sprintfTribes(str),
			x => x.id === "accept_access" ? "Grant Access" : "Decline");
	}

	getTickerText()
	{
		if (this.data.accepted === true)
			return this.sprintfTribes("%(target)s and %(from)s have signed a military access treaty.");
		return this.sprintfTribes("%(from)s has asked %(target)s for military access.");
	}
}

/** Um tratado foi desfeito (aliança, comércio, pacto ou acesso). */
class GSTreatyChange extends GSDiplomacyEvent
{
	constructor(data)
	{
		super("treatyChange", data);
	}

	needUserInput()
	{
		return false;
	}

	getTickerText()
	{
		const text = {
			"alliance": "%(from)s has broken its alliance with %(target)s.",
			"trade": "%(from)s has cancelled its trade agreement with %(target)s.",
			"nonAggression": "%(from)s has ended its non-aggression pact with %(target)s.",
			"militaryAccess": "%(from)s has revoked military access with %(target)s."
		}[this.data.treaty];
		return text ? this.sprintfTribes(text) : undefined;
	}
}
