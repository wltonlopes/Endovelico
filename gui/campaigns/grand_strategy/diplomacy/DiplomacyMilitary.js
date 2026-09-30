function loadMilitary(controller)
{
	let info = controller.info;

	Engine.GetGUIObjectByName("economyValue").caption =
		"Economy: " + info.statistics.economy;

	Engine.GetGUIObjectByName("armyValue").caption =
		"Army: " + info.statistics.army;

	Engine.GetGUIObjectByName("navyValue").caption =
		"Navy: " + info.statistics.navy;

	Engine.GetGUIObjectByName("populationValue").caption =
		"Population: " + info.statistics.population;
}