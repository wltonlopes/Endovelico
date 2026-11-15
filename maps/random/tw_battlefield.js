/**
 * Campo de batalha (Total Warfield).
 *
 * Mapa sem bases: dois exércitos frente a frente. O jogador 1 desdobra ao
 * sul e o 2 ao norte (maps/scripts/TWFieldBattle.js cria os exércitos e
 * usa as mesmas posições: TW_DEPLOY_DISTANCE do centro). O relevo depende
 * de settings.TotalWarfield.terrain, que a campanha escolhe pela província:
 *   plains   planície aberta com bosques e colinas suaves
 *   forest   bosques densos entre os exércitos
 *   hills    colinas altas (vantagem de quem está em cima)
 *   river    rio no meio, atravessável só pelos vaus
 *   coast    mar num dos flancos
 *   pass     montanhas nos dois flancos (desfiladeiro)
 *   desert   areia, dunas, poucas árvores
 * Sem settings (partida comum), escolhe um terreno ao acaso.
 */
Engine.LoadLibrary("rmgen");
Engine.LoadLibrary("rmgen-common");
Engine.LoadLibrary("rmbiome");

/** Distância das zonas de desdobramento ao centro (fração do mapa). */
const TW_DEPLOY_DISTANCE = 0.32;
/** Raio da área livre em volta de cada zona (tiles); maior com cidade. */
const TW_DEPLOY_RADIUS = 26;
const TW_SETTLEMENT_RADIUS = 34;
const TW_TERRAINS = ["plains", "forest", "hills", "river", "coast", "pass", "desert"];

export function* generateMap(mapSettings)
{
	setBiome(mapSettings.Biome);
	const tw = mapSettings.TotalWarfield || {};
	const terrainType = TW_TERRAINS.indexOf(tw.terrain) != -1 ? tw.terrain : pickRandom(TW_TERRAINS);

	const tMain = g_Terrains.mainTerrain;
	const tForestFloor1 = g_Terrains.forestFloor1;
	const tForestFloor2 = g_Terrains.forestFloor2;
	const tCliff = g_Terrains.cliff;
	const tTier1 = g_Terrains.tier1Terrain;
	const tTier2 = g_Terrains.tier2Terrain;
	const tTier3 = g_Terrains.tier3Terrain;
	const tTier4 = g_Terrains.tier4Terrain;
	const tHill = g_Terrains.hill;
	const tRoad = g_Terrains.road;
	const tRoadWild = g_Terrains.roadWild;
	const tShore = g_Terrains.shore || g_Terrains.tier2Terrain;
	const tWater = g_Terrains.water || g_Terrains.tier3Terrain;

	const oTree1 = g_Gaia.tree1;
	const oTree2 = g_Gaia.tree2;
	const oTree3 = g_Gaia.tree3;
	const oTree4 = g_Gaia.tree4;
	const oTree5 = g_Gaia.tree5;

	const aGrass = g_Decoratives.grass;
	const aGrassShort = g_Decoratives.grassShort;
	const aRockLarge = g_Decoratives.rockLarge;
	const aRockMedium = g_Decoratives.rockMedium;
	const aBushMedium = g_Decoratives.bushMedium;
	const aBushSmall = g_Decoratives.bushSmall;

	const pForest1 = [tForestFloor2 + TERRAIN_SEPARATOR + oTree1, tForestFloor2 + TERRAIN_SEPARATOR + oTree2, tForestFloor2];
	const pForest2 = [tForestFloor1 + TERRAIN_SEPARATOR + oTree4, tForestFloor1 + TERRAIN_SEPARATOR + oTree5, tForestFloor1];

	const heightLand = 3;
	const heightRiverbed = -3;
	const heightFord = -0.8;
	globalThis.g_Map = new RandomMap(heightLand, tMain);
	const mapSize = g_Map.getSize();
	const center = g_Map.getCenter();

	const clDeploy = g_Map.createTileClass();
	const clHill = g_Map.createTileClass();
	const clForest = g_Map.createTileClass();
	const clWater = g_Map.createTileClass();
	const clDirt = g_Map.createTileClass();
	const clRoad = g_Map.createTileClass();

	// Zonas de desdobramento: sul (jogador 1) e norte (jogador 2).
	const deploy = [
		new Vector2D(center.x, center.y - mapSize * TW_DEPLOY_DISTANCE),
		new Vector2D(center.x, center.y + mapSize * TW_DEPLOY_DISTANCE)
	];
	const settlementPlayer = tw.settlement ? +tw.settlement.player : 0;
	for (let i = 0; i < deploy.length; ++i)
		createArea(
			new ClumpPlacer(diskArea(i + 1 == settlementPlayer ? TW_SETTLEMENT_RADIUS : TW_DEPLOY_RADIUS), 0.9, 0.5, Infinity, deploy[i]),
			[new TerrainPainter(tRoadWild), new SmoothElevationPainter(ELEVATION_SET, heightLand, 8), new TileClassPainter(clDeploy)]);

	// Estrada ligando os dois lados (marca visual da linha de avanço).
	createArea(
		new PathPlacer(deploy[0], deploy[1], 4, 0.4, 3, 0.2, 0.05),
		[new TerrainPainter(tRoad), new TileClassPainter(clRoad)],
		avoidClasses(clDeploy, 2));
	yield 20;

	if (terrainType == "river")
	{
		// Rio de oeste a leste, com 2 ou 3 vaus.
		const fords = randIntInclusive(2, 3);
		const fordAt = [];
		for (let i = 0; i < fords; ++i)
			fordAt.push((i + 0.5) / fords + randFloat(-0.08, 0.08));
		paintRiver({
			"parallel": false,
			"start": new Vector2D(0, center.y),
			"end": new Vector2D(mapSize, center.y),
			"width": scaleByMapSize(10, 22),
			"fadeDist": 6,
			"deviation": 0.5,
			"heightRiverbed": heightRiverbed,
			"heightLand": heightLand,
			"meanderShort": 12,
			"meanderLong": 0,
			"waterFunc": (position, height, riverFraction) => {
				clWater.add(position);
				const isFord = fordAt.some(f => Math.abs(riverFraction - f) < 0.035);
				if (isFord)
				{
					g_Map.setHeight(position, Math.max(height, heightFord));
					createTerrain(tShore).place(position);
				}
				else if (height < heightFord)
					createTerrain(tWater).place(position);
			},
			"landFunc": (position, shoreDist1, shoreDist2) => {
				if (shoreDist1 > -4 && shoreDist1 < 0 || shoreDist2 > 0 && shoreDist2 < 4)
					createTerrain(tShore).place(position);
			}
		});
	}
	else if (terrainType == "coast")
	{
		// Mar no flanco leste.
		const side = randBool() ? 1 : -1;
		createArea(
			new ConvexPolygonPlacer([
				new Vector2D(side > 0 ? mapSize * 0.82 : 0, 0),
				new Vector2D(side > 0 ? mapSize : mapSize * 0.18, 0),
				new Vector2D(side > 0 ? mapSize : mapSize * 0.18, mapSize),
				new Vector2D(side > 0 ? mapSize * 0.82 : 0, mapSize)
			], Infinity),
			[new SmoothElevationPainter(ELEVATION_SET, -6, 10), new TileClassPainter(clWater)],
			avoidClasses(clDeploy, 6));
		paintTerrainBasedOnHeight(-10, 0.5, 1, tWater);
		paintTerrainBasedOnHeight(0.5, 2, 1, tShore);
	}
	else if (terrainType == "pass")
	{
		// Montanhas nos dois flancos.
		for (const x of [mapSize * 0.1, mapSize * 0.9])
			for (let z = mapSize * 0.05; z < mapSize; z += mapSize / 8)
				createMountain(
					scaleByMapSize(28, 40), Math.floor(scaleByMapSize(10, 16)), Math.floor(scaleByMapSize(16, 26)),
					Math.floor(scaleByMapSize(4, 8)),
					avoidClasses(clDeploy, 6), x + randFloat(-8, 8), z, tCliff, clHill, 14);
	}
	yield 40;

	// Relevo e vegetação entre as zonas.
	const hillCount = { "plains": 4, "forest": 3, "hills": 10, "river": 3, "coast": 3, "pass": 2, "desert": 5 }[terrainType];
	createBumps(avoidClasses(clDeploy, 4, clWater, 2), scaleByMapSize(40, 160));
	createHills([tHill, tHill, tTier1], avoidClasses(clDeploy, 8, clHill, 18, clWater, 6, clRoad, 3), clHill,
		scaleByMapSize(hillCount, hillCount * 3), Math.floor(scaleByMapSize(6, 10)), Math.floor(scaleByMapSize(12, 20)),
		undefined, 0.5, terrainType == "hills" ? 14 : 7, 6);

	const forestFactor = { "plains": 0.5, "forest": 2.2, "hills": 0.6, "river": 0.8, "coast": 0.6, "pass": 0.8, "desert": 0.15 }[terrainType];
	const [forestTrees, stragglerTrees] = getTreeCounts(...rBiomeTreeCount(forestFactor));
	createDefaultForests(
		[tMain, tForestFloor1, tForestFloor2, pForest1, pForest2],
		avoidClasses(clDeploy, 10, clForest, terrainType == "forest" ? 10 : 22, clHill, 0, clWater, 3, clRoad, 2),
		clForest,
		forestTrees);
	yield 60;

	createLayeredPatches(
		[scaleByMapSize(3, 6), scaleByMapSize(5, 10), scaleByMapSize(8, 21)],
		[[tMain, tTier1], [tTier1, tTier2], [tTier2, tTier3]],
		[1, 1],
		avoidClasses(clForest, 0, clHill, 0, clDirt, 5, clWater, 2, clDeploy, 2),
		scaleByMapSize(15, 45),
		clDirt);
	createPatches(
		[scaleByMapSize(2, 4), scaleByMapSize(3, 7), scaleByMapSize(5, 15)],
		tTier4,
		avoidClasses(clForest, 0, clHill, 0, clDirt, 5, clWater, 2, clDeploy, 2),
		scaleByMapSize(15, 45),
		clDirt);
	yield 75;

	createDecoration(
		[
			[new SimpleObject(aRockMedium, 1, 3, 0, 1)],
			[new SimpleObject(aRockLarge, 1, 2, 0, 1), new SimpleObject(aRockMedium, 1, 3, 0, 2)],
			[new SimpleObject(aGrassShort, 1, 2, 0, 1)],
			[new SimpleObject(aGrass, 2, 4, 0, 1.8), new SimpleObject(aGrassShort, 3, 6, 1.2, 2.5)],
			[new SimpleObject(aBushMedium, 1, 2, 0, 2), new SimpleObject(aBushSmall, 2, 4, 0, 2)]
		],
		[
			scaleByMapAreaAbsolute(16),
			scaleByMapAreaAbsolute(8),
			scaleByMapAreaAbsolute(13),
			scaleByMapAreaAbsolute(13),
			scaleByMapAreaAbsolute(13)
		],
		avoidClasses(clForest, 0, clWater, 1, clDeploy, 4, clRoad, 0));

	createStragglerTrees(
		[oTree1, oTree2, oTree4, oTree3],
		avoidClasses(clForest, 6, clHill, 1, clWater, 3, clDeploy, 12, clRoad, 2),
		clForest,
		stragglerTrees);
	yield 90;

	return g_Map;
}
