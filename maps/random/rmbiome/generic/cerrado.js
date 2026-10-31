function setupBiome_cerrado()
{
	g_Gaia.startingAnimal = pickRandom([
		"gaia/fauna_tinamou",
		"gaia/fauna_curassow",
		"gaia/fauna_guan_crested"
	]);

	g_Gaia.mainHuntableAnimal = pickRandom([
		"gaia/fauna_brocket_red",
		"gaia/fauna_peccary",
		"gaia/fauna_deer_white_tailed"
	]);

	// Never the same species as the main one.
	g_Gaia.secondaryHuntableAnimal = pickRandom([
		"gaia/fauna_tapir",
		"gaia/fauna_peccary",
		"gaia/fauna_tapeti",
		"gaia/fauna_paca"
	].filter(animal => animal != g_Gaia.mainHuntableAnimal));

	g_Gaia.smallAnimal = pickRandom([
		"gaia/fauna_tapeti",
		"gaia/fauna_paca",
		"gaia/fauna_anteater_02",
		"gaia/fauna_tamandua",
		"gaia/fauna_skunk",
		"gaia/fauna_opossum",
		"gaia/fauna_toad_cane"
	]);

	g_Gaia.predator = pickRandom([
		"gaia/fauna_jaguar_02",
		"gaia/fauna_puma",
		"gaia/fauna_ocelot",
		"gaia/fauna_fox_gray_02",
		"gaia/fauna_boa_constrictor"
	]);

	g_Gaia.tree3 = pickRandom([
		"gaia/tree/palm_tropic",
		"gaia/tree/palm_tropical"
	]);
}
