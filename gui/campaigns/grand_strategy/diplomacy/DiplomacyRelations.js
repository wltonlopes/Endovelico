function loadRelations(controller)
{
	const diplo = controller.target.getDiplomacy(controller.player.code);

	Engine.GetGUIObjectByName("relationStatus").caption =
		"Status: " + diplo.status;

	Engine.GetGUIObjectByName("relationOpinion").caption =
		"Opinion: " + diplo.opinion;

	Engine.GetGUIObjectByName("relationTrust").caption =
		"Trust: " + diplo.trust + "%";
}