/**
 * 'attack': um general inimigo ataca uma província (ou um general) do
 * jogador. O jogador escolhe resolver na hora ou comandar a batalha de
 * campo (Total Warfield, game/Battle.js). data.battle é a descrição da
 * batalha (TWBattle.create).
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

	getBattle()
	{
		// Eventos antigos (sem batalha): o atacante é o primeiro general dele.
		if (!this.data.battle)
		{
			const hero = g_GameData.tribes[this.data.attacker]?.generals[0];
			if (hero)
				this.data.battle = TWBattle.create(hero, this.data.target);
		}
		return this.data.battle;
	}

	getAutoresolveTooltip()
	{
		const battle = this.getBattle();
		if (!battle)
			return "";
		return sprintf("Chance of victory: %(chance)s%%", { "chance": Math.round(100 * TWBattle.getPlayerChance(battle)) });
	}

	autoResolve()
	{
		const battle = this.getBattle();
		this.processed = true;
		if (!battle || !TWBattle.getHero(battle.attacker))
			return;
		const outcome = TWBattle.autoResolve(battle);
		g_GameData.lastBattleReport = outcome;
		g_GameData.save();
		g_GameData.checkGameOver();
	}

	fight()
	{
		const battle = this.getBattle();
		this.processed = true;
		if (!battle || !TWBattle.getHero(battle.attacker))
			return;
		TWBattle.launch(battle, g_CampaignMenu.closePageCallback);
	}

	setupPanel(descObj, buttons)
	{
		const battle = this.getBattle();
		const province = g_GameData.provinces[this.data.target];
		let text = sprintf("My Lord! The enemy is at our gates!\n%(attacker)s is attacking %(prov)s.", {
			"attacker": g_GameData.tribes[this.data.attacker]?.getName() || this.data.attacker,
			"prov": province.getName()
		});
		if (battle && TWBattle.getHero(battle.attacker))
		{
			const forces = TWBattle.getForces(battle);
			text += "\n\n" + TWBattle.describeSide(battle.attacker, forces.attacker, battle) +
				"\n\n" + TWBattle.describeSide(battle.defender, forces.defender, battle) +
				"\n\n" + this.getAutoresolveTooltip();
		}
		descObj.caption = text;
		return [
			{
				"caption": "Auto-resolve",
				"tooltip": this.getAutoresolveTooltip(),
				"action": () => this.autoResolve()
			},
			{
				"caption": "Command the battle",
				"tooltip": "Fight a field battle with your battalions. Survivors and losses carry over to the campaign.",
				"action": () => this.fight()
			}
		];
	}

	getTickerText()
	{
		return sprintf("%(attacker)s attacked our province of %(prov)s", {
			"attacker": g_GameData.tribes[this.data.attacker]?.getName() || this.data.attacker,
			"prov": g_GameData.provinces[this.data.target].getName(),
		});
	}
}
