Engine.LoadLibrary("rmgen");
Engine.LoadLibrary("rmgen-common");
Engine.LoadLibrary("rmbiome");

/**
 * Pampas: open grassland broken by "capões", the groves of Paraná pine (Araucaria angustifolia),
 * pinheiro-bravo (Podocarpus lambertii) and scrub that dot the southern Brazilian fields, with lone
 * araucarias on the plain.
 * Layout from the vanilla Mainland map; biome generic/pampas.
 */
export function* generateMap(mapSettings)
{
	setBiome("generic/pampas");

	const tMainTerrain = g_Terrains.mainTerrain;
	const tForestFloor1 = g_Terrains.forestFloor1;
	const tForestFloor2 = g_Terrains.forestFloor2;
	const tCliff = g_Terrains.cliff;
	const tTier1Terrain = g_Terrains.tier1Terrain;
	const tTier2Terrain = g_Terrains.tier2Terrain;
	const tTier3Terrain = g_Terrains.tier3Terrain;
	const tHill = g_Terrains.hill;
	const tRoad = g_Terrains.road;
	const tRoadWild = g_Terrains.roadWild;
	const tTier4Terrain = g_Terrains.tier4Terrain;

	const oAraucaria = "gaia/tree/araucaria_angustifolia";
	const oPodocarpus = "gaia/tree/podocarpus_lambertii";
	const oBush = g_Gaia.tree1;
	const oTree2 = g_Gaia.tree2;
	const oBushSteppe = g_Gaia.tree3;
	const oFruitBush = g_Gaia.fruitBush;
	const oMainHuntableAnimal = g_Gaia.mainHuntableAnimal;
	const oSecondaryHuntableAnimal = g_Gaia.secondaryHuntableAnimal;
	const oSmallAnimal = g_Gaia.smallAnimal;
	const oPredator = g_Gaia.predator;
	const oStoneLarge = g_Gaia.stoneLarge;
	const oStoneSmall = g_Gaia.stoneSmall;
	const oMetalLarge = g_Gaia.metalLarge;
	const oMetalSmall = g_Gaia.metalSmall;

	const aGrass = g_Decoratives.grass;
	const aGrassShort = g_Decoratives.grassShort;
	const aRockLarge = g_Decoratives.rockLarge;
	const aRockMedium = g_Decoratives.rockMedium;
	const aBushMedium = g_Decoratives.bushMedium;
	const aBushSmall = g_Decoratives.bushSmall;

	// Capões: araucarias standing over pinheiros-bravos and scrub; the second kind mixes in the
	// biome's broadleaf tree.
	const pForest1 = [
		tForestFloor2 + TERRAIN_SEPARATOR + oAraucaria,
		tForestFloor2 + TERRAIN_SEPARATOR + oAraucaria,
		tForestFloor2 + TERRAIN_SEPARATOR + oPodocarpus,
		tForestFloor2 + TERRAIN_SEPARATOR + oBush,
		tForestFloor2
	];
	const pForest2 = [
		tForestFloor1 + TERRAIN_SEPARATOR + oAraucaria,
		tForestFloor1 + TERRAIN_SEPARATOR + oPodocarpus,
		tForestFloor1 + TERRAIN_SEPARATOR + oTree2,
		tForestFloor1 + TERRAIN_SEPARATOR + oBushSteppe,
		tForestFloor1
	];

	const heightLand = 3;

	globalThis.g_Map = new RandomMap(heightLand, tMainTerrain);

	const numPlayers = getNumPlayers();

	const clPlayer = g_Map.createTileClass();
	const clHill = g_Map.createTileClass();
	const clForest = g_Map.createTileClass();
	const clDirt = g_Map.createTileClass();
	const clRock = g_Map.createTileClass();
	const clMetal = g_Map.createTileClass();
	const clFood = g_Map.createTileClass();
	const clBaseResource = g_Map.createTileClass();

	const { playerIDs, playerPosition } =
		playerPlacementByPattern(
			mapSettings.PlayerPlacement,
			fractionToTiles(0.35),
			fractionToTiles(0.1),
			randomAngle(),
			undefined);

	placePlayerBases({
		"PlayerPlacement": [playerIDs, playerPosition],
		"PlayerTileClass": clPlayer,
		"BaseResourceClass": clBaseResource,
		"CityPatch": {
			"outerTerrain": tRoadWild,
			"innerTerrain": tRoad
		},
		"StartingAnimal": {
		},
		"Berries": {
			"template": oFruitBush
		},
		"Mines": {
			"types": [
				{ "template": oMetalLarge },
				{ "template": oStoneLarge }
			]
		},
		"Trees": {
			"template": oAraucaria,
			"count": 5
		}
	});
	yield 20;

	// Gently rolling fields: bumps and a few low hills, no mountains.
	createBumps(avoidClasses(clPlayer, 20));
	createHills([tCliff, tHill, tHill],
		avoidClasses(clPlayer, 20, clHill, 20), clHill, scaleByMapSize(2, 8));

	g_Map.log("Creating araucaria groves");
	const [forestTrees, stragglerTrees] = getTreeCounts(...rBiomeTreeCount(1));
	createDefaultForests(
		[tMainTerrain, tForestFloor1, tForestFloor2, pForest1, pForest2],
		avoidClasses(clPlayer, 20, clForest, 22, clHill, 0),
		clForest,
		forestTrees);

	yield 50;

	g_Map.log("Creating dirt patches");
	createLayeredPatches(
		[scaleByMapSize(3, 6), scaleByMapSize(5, 10), scaleByMapSize(8, 21)],
		[[tMainTerrain, tTier1Terrain], [tTier1Terrain, tTier2Terrain], [tTier2Terrain, tTier3Terrain]],
		[1, 1],
		avoidClasses(clForest, 0, clHill, 0, clDirt, 5, clPlayer, 12),
		scaleByMapSize(15, 45),
		clDirt);

	g_Map.log("Creating grass patches");
	createPatches(
		[scaleByMapSize(2, 4), scaleByMapSize(3, 7), scaleByMapSize(5, 15)],
		tTier4Terrain,
		avoidClasses(clForest, 0, clHill, 0, clDirt, 5, clPlayer, 12),
		scaleByMapSize(15, 45),
		clDirt);
	yield 55;

	g_Map.log("Creating metal mines");
	createBalancedMetalMines(
		oMetalSmall,
		oMetalLarge,
		clMetal,
		avoidClasses(clForest, 1, clPlayer, scaleByMapSize(20, 35), clHill, 1)
	);

	g_Map.log("Creating stone mines");
	createBalancedStoneMines(
		oStoneSmall,
		oStoneLarge,
		clRock,
		avoidClasses(clForest, 1, clPlayer, scaleByMapSize(20, 35), clHill, 1, clMetal, 10)
	);

	yield 65;

	// Tall grass everywhere: it is the pampa.
	createDecoration(
		[
			[new SimpleObject(aRockMedium, 1, 3, 0, 1)],
			[new SimpleObject(aRockLarge, 1, 2, 0, 1), new SimpleObject(aRockMedium, 1, 3, 0, 2)],
			[new SimpleObject(aGrassShort, 1, 2, 0, 1)],
			[new SimpleObject(aGrass, 2, 4, 0, 1.8), new SimpleObject(aGrassShort, 3, 6, 1.2, 2.5)],
			[new SimpleObject(aBushMedium, 1, 2, 0, 2), new SimpleObject(aBushSmall, 2, 4, 0, 2)]
		],
		[
			scaleByMapAreaAbsolute(8),
			scaleByMapAreaAbsolute(4),
			3 * scaleByMapAreaAbsolute(13),
			3 * scaleByMapAreaAbsolute(13),
			scaleByMapAreaAbsolute(13)
		],
		avoidClasses(clForest, 0, clPlayer, 10, clHill, 0));

	yield 70;

	// Herds graze the open field, away from the groves.
	createFood(
		[
			[new SimpleObject(oMainHuntableAnimal, 5, 8, 0, 4)],
			[new SimpleObject(oSecondaryHuntableAnimal, 2, 4, 0, 2)],
			[new SimpleObject(oSmallAnimal, 1, 3, 0, 2)]
		],
		[
			4 * numPlayers,
			3 * numPlayers,
			2 * numPlayers
		],
		avoidClasses(clForest, 2, clPlayer, 20, clHill, 1, clMetal, 4, clRock, 4, clFood, 20),
		clFood);

	// Predators keep to the edge of the groves.
	createFood(
		[
			[new SimpleObject(oPredator, 1, 2, 0, 2)]
		],
		[
			numPlayers
		],
		[avoidClasses(clPlayer, 30, clFood, 10, clHill, 1), borderClasses(clForest, 4, 6)],
		clFood);

	yield 75;

	createFood(
		[
			[new SimpleObject(oFruitBush, 5, 7, 0, 4)]
		],
		[
			3 * numPlayers
		],
		avoidClasses(clForest, 0, clPlayer, 20, clHill, 1, clMetal, 4, clRock, 4, clFood, 10),
		clFood);

	yield 85;

	// Lone araucarias standing over the field, the landmark of the region.
	createStragglerTrees(
		[oAraucaria, oAraucaria, oPodocarpus, oBush, oBushSteppe],
		avoidClasses(clForest, 8, clHill, 1, clPlayer, 12, clMetal, 6, clRock, 6, clFood, 1),
		clForest,
		stragglerTrees);

	placePlayersNomad(clPlayer, avoidClasses(clForest, 1, clMetal, 4, clRock, 4, clHill, 4, clFood, 2));

	return g_Map;
}
