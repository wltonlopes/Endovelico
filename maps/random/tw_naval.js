/**
 * Mar aberto para as batalhas navais (Total Warfield).
 *
 * Duas esquadras frente a frente: o jogador 1 ao sul e o 2 ao norte, nas
 * mesmas posições das batalhas em terra (TW_DEPLOY_DISTANCE do centro;
 * maps/scripts/TWNavalBattle.js cria os navios). Algumas ilhotas com
 * árvores e rochedos dão onde manobrar, longe das zonas de desdobramento e
 * do corredor entre elas.
 */
Engine.LoadLibrary("rmgen");
Engine.LoadLibrary("rmgen-common");
Engine.LoadLibrary("rmbiome");

const TW_DEPLOY_DISTANCE = 0.32;

export function* generateMap(mapSettings)
{
	setBiome(mapSettings.Biome);
	const tMain = g_Terrains.mainTerrain;
	const tShore = g_Terrains.shore || g_Terrains.tier2Terrain;
	const tWater = g_Terrains.water || g_Terrains.tier3Terrain;
	const tCliff = g_Terrains.cliff;
	const oTrees = [g_Gaia.tree1, g_Gaia.tree2, g_Gaia.tree3, g_Gaia.tree4].filter(Boolean);
	const aRockLarge = g_Decoratives.rockLarge;
	const aRockMedium = g_Decoratives.rockMedium;

	const heightSea = -7;
	const heightLand = 2.5;
	globalThis.g_Map = new RandomMap(heightSea, tWater);
	const mapSize = g_Map.getSize();
	const center = g_Map.getCenter();

	const clDeploy = g_Map.createTileClass();
	const clLand = g_Map.createTileClass();
	const clLane = g_Map.createTileClass();
	const clForest = g_Map.createTileClass();

	// Zonas das esquadras e o corredor entre elas ficam livres.
	const deploy = [
		new Vector2D(center.x, center.y - mapSize * TW_DEPLOY_DISTANCE),
		new Vector2D(center.x, center.y + mapSize * TW_DEPLOY_DISTANCE)
	];
	for (const position of deploy)
		createArea(new ClumpPlacer(diskArea(scaleByMapSize(30, 46)), 1, 1, Infinity, position), [new TileClassPainter(clDeploy)]);
	createArea(new PathPlacer(deploy[0], deploy[1], scaleByMapSize(26, 40), 0, 1, 0, 0), [new TileClassPainter(clLane)]);
	yield 20;

	// Ilhotas nos flancos.
	const islands = randIntInclusive(4, 7);
	for (let i = 0; i < islands; ++i)
		createAreas(
			new ClumpPlacer(diskArea(randFloat(scaleByMapSize(4, 6), scaleByMapSize(8, 13))), 0.6, 0.15, Infinity),
			[
				new LayeredPainter([tShore, tMain], [2]),
				new SmoothElevationPainter(ELEVATION_SET, heightLand, 4),
				new TileClassPainter(clLand)
			],
			avoidClasses(clDeploy, 12, clLane, 6, clLand, 22),
			1, 40);
	yield 50;

	// Rochedos soltos no mar (perigo para quem manobra perto).
	createAreas(
		new ClumpPlacer(diskArea(2), 0.9, 0.5, Infinity),
		[new LayeredPainter([tCliff, tShore], [1]), new SmoothElevationPainter(ELEVATION_SET, 1.5, 1), new TileClassPainter(clLand)],
		avoidClasses(clDeploy, 14, clLane, 4, clLand, 12),
		scaleByMapSize(3, 8), 30);
	yield 65;

	paintTerrainBasedOnHeight(-10, -1, 1, tWater);
	paintTerrainBasedOnHeight(-1, 1.2, 1, tShore);
	if (oTrees.length)
		createStragglerTrees(oTrees, [stayClasses(clLand, 2), avoidClasses(clForest, 1)], clForest, scaleByMapSize(40, 120));
	createDecoration(
		[[new SimpleObject(aRockMedium, 1, 3, 0, 1)], [new SimpleObject(aRockLarge, 1, 2, 0, 1)]],
		[scaleByMapAreaAbsolute(6), scaleByMapAreaAbsolute(3)],
		stayClasses(clLand, 1));
	yield 90;

	return g_Map;
}
