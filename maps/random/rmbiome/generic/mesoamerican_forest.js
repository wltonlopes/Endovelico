function setupBiome_mesoamerican_forest()
{
	g_Gaia.startingAnimal = pickRandom([
		"gaia/fauna_turkey",
		"gaia/fauna_chachalaca",
		"gaia/fauna_curassow",
		"gaia/fauna_guan_crested"
	]);

	g_Gaia.mainHuntableAnimal = pickRandom([
		"gaia/fauna_deer_white_tailed_02",
		"gaia/fauna_deer_white_tailed_02_female",
		"gaia/fauna_brocket_yucatan",
		"gaia/fauna_brocket_red"
	]);

	// Never the same species as the main one.
	g_Gaia.secondaryHuntableAnimal = pickRandom([
		"gaia/fauna_peccary",
		"gaia/fauna_tapir",
		"gaia/fauna_monkey_howler",
		"gaia/fauna_monkey_spider",
		"gaia/fauna_paca"
	].filter(animal => animal != g_Gaia.mainHuntableAnimal));

	g_Gaia.smallAnimal = pickRandom([
		"gaia/fauna_paca",
		"gaia/fauna_squirrel",
		"gaia/fauna_iguana_green",
		"gaia/fauna_iguana_motagua",
		"gaia/fauna_basilisk",
		"gaia/fauna_coati",
		"gaia/fauna_opossum",
		"gaia/fauna_tamandua",
		"gaia/fauna_raccoon"
	]);

	g_Gaia.predator = pickRandom([
		"gaia/fauna_jaguar_02",
		"gaia/fauna_puma",
		"gaia/fauna_ocelot",
		"gaia/fauna_margay",
		"gaia/fauna_jaguarundi",
		"gaia/fauna_crocodile_morelet",
		"gaia/fauna_boa_constrictor"
	]);

	g_Gaia.fruitBush = pickRandom([
		"gaia/fruit/fig",
		"gaia/fruit/banana"
	]);
}
