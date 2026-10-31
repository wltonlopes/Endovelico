function setupBiome_amazon()
{
	g_Gaia.startingAnimal = pickRandom([
		"gaia/fauna_curassow",
		"gaia/fauna_curassow_female",
		"gaia/fauna_guan_crested",
		"gaia/fauna_tinamou"
	]);

	g_Gaia.mainHuntableAnimal = pickRandom([
		"gaia/fauna_peccary",
		"gaia/fauna_brocket_red",
		"gaia/fauna_tapir"
	]);

	// Never the same species as the main one.
	g_Gaia.secondaryHuntableAnimal = pickRandom([
		"gaia/fauna_tapir",
		"gaia/fauna_monkey_howler",
		"gaia/fauna_monkey_spider",
		"gaia/fauna_paca",
		"gaia/fauna_brocket_red"
	].filter(animal => animal != g_Gaia.mainHuntableAnimal));

	g_Gaia.smallAnimal = pickRandom([
		"gaia/fauna_paca",
		"gaia/fauna_tapeti",
		"gaia/fauna_iguana_green",
		"gaia/fauna_toad_cane",
		"gaia/fauna_opossum",
		"gaia/fauna_tamandua",
		"gaia/fauna_otter_tropical"
	]);

	g_Gaia.predator = pickRandom([
		"gaia/fauna_jaguar_02",
		"gaia/fauna_panther_black",
		"gaia/fauna_ocelot",
		"gaia/fauna_caiman",
		"gaia/fauna_boa_constrictor"
	]);

	[g_Gaia.tree4, g_Gaia.tree5] = pickRandom([
		[
			"gaia/tree/palm_tropic",
			"gaia/tree/palm_tropical"
		],
		[
			"gaia/tree/palm_tropical",
			"gaia/tree/mangrove"
		],
		[
			"gaia/tree/palm_royal",
			"gaia/tree/palm_tropic"
		]
	]);
}
