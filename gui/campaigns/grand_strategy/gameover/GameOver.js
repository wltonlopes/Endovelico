function init(data) {
	let title = Engine.GetGUIObjectByName("title");
	let message = Engine.GetGUIObjectByName("message");
	let stats = g_CampaignStatistics?.GetData?.() || g_GameData?.statistics?.GetData?.() || {};

	title.caption =
		data?.title || "Defeat";

	message.caption =
		data?.message ||
		"Your kingdom has fallen.";

	Engine.GetGUIObjectByName("turnsValue").caption = stats.turns || 0;
	Engine.GetGUIObjectByName("goldValue").caption = stats.goldEarned || 0;
	Engine.GetGUIObjectByName("battlesValue").caption = `${stats.battlesWon || 0}/${stats.battlesLost || 0}`;
	Engine.GetGUIObjectByName("enemyValue").caption = stats.biggestEnemy || "None";
	Engine.GetGUIObjectByName("scoreValue").caption = stats.score || 0;
	Engine.GetGUIObjectByName("reasonValue").caption = stats.defeatReason || "Unknown";

	const timeline = Engine.GetGUIObjectByName("timelineList");
	if (timeline)
	{
		timeline.list = [];
		for (const entry of stats.timeline || [])
		{
			const item = `${entry.turn} - ${entry.text}`;
			timeline.list.push(item);
		}
	}

	Engine.GetGUIObjectByName(
		"newCampaignButton"
	).onPress = () =>
	{
		SwitchGuiPage(
			"campaigns/grand_strategy/init/page.xml"
		);
	};
}