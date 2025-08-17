Engine.LoadLibrary("rmgen");
Engine.LoadLibrary("rmgen-common");
Engine.LoadLibrary("rmgen2");
Engine.LoadLibrary("rmbiome");

setBiome("generic/temperate");

// Configurações de terreno (usando arrays para cada camada)
g_Terrains.mainTerrain = "temperate_grass";
g_Terrains.forestFloor1 = "temperate_grass_aut";
g_Terrains.forestFloor2 = "temperate_grass_c";
g_Terrains.tier1Terrain = "temperate_grass_dry";
g_Terrains.tier2Terrain = "temperate_grass_b";
g_Terrains.tier3Terrain = "temperate_grass_a";
g_Terrains.tier4Terrain = "temperate_grass_e";

// Configurações de Gaia
g_Gaia.mainHuntableAnimal = "gaia/fauna_llama";          // Guanacos
g_Gaia.secondaryHuntableAnimal = "gaia/fauna_deer";      // Veados-campeiros
g_Gaia.chicken = "gaia/fauna_rabbit";                    // Maras
g_Gaia.tree1 = "gaia/flora_tree_oak";                    // Carvalhos
g_Gaia.tree2 = "gaia/flora_tree_poplar_lombardy";        // Álamos
g_Gaia.tree3 = "gaia/flora_tree_pine";                   // Pinheiros
g_Gaia.tree4 = "gaia/flora_tree_apple";                  // Macieiras
g_Gaia.tree5 = "gaia/flora_tree_elm";                    // Olmos
g_Gaia.woodTreasure = "gaia/treasure/wood";
g_Gaia.foodTreasure = "gaia/treasure/food_bin";

// Decorativos
g_Decoratives.grass = "actor|props/flora/grass_soft_large_temperate.xml";
g_Decoratives.grassShort = "actor|props/flora/grass_soft_small_temperate.xml";
g_Decoratives.rockLarge = "actor|geology/stone_granite_med.xml";
g_Decoratives.rockMedium = "actor|geology/stone_granite_small.xml";
g_Decoratives.bushMedium = "actor|flora/bushes/temperate_bush_biome.xml";
g_Decoratives.bushSmall = "actor|props/flora/bush_temperate.xml";

const heightScale = num => num * g_MapSettings.Size / 320;

const g_Map = new RandomMap(0, g_Terrains.mainTerrain);
const mapBounds = g_Map.getBounds();
const mapCenter = g_Map.getCenter();

// Classes de tiles
var clForest = g_Map.createTileClass();
var clPlayer = g_Map.createTileClass();
var clBaseResource = g_Map.createTileClass();

initTileClasses();

g_Map.log("Criando terreno base");
createArea(
  new MapBoundsPlacer(),
  new TerrainPainter(g_Terrains.mainTerrain)
);
Engine.SetProgress(10);

g_Map.log("Criando colinas suaves");
// CORREÇÃO: Usar TerrainPainter com array de terrenos
createLayeredPatches(
  [scaleByMapSize(4, 8), scaleByMapSize(6, 12)],
  [
    [
      new TerrainPainter(g_Terrains.tier1Terrain),
      new SmoothElevationPainter(ELEVATION_SET, 5, 3)
    ],
    [
      new TerrainPainter(g_Terrains.tier2Terrain),
      new SmoothElevationPainter(ELEVATION_SET, 10, 5)
    ]
  ],
  avoidClasses(clPlayer, 20, clForest, 10),
  50
);

g_Map.log("Adicionando vegetação rasteira");
// Arbustos
createGrassPatches(
  [new SimpleObject(g_Decoratives.bushMedium, 1, 3, 0, 1)],
  avoidClasses(clPlayer, 15, clForest, 5),
  scaleByMapSize(300, 600),
  40
);

// Grama
createGrassPatches(
  [new SimpleObject(g_Decoratives.grass, 1, 2, 0, 1)],
  avoidClasses(clPlayer, 10),
  scaleByMapSize(500, 1000),
  20
);

g_Map.log("Criando bosques esparsos");
// CORREÇÃO: Usar createForest com sintaxe correta
createForest(
  [
    new SimpleObject(g_Gaia.tree1, 1, 3, 0, 2),
    new SimpleObject(g_Gaia.tree2, 1, 2, 0, 2),
    new SimpleObject(g_Decoratives.bushSmall, 2, 4, 0, 1)
  ],
  avoidClasses(clPlayer, 20),
  scaleByMapSize(15, 30),
  scaleByMapSize(8, 15),
  scaleByMapSize(5, 10)
);

g_Map.log("Adicionando recursos minerais");
// Pedras
placeObjectGroups(
  new SimpleObject("gaia/geology_stone_pile", 3, 5, 0, 15),
  avoidClasses(clPlayer, 20, clForest, 5),
  scaleByMapSize(15, 30)
);

// Metais
placeObjectGroups(
  new SimpleObject("gaia/geology_metal_pile", 2, 4, 0, 20),
  avoidClasses(clPlayer, 25, clForest, 5),
  scaleByMapSize(10, 20)
);

g_Map.log("Adicionando fauna característica");
// Animais
const animals = [
  { template: g_Gaia.mainHuntableAnimal, min: 8, max: 12, dist: 20 },
  { template: g_Gaia.secondaryHuntableAnimal, min: 6, max: 10, dist: 20 },
  { template: g_Gaia.chicken, min: 15, max: 20, dist: 10 },
  { template: "gaia/fauna_boar", min: 4, max: 6, dist: 25 }
];

animals.forEach(animal => {
  placeObjectGroups(
    new SimpleObject(animal.template, animal.min, animal.max, 0, animal.dist),
    avoidClasses(clPlayer, 30, clForest, 10),
    scaleByMapSize(animal.min * 2, animal.max * 3)
  );
});

// Anta (representada por rinoceronte)
placeObjectGroups(
  new SimpleObject("gaia/fauna_rhino", 1, 1, 0, 30),
  avoidClasses(clPlayer, 40, clForest, 15),
  1
);

g_Map.log("Colocando bases dos jogadores");
// CORREÇÃO: Sintaxe atualizada para placePlayerBases
placePlayerBases({
  "PlayerPlacement": [1, 6, 0, 0, 5, 9],
  "PlayerTileClass": clPlayer,
  "BaseResourceClass": clBaseResource,
  "CityPatch": {
    "outerTerrain": g_Terrains.tier1Terrain,
    "innerTerrain": g_Terrains.tier2Terrain
  },
  "Chicken": {
    "template": g_Gaia.chicken
  },
  "Berries": {
    "template": "gaia/flora_bush_berry"
  },
  "Mines": [
    { "template": "gaia/geology_metal_iberia" },
    { "template": "gaia/geology_stone_granite" }
  ],
  "Trees": [
    { "template": g_Gaia.tree1, "count": 3 }
  ],
  "Decoratives": [
    { "template": g_Decoratives.rockMedium }
  ]
});

// Configurações de ambiente
setSunRotation(-Math.PI * 0.75);
setSunElevation(Math.PI / 4);

setWaterHeight(0);
setWaterTint(0.5, 0.5, 0.5);
setWaterColor(0.5, 0.5, 0.5);

setAmbientColor(0.6, 0.6, 0.5);

g_Map.ExportMap();