/**
 * Iberia (Lusitania): fauna of the Lusitania catalog (tools/import_fauna_catalog.py and
 * import_fauna_transfer.py) on a Mediterranean landscape.
 */
function setupBiome_iberia()
{
	[g_Gaia.tree1, g_Gaia.tree2] = pickRandom([
		["gaia/tree/pine_maritime", "gaia/tree/oak_holly"],
		["gaia/tree/oak_holly", "gaia/tree/oak"],
		["gaia/tree/pine_maritime", "gaia/tree/euro_beech"]
	]);

	g_Gaia.tree3 = pickRandom([
		"gaia/tree/olive",
		"gaia/tree/juniper_prickly",
		"gaia/tree/carob"
	]);

	[g_Gaia.tree4, g_Gaia.tree5] = pickRandom([
		["gaia/tree/oak", "gaia/tree/pine_maritime_short"],
		["gaia/tree/poplar_lombardy", "gaia/tree/cypress_wild"]
	]);

	g_Gaia.fruitBush = pickRandom([
		"gaia/fruit/berry_01",
		"gaia/fruit/grapes"
	]);

	// Near the bases.
	g_Gaia.startingAnimal = pickRandom([
		"gaia/fauna_hen_iberian",
		"gaia/fauna_rooster_iberian",
		"gaia/fauna_partridge",
		"gaia/fauna_goose_greylag"
	]);

	g_Gaia.mainHuntableAnimal = pickRandom([
		"gaia/fauna_deer_red",
		"gaia/fauna_deer_roe",
		"gaia/fauna_deer_fallow",
		"gaia/fauna_goat_lusitanian"
	]);

	// Never the same species as the main one.
	g_Gaia.secondaryHuntableAnimal = pickRandom([
		"gaia/fauna_boar_iberian",
		"gaia/fauna_aurochs",
		"gaia/fauna_horse_sorraia",
		"gaia/fauna_wild_ass_european",
		"gaia/fauna_deer_red_female",
		"gaia/fauna_deer_fallow_female"
	].filter(animal => animal != g_Gaia.mainHuntableAnimal));

	g_Gaia.smallAnimal = pickRandom([
		"gaia/fauna_rabbit_european",
		"gaia/fauna_hare_iberian",
		"gaia/fauna_squirrel_red",
		"gaia/fauna_hedgehog_european",
		"gaia/fauna_capercaillie",
		"gaia/fauna_partridge"
	]);

	g_Gaia.predator = pickRandom([
		"gaia/fauna_wolf_iberian",
		"gaia/fauna_lynx_iberian",
		"gaia/fauna_bear_cantabrian",
		"gaia/fauna_fox_red_iberian",
		"gaia/fauna_wildcat_european"
	]);
}
