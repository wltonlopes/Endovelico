/**
 * Revolt event occurs when province happiness drops below 20
 */
class GSRevolt extends GSEvent
{
	constructor(data)
	{
		super("revolt");
		this.data = data;
	}

	needUserInput()
	{
		return true;
	}

	getAutoresolveChance()
	{
		const province = g_GameData.provinces[this.data.province];

		// Base chance: garrison strength vs rebellion strength
		let chance = 50;

		// Each garrison level adds 5%
		chance += province.garrison * 5;

		// Lower happiness = lower chance of player victory
		// At happiness 0: -50% chance
		// At happiness 20: 0% modifier
		chance -= (20 - province.getHappiness());

		// If player hero is present: +5%
		if (g_GameData.playerHero.location === province.code)
			chance += 5;

		return Math.min(chance, 95);
	}

	getAutoresolveTooltip()
	{
		return sprintf(
			"Current chance of defeating rebels: %(chance)s%%",
			{
				"chance": Math.round(this.getAutoresolveChance())
			}
		);
	}

	autoResolve()
	{
		const province = g_GameData.provinces[this.data.province];
		const tribe = g_GameData.tribes[province.ownerTribe];

		let chance = this.getAutoresolveChance();
		let roll = randIntInclusive(1, 100);

		// Player defeats rebels
		if (roll <= chance)
		{
			province.changeHappiness(15); // Happiness increases after crushing rebellion
			province.garrison = Math.max(1, province.garrison - 1); // Garrison takes casualties
			province.inRevolt = false;

			warn("Your forces have crushed the rebellion in " + province.getName() + "!");
			this.processed = true;
			return;
		}

		// Rebels win - they take over
		this.loseProvince();
		warn("The rebels have defeated your forces and taken " + province.getName() + "!");
		this.processed = true;
	}

	setupPanel(descObj, buttons)
	{
		const province = g_GameData.provinces[this.data.province];
		const tribe = g_GameData.tribes[province.ownerTribe];

		let str = "REBELLION!\n\n";
		str += "The people of %(prov)s have risen up against %(tribe)s!\n";
		str += "The province's happiness has fallen to critical levels (%(happiness)s).\n";
		str += "Our authority is being challenged by rebel forces.\n";
		str += "What do we do?";

		descObj.caption = sprintf(str, {
			"prov": province.getName(),
			"tribe": tribe.getName(),
			"happiness": Math.round(province.getHappiness())
		});

		return [
			{
				"caption": "Ignore (Lose Province)",
				"tooltip": "The rebels will take over the province.",
				"action": () => this.loseProvince()
			},
			{
				"caption": "Auto-resolve",
				"tooltip": this.getAutoresolveTooltip(),
				"action": () => this.autoResolve()
			},
			{
				"caption": "Take Control",
				"tooltip": "Personally lead the battle against the rebels.",
				"action": () => this.playOutRevolt()
			}
		];
	}

	getTickerText()
	{
		const province = g_GameData.provinces[this.data.province];
		const tribe = g_GameData.tribes[province.ownerTribe];
		return sprintf("Rebellion in %(prov)s! %(tribe)s faces internal strife.", {
			"prov": province.getName(),
			"tribe": tribe.getName()
		});
	}

	loseProvince()
	{
		const province = g_GameData.provinces[this.data.province];
		const tribe = g_GameData.tribes[province.ownerTribe];

		// Create rebel tribe
		const rebelTribeCode = "rebel_" + this.data.province;
		let rebelTribe = this.createRebelTribe(province, tribe);

		// Update province to rebel control
		province.setOwner(rebelTribeCode);
		province.garrison = 0;
		province.happiness = 75; // Rebels start with decent happiness
		province.inRevolt = false;

		// Check if player lost all provinces
		let playerOwnedCount = 0;
		for (const code in g_GameData.provinces)
		{
			if (g_GameData.provinces[code].ownerTribe === g_GameData.playerTribe)
				playerOwnedCount++;
		}

		if (playerOwnedCount === 0)
		{
			SwitchGuiPage(
				"campaigns/grand_strategy/gameover/page.xml",
				{
					"title": "Defeat",
					"message":
						"Your kingdom has fallen to rebellion.\n\n" +
						"You survived " +
						g_GameData.turn +
						" turns."
				}
			);
		}
	}

	playOutRevolt()
	{
		const province = g_GameData.provinces[this.data.province];
		const tribe = g_GameData.tribes[province.ownerTribe];

		// Create a battle similar to playOutAttack but against rebels
		this.playOutRevoltBattle(province, tribe);
	}

	playOutRevoltBattle(province, ownerTribe)
	{
		// Create rebel tribe for the battle
		const rebelTribeCode = "rebel_" + province.code;
		let rebelTribe = g_GameData.tribes[rebelTribeCode];

		if (!rebelTribe)
		{
			rebelTribe = this.createRebelTribe(province, ownerTribe);
		}

		// Simplified: defer to playOutAttack-like mechanism
		// For now, we'll just call the simpler autoResolve with modified settings
		warn("Revolt battle started for " + province.getName());

		// Create an attack-like event where owner defends against rebels
		g_GameData.playOutAttack(rebelTribeCode, province.code);
	}

	createRebelTribe(province, parentTribe)
	{
		const rebelCode = "rebel_" + province.code;

		// Check if rebel tribe already exists
		if (g_GameData.tribes[rebelCode])
			return g_GameData.tribes[rebelCode];

		// Create new rebel tribe with custom data
		const rebelData = {
			"code": rebelCode,
			"name": "Rebels of " + province.getName(),
			"civ": parentTribe.civ,
			"color": "255 0 0", // Red for rebels
			"difficulty": 3,
			"isRebel": true,
			"originProvince": province.code,
			"parentTribe": parentTribe.code
		};

		const rebelTribe = new Tribe(rebelData, true); // true = custom tribe

		// Set initial money and troops
		rebelTribe.money = 50;
		rebelTribe.civ = parentTribe.civ;
		rebelTribe.controlledProvinces = [province.code];

		// Initialize diplomacy with other tribes
		for (const tribeCode in g_GameData.tribes)
		{
			if (tribeCode !== rebelCode)
			{
				rebelTribe.diplo[tribeCode] = new GSDiplomacy(rebelCode, tribeCode);
				rebelTribe.diplo[tribeCode].status = rebelTribe.diplo[tribeCode].NEUTRAL;
			}
		}

		g_GameData.tribes[rebelCode] = rebelTribe;

		return rebelTribe;
	}
}
