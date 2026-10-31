function setupBiome_altiplano()
{
	g_Gaia.startingAnimal = pickRandom([
		"gaia/fauna_tinamou",
		"gaia/fauna_mallard"
	]);

	g_Gaia.mainHuntableAnimal = pickRandom([
		"gaia/fauna_llama",
		"gaia/fauna_guanaco"
	]);

	// Never the same species as the main one.
	g_Gaia.secondaryHuntableAnimal = pickRandom([
		"gaia/fauna_guanaco",
		"gaia/fauna_llama",
		"gaia/fauna_deer_white_tailed"
	].filter(animal => animal != g_Gaia.mainHuntableAnimal));

	g_Gaia.smallAnimal = pickRandom([
		"gaia/fauna_tapeti",
		"gaia/fauna_skunk",
		"gaia/fauna_grison"
	]);

	g_Gaia.predator = pickRandom([
		"gaia/fauna_puma",
		"gaia/fauna_fox_gray_02"
	]);
}
