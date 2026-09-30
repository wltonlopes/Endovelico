/**
 * 'attack' is a special event that requires user interaction,
 * and happens when the player gets attacked by external forces.
 */
class GSAttack extends GSEvent
{
	constructor(data)
	{
		super("attack");
		this.data = data;
	}

	needUserInput()
	{
		return true;
	}
//
	getAutoresolveChance() {
		let province =
			g_GameData.provinces[this.data.target];

		// Base chance: 50%
		let chance = 50;

		// Each garrison level adds 4.5%
		chance += province.garrison * 4.5;

		// Future expansion:
		// if (province.isCapital)
		//     chance += 5;
		
		if (g_GameData.playerHero.location == province.code)
		    chance += 5;

		return Math.min(chance, 95);

	}

	getAutoresolveTooltip() {
		return sprintf(
			"Current chance of victory: %(chance)s%%",
			{
				"chance":
					Math.round(
						this.getAutoresolveChance()
					)
			}
		);
	}

autoResolve()
{
	let province =
		g_GameData.provinces[this.data.target];

	let attacker =
		g_GameData.tribes[this.data.attacker];

	let chance =
		this.getAutoresolveChance();

	let roll =
		randIntInclusive(1, 100);

	// Defensores vencem
	if (roll <= chance)
	{
		warn(
			"The defenders of " +
			province.getName() +
			" successfully repelled an attack."
		);

		this.processed = true;
		return;
	}

	let defender = province.ownerTribe;

	province.setOwner(this.data.attacker);

	let stillAlive = false;

	province.setOwner(this.data.attacker);
	
	if (g_GameData.checkGameOver())
	{
		this.processed = true;
		return;
	}

	this.processed = true;
}
//

	setupPanel(descObj, buttons)
	{
		let str = "My Lord! The enemy is at our gates!";
		str += "\n%(attacker)s is attacking our lovely province of %(prov)s. What should we do?";
		descObj.caption = sprintf(str, {
			"attacker": g_GameData.tribes[this.data.attacker].getName(),
			"prov": g_GameData.provinces[this.data.target].getName(),
		});
	return [ { "caption": "Auto-resolve", "tooltip": this.getAutoresolveTooltip(), "action": () => this.autoResolve(), }, { "caption": "Take Control", "tooltip": "This will start a Skirmish where you must win to defend your land.", "action": () => g_GameData.playOutAttack( this.data.attacker, this.data.target ), } ];
	}

	getTickerText()
	{
		return sprintf("%(attacker)s attacked our province of %(prov)s", {
			"attacker": g_GameData.tribes[this.data.attacker].getName(),
			"prov": g_GameData.provinces[this.data.target].getName(),
		});
	}
}
