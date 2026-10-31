function setupBiome_pampas()
{
	g_Gaia.startingAnimal = pickRandom([
		"gaia/fauna_tinamou",
		"gaia/fauna_mallard"
	]);

	g_Gaia.mainHuntableAnimal = pickRandom([
		"gaia/fauna_guanaco",
		"gaia/fauna_deer_white_tailed"
	]);

	// Never the same species as the main one.
	g_Gaia.secondaryHuntableAnimal = pickRandom([
		"gaia/fauna_deer_white_tailed",
		"gaia/fauna_peccary",
		"gaia/fauna_tapeti",
		"gaia/fauna_guanaco"
	].filter(animal => animal != g_Gaia.mainHuntableAnimal));

	g_Gaia.smallAnimal = pickRandom([
		"gaia/fauna_tapeti",
		"gaia/fauna_skunk",
		"gaia/fauna_opossum",
		"gaia/fauna_grison",
		"gaia/fauna_mallard"
	]);

	g_Gaia.predator = pickRandom([
		"gaia/fauna_puma",
		"gaia/fauna_fox_gray_02",
		"gaia/fauna_jaguarundi"
	]);

	[g_Gaia.tree2, g_Gaia.tree4] = pickRandom([
		[
			"gaia/tree/temperate",
			"gaia/tree/poplar"
		],
		[
			"gaia/tree/elm",
			"gaia/tree/tamarix"
		]
	]);
}
