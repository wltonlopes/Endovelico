function setupBiome_semi_arid()
{
	[g_Gaia.tree1, g_Gaia.tree2] = pickRandom([
		[
			"gaia/tree/flora_cactus_stenocerus_large",
			"gaia/tree/flora_cactus_stenocerus_small",
			"gaia/tree/date_palm",
			"gaia/tree/oak"
		]
	]);

	[g_Gaia.tree4, g_Gaia.tree5] = new Array(2).fill(pickRandom([
		"gaia/tree/oak",
		"gaia/tree/oak"
	]));
}
