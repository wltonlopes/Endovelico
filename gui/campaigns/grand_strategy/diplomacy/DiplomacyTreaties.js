function loadTreaties(controller)
{
	const target = controller.target;
	const game = controller.game;
	const targetDiplo = target.diplo || {};

	const allies = [];
	const nonAggression = [];
	const wars = [];
	const trades = [];

	for (const tribeCode in game.tribes)
	{
		if (tribeCode === target.code)
			continue;

		const diplo = targetDiplo[tribeCode] || target.getDiplomacy(tribeCode);
		const name = game.tribes[tribeCode].getName();

		if (diplo.status === diplo.WAR)
			wars.push(name);
		if (diplo.treaties.alliance)
			allies.push(name);
		if (diplo.treaties.nonAggression)
			nonAggression.push(name);
		if (diplo.treaties.trade)
			trades.push(name);
	}

	const list = [];

	if (allies.length)
		list.push("Allies: " + allies.join(", "));
	if (nonAggression.length)
		list.push("Non-Aggression Pacts: " + nonAggression.join(", "));
	if (trades.length)
		list.push("Trade Agreements: " + trades.join(", "));
	if (wars.length)
		list.push("At War: " + wars.join(", "));

	if (!list.length)
		list.push("No active diplomatic agreements");

	Engine.GetGUIObjectByName("treatyList").caption =
		list.join("\n");
}