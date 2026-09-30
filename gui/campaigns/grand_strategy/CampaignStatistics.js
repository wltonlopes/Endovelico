var g_CampaignStatistics = undefined;

class CampaignStatisticsManager
{
	constructor()
	{
		this.reset();
	}

	reset()
	{
		this.data = {
			startTime: Date.now(),
			turns: 0,
			goldEarned: 0,
			goldSpent: 0,
			provincesCaptured: 0,
			provincesLost: 0,
			battlesWon: 0,
			battlesLost: 0,
			armiesRaised: 0,
			generalsLost: 0,
			diplomaticTreaties: 0,
			populationPeak: 0,
			buildingsConstructed: 0,
			technologiesResearched: 0,
			eventsTriggered: 0,
			score: 0,
			biggestEnemy: "",
			defeatReason: "",
			timeline: []
		};
	}

	Serialize()
	{
		return this.data;
	}

	Deserialize(data)
	{
		this.data = Object.assign(this.data || {}, data || {});
		this.data.timeline = this.data.timeline || [];
		this.data.startTime = this.data.startTime || Date.now();
	}

	RegisterEvent(text)
	{
		if (!this.data)
			this.reset();

		this.data.eventsTriggered++;
		this.data.timeline.push({
			turn: this.data.turns,
			text: text
		});

		if (this.data.timeline.length > 30)
			this.data.timeline.shift();
	}

	AddGold(amount)
	{
		if (!this.data)
			this.reset();

		if (amount > 0)
			this.data.goldEarned += amount;
		else
			this.data.goldSpent += -amount;
	}

	NextTurn()
	{
		if (!this.data)
			this.reset();

		this.data.turns++;
		this.UpdateBiggestEnemy();
		this.UpdatePopulationPeak();
	}

	ProvinceCaptured(name)
	{
		this.data.provincesCaptured++;
		this.RegisterEvent(`Captured ${name}`);
	}

	ProvinceLost(name)
	{
		this.data.provincesLost++;
		this.RegisterEvent(`Lost ${name}`);
	}

	BattleWon()
	{
		this.data.battlesWon++;
		this.RegisterEvent("Won a battle");
	}

	BattleLost()
	{
		this.data.battlesLost++;
		this.RegisterEvent("Lost a battle");
	}

	ArmyRaised()
	{
		this.data.armiesRaised++;
		this.RegisterEvent("Raised a new army");
	}

	GeneralLost(name)
	{
		this.data.generalsLost++;
		this.RegisterEvent(`A general fell: ${name}`);
	}

	TreatySigned()
	{
		this.data.diplomaticTreaties++;
		this.RegisterEvent("Signed a diplomatic treaty");
	}

	BuildingConstructed()
	{
		this.data.buildingsConstructed++;
		this.RegisterEvent("Constructed a building");
	}

	TechnologyResearched()
	{
		this.data.technologiesResearched++;
		this.RegisterEvent("Researched a technology");
	}

	SetDefeatReason(reason)
	{
		this.data.defeatReason = reason;
	}

	UpdateBiggestEnemy()
	{
		if (!g_GameData?.tribes)
			return;

		let biggest = "";
		let max = 0;
		for (const tribeCode in g_GameData.tribes)
		{
			if (tribeCode === g_GameData.playerTribe)
				continue;

			const tribe = g_GameData.tribes[tribeCode];
			if (tribe.controlledProvinces?.length > max)
			{
				max = tribe.controlledProvinces.length;
				biggest = tribe.getName?.() || tribeCode;
			}
		}
		this.data.biggestEnemy = biggest;
	}

	UpdatePopulationPeak()
	{
		if (!g_GameData?.tribes?.[g_GameData.playerTribe])
			return;
		const player = g_GameData.tribes[g_GameData.playerTribe];
		this.data.populationPeak = Math.max(this.data.populationPeak, player.controlledProvinces?.length || 0);
	}

	CalculateScore()
	{
		const s = this.data;
		return s.provincesCaptured * 100 +
			s.battlesWon * 50 -
			s.battlesLost * 30 +
			s.goldEarned / 20 +
			s.technologiesResearched * 80 +
			s.diplomaticTreaties * 40 +
			s.buildingsConstructed * 15;
	}

	FinalizeScore()
	{
		this.data.score = this.CalculateScore();
	}

	GetData()
	{
		this.FinalizeScore();
		return this.data;
	}
}

function CampaignStatisticsInit()
{
	g_CampaignStatistics = new CampaignStatisticsManager();
	if (g_GameData?.statistics)
		g_CampaignStatistics.Deserialize(g_GameData.statistics);
	return g_CampaignStatistics;
}

function CampaignStatistics()
{
	if (!g_CampaignStatistics)
		CampaignStatisticsInit();
	return g_CampaignStatistics;
}
