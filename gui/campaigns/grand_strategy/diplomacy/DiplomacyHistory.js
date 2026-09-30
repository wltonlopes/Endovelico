function loadHistory(controller)
{
	let diplo = controller.player.getDiplomacy(controller.target.code);

	if (!diplo.eventHistory.length)
	{
		Engine.GetGUIObjectByName("historyList").caption =
			"No diplomatic events";
		return;
	}

	Engine.GetGUIObjectByName("historyList").caption =
		diplo.eventHistory.join("\n");
}