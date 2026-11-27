/**
 * Táticas de batalhão (Total Warfield), no líder:
 *
 * - Moral (0-100): cai com golpes recebidos (mais pelo flanco e muito mais
 *   pela retaguarda), com baixas, com a morte do líder, com a carga da
 *   cavalaria inimiga e ao ver batalhões amigos fugindo por perto. Sobe
 *   quando o batalhão para de ser atingido, mais rápido perto do general.
 *   Abalado: piora precisão, cadência e velocidade. Quebrado: o batalhão
 *   foge para longe do inimigo; ao se recuperar, reagrupa (pode voltar
 *   para a luta). Quebrar várias vezes deixa o moral máximo menor.
 *   Atiradores atingidos em corpo a corpo perdem moral bem mais rápido.
 *   Na primeira fuga o batalhão recua para o acampamento e pode se
 *   reagrupar; destroçado (segunda fuga ou exército derrotado) corre para a
 *   borda do seu lado e sai do campo (BattalionLeader.Escape), e parte dele
 *   volta ao exército na campanha. Exército derrotado: todos (ForceRout).
 * - Carga (mixins tw_charge_*): cavalaria de choque, elefantes e
 *   infantaria pesada de choque correm contra um batalhão a 15-90 m; o
 *   primeiro choque bate com dano extra e derruba o moral do alvo (mais
 *   pelo flanco e retaguarda). Lanceiros firmes (tw_brace) atingidos pela
 *   frente seguram a carga: quem carregou perde o bônus e o moral.
 *   Visual: o batalhão fica dourado na carga, pisca vermelho ao receber o
 *   choque, azul ao segurá-lo, e fica cinza em fuga; grito de guerra.
 * - Posturas: normal, linha (mais precisão e cadência, mais lenta),
 *   coluna (mais rápida) e aberta (menos dano de área, moral mais firme).
 * - Níveis (0-3) pela experiência: mais ataque, defesa e firmeza.
 * - Contato: batalhão encostado no inimigo fica preso (anda devagar, pela
 *   massa dos dois lados); de que lados está o contato pesa no moral
 *   (flanco, retaguarda, cercado).
 * - Luta em formação: só as primeiras fileiras (FIGHTING_RANKS) vão ao
 *   corpo a corpo; as de trás esperam e sobem (BattalionLeader).
 * - Cansaço (vigor): correr, lutar e atirar cansam; parado recupera.
 * - Munição dos atiradores; escaramuça, fogo à vontade, flechas
 *   incendiárias, guarda e carga em ciclo (opções do jogador).
 * - Terreno: bosque desorganiza formações cerradas e cavalaria, água
 *   atrasa e expõe, golpe de cima vale mais (ZZ_TWCombat.js).
 * - Terreno elevado (Shogun 2): acima do inimigo mais próximo, moral mais
 *   firme e tiro mais preciso; abaixo, o contrário; carga morro abaixo mais
 *   forte, morro acima mais fraca; subir cansa (HIGH_GROUND_*, CHARGE_SLOPE_*).
 * - Esconderijo e emboscada (Rome II): parado no bosque, qualquer infantaria
 *   ou cavalaria some da vista dos inimigos distantes (tropa leve também em
 *   ponto alto); atacar escondido é uma emboscada (AMBUSH_*).
 * - Estacas (Medieval II): arqueiros e besteiros cravam, uma vez por
 *   batalha, uma fileira de estacas que fere a cavalaria (TWStakes.js).
 * - Moral do exército, medo de elefantes e carros, elite (campeões),
 *   inquebráveis (TWUnbreakable), inimigo fugindo anima.
 * - Habilidades: grito de guerra (TWWarCry); o general reagrupa e inspira
 *   (helpers/TWBattalion.js).
 *
 * Os efeitos viram modificadores (ModifiersManager) em todos os soldados.
 * BattalionLeader chama Update() no seu tick.
 */
function BattalionTactics() {}

BattalionTactics.prototype.Schema =
	"<a:help>Battalion morale, postures and experience levels.</a:help>" +
	"<optional><element name='MoraleRecoveryRate' a:help='Morale per second once no longer under attack.'><ref name='nonNegativeDecimal'/></element></optional>" +
	"<optional><element name='HitMoraleLoss' a:help='Morale lost per hit taken by any soldier.'><ref name='nonNegativeDecimal'/></element></optional>" +
	"<optional><element name='CasualtyMoraleLoss' a:help='Morale lost per soldier killed, scaled by battalion size.'><ref name='nonNegativeDecimal'/></element></optional>" +
	"<optional><element name='LeaderLossMoraleLoss' a:help='Morale lost when the leader dies.'><ref name='nonNegativeDecimal'/></element></optional>" +
	"<optional><element name='ChargeMoraleLoss' a:help='Morale lost by a battalion hit by a cavalry charge.'><ref name='nonNegativeDecimal'/></element></optional>" +
	"<optional><element name='ChargeDamage' a:help='Melee damage multiplier while charging (until shortly after impact).'><ref name='positiveDecimal'/></element></optional>" +
	"<optional><element name='ChargeSpeed' a:help='Speed multiplier while running in to charge.'><ref name='positiveDecimal'/></element></optional>" +
	"<optional><element name='Formations' a:help='Extra cultural formations (wedge, phalanx, syntagma, testudo, shield_wall, fish_scale, volley_ranks, crane_wing).'><attribute name='datatype'><value>tokens</value></attribute><text/></element></optional>" +
	"<optional><element name='ShakenThreshold'><ref name='nonNegativeDecimal'/></element></optional>" +
	"<optional><element name='BrokenThreshold' a:help='Below this, the battalion routs.'><ref name='nonNegativeDecimal'/></element></optional>" +
	"<optional><element name='Ammo' a:help='Shots per soldier (default by class: archer, slinger, javelineer, crossbowman).'><data type='nonNegativeInteger'/></element></optional>";

BattalionTactics.prototype.POSTURES = ["normal", "line", "column", "loose"];
/** Formações culturais (só para quem tem no template: BattalionTactics/Formations). */
BattalionTactics.prototype.CULTURAL_FORMATIONS = ["wedge", "crane_wing", "phalanx", "syntagma", "testudo", "shield_wall", "fish_scale", "volley_ranks"];

/**
 * Efeitos por postura/formação (multiplicadores, salvo armor/pierce, que
 * somam armadura). columns: null = padrão; "all" = uma fileira; "deep4"/
 * "deep2" = 4 ou 2 fileiras; "square" = bloco quadrado. shape: "wedge"
 * (triângulo com o líder na ponta), "crescent" (pontas avançadas),
 * "staggered" (ponta escalonada). brace: segura carga de frente. charge:
 * multiplica o dano da carga.
 */
BattalionTactics.prototype.POSTURE_EFFECTS = {
	"normal": { "spread": 1, "repeat": 1, "walk": 1, "columns": null, "spacing": 1, "splash": 1, "moraleLoss": 1 },
	"line": { "spread": 0.85, "repeat": 0.9, "walk": 0.9, "columns": "all", "spacing": 1, "splash": 1, "moraleLoss": 1 },
	"column": { "spread": 1.1, "repeat": 1, "walk": 1.2, "columns": 2, "spacing": 0.9, "splash": 1.2, "moraleLoss": 1.2 },
	"loose": { "spread": 1, "repeat": 1, "walk": 0.95, "columns": null, "spacing": 1.8, "splash": 0.5, "moraleLoss": 0.8 },
	// Cunha (cavalaria): rompe linhas; carga mais forte, flancos expostos.
	"wedge": { "spread": 1, "repeat": 1, "walk": 1.05, "columns": null, "shape": "wedge", "spacing": 0.9, "splash": 1, "moraleLoss": 0.95, "charge": 1.3, "armor": -1 },
	// Asa de grou (cavalaria chinesa): crescente que envolve; carga e golpes melhores, mais lenta.
	"crane_wing": { "spread": 1, "repeat": 0.9, "walk": 0.95, "columns": "deep2", "shape": "crescent", "spacing": 1.1, "splash": 1, "moraleLoss": 0.95, "charge": 1.15 },
	// Falange: muro de lanças e escudos; lenta, firme, segura carga.
	"phalanx": { "spread": 1, "repeat": 1, "walk": 0.8, "columns": "deep4", "spacing": 0.75, "splash": 1.1, "moraleLoss": 0.8, "attack": 1.1, "armor": 2, "brace": true },
	// Sintagma: bloco de sarissas; lanças erguidas desviam flechas.
	"syntagma": { "spread": 1, "repeat": 1, "walk": 0.7, "columns": "square", "spacing": 0.7, "splash": 1.2, "moraleLoss": 0.75, "attack": 1.05, "armor": 1, "pierce": 4, "brace": true },
	// Testudo: escudos em casco; quase imune a projéteis, muito lento, ataca pouco.
	"testudo": { "spread": 1, "repeat": 1.6, "walk": 0.5, "columns": "square", "spacing": 0.6, "splash": 0.7, "moraleLoss": 0.7, "attack": 0.8, "armor": 1, "pierce": 8 },
	// Parede de escudos: duas fileiras cerradas; firme e protegida, lenta.
	"shield_wall": { "spread": 1, "repeat": 1.05, "walk": 0.65, "columns": "deep2", "spacing": 0.7, "splash": 1.1, "moraleLoss": 0.75, "armor": 2, "pierce": 4, "brace": true },
	// Escama de peixe (infantaria chinesa): ponta escalonada para romper; carga de infantaria.
	"fish_scale": { "spread": 1, "repeat": 0.95, "walk": 0.95, "columns": null, "shape": "staggered", "spacing": 0.85, "splash": 1, "moraleLoss": 0.9, "attack": 1.05, "charge": 1.2 },
	// Fileiras de salva (bestas/arcos chineses): três fileiras revezando o tiro.
	"volley_ranks": { "spread": 0.85, "repeat": 0.85, "walk": 0.85, "columns": "deep3", "spacing": 1.1, "splash": 1, "moraleLoss": 1 }
};

/** Multiplicadores por estado de moral. */
BattalionTactics.prototype.MORALE_EFFECTS = {
	"steady": { "spread": 1, "repeat": 1, "walk": 1, "attack": 1 },
	"shaken": { "spread": 1.3, "repeat": 1.15, "walk": 0.9, "attack": 0.85 },
	"broken": { "spread": 1.6, "repeat": 1.3, "walk": 1.15, "attack": 0.6 }
};

/** XP (em múltiplos de RequiredXp do líder) para cada nível. */
BattalionTactics.prototype.LEVEL_THRESHOLDS = [1, 3, 6];
/** Por nível: +ataque, +resistência (armadura) e -perda de moral. */
BattalionTactics.prototype.LEVEL_ATTACK_BONUS = 0.06;
BattalionTactics.prototype.LEVEL_ARMOR_BONUS = 1;
BattalionTactics.prototype.LEVEL_MORALE_BONUS = 0.12;

/** Segundos sem ser atingido antes do moral começar a subir. */
BattalionTactics.prototype.RECOVERY_DELAY = 5;
/** Cada fuga reduz o moral máximo (mínimo 60). */
BattalionTactics.prototype.ROUT_MAX_MORALE_PENALTY = 15;
/** Distância da fuga a cada ordem (m) e intervalo entre ordens (s). */
BattalionTactics.prototype.ROUT_DISTANCE = 60;
BattalionTactics.prototype.ROUT_REORDER = 4;
/** Batalhões amigos fugindo a esta distância abalam (m). */
BattalionTactics.prototype.PANIC_RADIUS = 40;
/** Atiradores (a pé ou montados) atingidos em corpo a corpo: perda de moral multiplicada. */
BattalionTactics.prototype.RANGED_IN_MELEE_MULTIPLIER = 2.5;
/** Batalhão em fuga a esta distância da borda do mapa sai do campo (m). */
BattalionTactics.prototype.ESCAPE_EDGE_DISTANCE = 14;

BattalionTactics.prototype.MODIFIER_ID = "tw_battalion_tactics";

/** Carga: distância para começar (m), duração máxima, fôlego depois do choque e recarga (ms). */
BattalionTactics.prototype.CHARGE_MIN_DISTANCE = 15;
BattalionTactics.prototype.CHARGE_MAX_DISTANCE = 90;
BattalionTactics.prototype.CHARGE_MAX_TIME = 9000;
BattalionTactics.prototype.CHARGE_IMPACT_TIME = 3500;
BattalionTactics.prototype.CHARGE_RECHARGE = 15000;
/** Cores (sombreamento do modelo) que mostram o estado do batalhão. */
BattalionTactics.prototype.TINTS = {
	"normal": [1, 1, 1],
	"charge": [1.6, 1.3, 0.7],
	"impact": [1.8, 0.75, 0.6],
	"brace": [0.8, 1.15, 1.8],
	"rout": [0.6, 0.6, 0.6],
	"hidden": [0.7, 0.9, 0.7]
};
BattalionTactics.prototype.FLASH_TIME = 1500;
/** Moral "dobrado": toda perda de moral é dividida por isto (batalhas mais longas). */
BattalionTactics.prototype.MORALE_RESILIENCE = 2;
/**
 * Acompanhantes vivos (BattalionLeader.attachments): multiplicadores de perda
 * e de recuperação de moral, moral máximo extra e peso da carga.
 */
BattalionTactics.prototype.SUPPORT_EFFECTS = {
	"priest": { "loss": 0.85, "recovery": 1.3, "maxMorale": 0, "charge": 1 },
	"high_priest": { "loss": 0.7, "recovery": 1.6, "maxMorale": 10, "charge": 1 },
	"musician": { "loss": 0.9, "recovery": 1.5, "maxMorale": 0, "charge": 1.25 },
	"standard": { "loss": 0.85, "recovery": 1.2, "maxMorale": 15, "charge": 1.1 }
};
/** Furtividade (tropa leve parada em bosque ou no alto). */
BattalionTactics.prototype.STEALTH_DELAY = 3000;
BattalionTactics.prototype.STEALTH_REVEAL_DISTANCE = 30;
/** Tempo máximo escondido de uma vez e a espera antes de se esconder de novo. */
BattalionTactics.prototype.STEALTH_MAX_TIME = 90000;
BattalionTactics.prototype.STEALTH_COOLDOWN = 45000;
BattalionTactics.prototype.STEALTH_TREES = 3;
BattalionTactics.prototype.STEALTH_HIGH_GROUND = 6;

/**
 * Contato (como no Total War): soldados a ENGAGE_RANGE m de um soldado de
 * batalhão inimigo estão travados no combate. Com ENGAGE_MIN_CONTACTS
 * soldados assim, o batalhão inteiro fica preso: anda devagar (não passa
 * através da linha inimiga nem sai do combate correndo; quem recua leva
 * golpes pelas costas). A trava dura ENGAGE_HOLD ms depois do último contato.
 */
BattalionTactics.prototype.ENGAGE_RANGE = 3.5;
BattalionTactics.prototype.ENGAGE_MIN_CONTACTS = 2;
BattalionTactics.prototype.ENGAGE_HOLD = 2000;
/** Velocidade presa no contato, entre massas iguais. */
BattalionTactics.prototype.ENGAGED_WALK = 0.3;
/** Limites da velocidade presa (massa muito maior ou muito menor que a inimiga). */
BattalionTactics.prototype.ENGAGED_WALK_MIN = 0.15;
BattalionTactics.prototype.ENGAGED_WALK_MAX = 0.65;
/** Em fuga a trava é mais fraca: a tropa larga tudo e corre (mas ainda é alcançada). */
BattalionTactics.prototype.ENGAGED_ROUT_WALK = 0.6;
/** "Massa" por classe: quem é mais pesado empurra e se solta melhor. */
BattalionTactics.prototype.MASS = { "Elephant": 4, "Cavalry": 2, "Champion": 1.4, "Infantry": 1 };
/** Lanceiros firmes (brace) pesam isto a mais contra cavalaria e elefantes. */
BattalionTactics.prototype.BRACE_MASS = 2;

/**
 * Fileiras que lutam corpo a corpo (as de trás esperam no lugar e sobem
 * quando alguém da frente cai). Infinity: todos lutam.
 */
BattalionTactics.prototype.FIGHTING_RANKS = {
	"normal": 2, "line": Infinity, "column": 1, "loose": Infinity, "wedge": Infinity, "crane_wing": Infinity,
	"phalanx": 2, "syntagma": 3, "testudo": 1, "shield_wall": 2, "fish_scale": 2, "volley_ranks": Infinity
};

/**
 * Golpes pelo flanco e pela retaguarda: o escudo não protege, o dano
 * aumenta. Testudo e sintagma fecham todos os lados.
 */
BattalionTactics.prototype.SIDE_DAMAGE = { "front": 1, "flank": 1.25, "rear": 1.5 };
BattalionTactics.prototype.CLOSED_FORMATIONS = { "testudo": 1, "syntagma": 1.1 };

/** Cansaço (vigor 0-100): estados e efeitos. */
BattalionTactics.prototype.VIGOR_STATES = [["fresh", 70], ["winded", 45], ["tired", 20], ["exhausted", -Infinity]];
BattalionTactics.prototype.VIGOR_EFFECTS = {
	"fresh": { "attack": 1, "walk": 1, "repeat": 1, "defense": 1, "morale": 1 },
	"winded": { "attack": 0.95, "walk": 0.95, "repeat": 1.05, "defense": 1.05, "morale": 1.05 },
	"tired": { "attack": 0.85, "walk": 0.85, "repeat": 1.12, "defense": 1.12, "morale": 1.15 },
	"exhausted": { "attack": 0.7, "walk": 0.7, "repeat": 1.25, "defense": 1.25, "morale": 1.35 }
};
/** Vigor por segundo: parado recupera; andar recupera pouco; correr, lutar e atirar cansam. */
BattalionTactics.prototype.VIGOR_RATES = { "rest": 1.5, "walk": 0.2, "run": -1.0, "melee": -0.6, "shoot": -0.15 };
/** Cavalos cansam menos correndo. */
BattalionTactics.prototype.CAVALRY_RUN_FATIGUE = 0.6;

/** Munição por soldado (disparos), pela classe do atirador. */
BattalionTactics.prototype.AMMO_PER_SOLDIER = { "Javelineer": 15, "Slinger": 60, "Archer": 60, "Crossbowman": 40 };
BattalionTactics.prototype.AMMO_DEFAULT = 50;
/** Escaramuça: inimigo corpo a corpo a esta distância faz o batalhão recuar (m), e quanto recua. */
BattalionTactics.prototype.SKIRMISH_RANGE = 22;
BattalionTactics.prototype.SKIRMISH_STEP = 35;
BattalionTactics.prototype.SKIRMISH_INTERVAL = 5000;
/** Flechas incendiárias: dano contra prédios e abalo no moral; atiram mais devagar. */
BattalionTactics.prototype.FIRE_ARROW_STRUCTURE = 3;
BattalionTactics.prototype.FIRE_ARROW_UNITS = 0.9;
BattalionTactics.prototype.FIRE_ARROW_MORALE = 1.6;
BattalionTactics.prototype.FIRE_ARROW_REPEAT = 1.2;

/** Terreno: alto dá dano (por metro de diferença) e moral; bosque e água desorganizam. */
BattalionTactics.prototype.HEIGHT_DAMAGE_PER_M = 0.015;
BattalionTactics.prototype.HEIGHT_DAMAGE_MIN = 0.85;
BattalionTactics.prototype.HEIGHT_DAMAGE_MAX = 1.2;
/**
 * Terreno elevado (Shogun 2): altura em relação ao batalhão inimigo mais
 * próximo (até HEIGHT_COMPARE_RADIUS m). A partir de HIGH_GROUND m acima:
 * moral mais firme e tiro mais preciso; abaixo, o contrário. A carga ganha
 * (ou perde) CHARGE_SLOPE_PER_M por metro de descida (subida), com limites.
 */
BattalionTactics.prototype.HEIGHT_COMPARE_RADIUS = 90;
BattalionTactics.prototype.HIGH_GROUND = 3;
BattalionTactics.prototype.HIGH_GROUND_EFFECTS = {
	"high": { "moraleLoss": 0.8, "spread": 0.85, "recovery": 1.2 },
	"level": { "moraleLoss": 1, "spread": 1, "recovery": 1 },
	"low": { "moraleLoss": 1.15, "spread": 1.1, "recovery": 0.9 }
};
BattalionTactics.prototype.CHARGE_SLOPE_PER_M = 0.025;
BattalionTactics.prototype.CHARGE_SLOPE_MIN = 0.75;
BattalionTactics.prototype.CHARGE_SLOPE_MAX = 1.3;
/**
 * Emboscada (Rome II): batalhão escondido que abre o ataque ganha
 * AMBUSH_ATTACK de dano por AMBUSH_TIME ms, e cada batalhão atingido por ele
 * nesse tempo perde AMBUSH_MORALE de moral de uma vez (surpresa).
 */
BattalionTactics.prototype.AMBUSH_TIME = 10000;
BattalionTactics.prototype.AMBUSH_ATTACK = 1.25;
BattalionTactics.prototype.AMBUSH_MORALE = 22;
/** Quem não se esconde nem no bosque. */
BattalionTactics.prototype.NO_HIDE_CLASSES = ["Elephant", "Siege", "Chariot", "Ship"];
/**
 * Estacas (Medieval II): arqueiros e besteiros parados, sem inimigo a menos
 * de STAKES_ENEMY_DISTANCE m, cravam uma vez por batalha uma fileira de
 * estacas STAKES_DISTANCE m à frente, a cada STAKES_SPACING m (special/tw_stakes).
 */
BattalionTactics.prototype.STAKES_CLASSES = ["Archer", "Crossbowman"];
BattalionTactics.prototype.STAKES_TEMPLATE = "special/tw_stakes";
BattalionTactics.prototype.STAKES_DISTANCE = 4;
BattalionTactics.prototype.STAKES_SPACING = 2.6;
BattalionTactics.prototype.STAKES_ENEMY_DISTANCE = 40;
/**
 * Fadiga: subir cansa (CLIMB_FATIGUE de vigor por metro subido) e tropas
 * pesadas cansam mais (HEAVY_FATIGUE em correr, andar e lutar).
 */
BattalionTactics.prototype.CLIMB_FATIGUE = 0.6;
BattalionTactics.prototype.HEAVY_FATIGUE = { "Champion": 1.25, "Elephant": 1.3 };
BattalionTactics.prototype.FOREST_TREES = 4;
BattalionTactics.prototype.FOREST_RADIUS = 12;
/** Formações cerradas que o bosque desfaz. */
BattalionTactics.prototype.FOREST_DISORDERED = ["phalanx", "syntagma", "shield_wall", "testudo", "wedge", "crane_wing"];
BattalionTactics.prototype.DISORDER_EFFECTS = { "walk": 0.75, "attack": 0.85, "defense": 1.1 };
BattalionTactics.prototype.WATER_DEPTH = 0.3;
BattalionTactics.prototype.WATER_EFFECTS = { "walk": 0.7, "attack": 0.85, "defense": 1.2 };

/** Moral: pressão pelos lados em contato (por segundo) e cercado (3+ lados). */
BattalionTactics.prototype.SIDE_PRESSURE = { "left": 0.8, "right": 0.8, "rear": 1.5 };
BattalionTactics.prototype.SURROUNDED_PRESSURE = 2;
/** Moral do exército: perdas (fração) e a queda por segundo. */
BattalionTactics.prototype.ARMY_LOSS_PRESSURE = [[0.6, 0.8], [0.4, 0.3]];
/** Inimigos em fuga por perto animam (recuperação e moral por segundo). */
BattalionTactics.prototype.WINNING_RADIUS = 60;
BattalionTactics.prototype.WINNING_RECOVERY = 1.3;
BattalionTactics.prototype.WINNING_MORALE = 0.5;
/** Medo: elefantes, carros e classe TWFear a esta distância (m), queda por segundo. */
BattalionTactics.prototype.FEAR_CLASSES = ["Elephant", "Chariot", "TWFear"];
BattalionTactics.prototype.FEAR_RADIUS = 25;
BattalionTactics.prototype.FEAR_PRESSURE = 1.2;
BattalionTactics.prototype.FEAR_PRESSURE_CAVALRY = 2;
/** Elite (campeões): perde menos moral e se reagrupa mais cedo. */
BattalionTactics.prototype.ELITE_MORALE_LOSS = 0.75;
BattalionTactics.prototype.ELITE_RALLY = 40;
/** Perseguição: quem foge apanha mais; da cavalaria, mais ainda. */
BattalionTactics.prototype.ROUTING_DAMAGE = 1.3;
BattalionTactics.prototype.ROUTING_DAMAGE_CAVALRY = 1.5;
/** Tick lento (terreno, medo, exército), em s. */
BattalionTactics.prototype.SLOW_TICK = 2;

/** Grito de guerra (classe TWWarCry). */
BattalionTactics.prototype.WAR_CRY_RADIUS = 35;
BattalionTactics.prototype.WAR_CRY_MORALE = 10;
BattalionTactics.prototype.WAR_CRY_TIME = 15000;
BattalionTactics.prototype.WAR_CRY_COOLDOWN = 60000;
BattalionTactics.prototype.WAR_CRY_ATTACK = 1.15;
BattalionTactics.prototype.WAR_CRY_MORALE_LOSS = 0.8;
/** Inspirar (general): menos perda de moral e mais ataque. */
BattalionTactics.prototype.INSPIRE_MORALE_LOSS = 0.5;
BattalionTactics.prototype.INSPIRE_ATTACK = 1.1;
/** Carga em ciclo (cavalaria): recua e carrega de novo. */
BattalionTactics.prototype.CYCLE_DISTANCE = 45;
BattalionTactics.prototype.CYCLE_AFTER_IMPACT = 3000;
BattalionTactics.prototype.CYCLE_MAX_TIME = 12000;

BattalionTactics.prototype.Init = function()
{
	this.morale = 100;
	this.maxMorale = 100;
	this.lastHitTime = -Infinity;
	this.lastChargeTime = -Infinity;
	this.posture = "normal";
	this.routing = false;
	this.routCount = 0;
	this.routTimer = 0;
	this.lastMemberCount = -1;
	this.appliedKey = "";
	this.appliedEntities = [];
	this.charge = undefined;
	this.lastChargeEnd = -Infinity;
	this.flash = undefined;
	this.appliedTint = "";
	this.engagedUntil = -Infinity;
	this.engagedWalk = 1;
	this.contactSides = {};
	this.vigor = 100;
	// Munição: definida no primeiro tick (o batalhão já tem soldados).
	this.ammo = undefined;
	this.ammoMax = undefined;
	// Opções (TW): guarda, escaramuça, fogo à vontade, flechas incendiárias, carga em ciclo.
	this.options = { "guard": false, "skirmish": undefined, "fireAtWill": true, "fireArrows": false, "cycleCharge": false };
	this.stanceBeforeOption = undefined;
	this.terrain = { "forest": false, "water": false };
	this.slowTimer = 0;
	this.slowPressure = 0;
	this.winning = false;
	this.warCryUntil = -Infinity;
	this.warCryReady = 0;
	this.inspiredUntil = -Infinity;
	this.cycle = undefined;
	this.lastImpact = undefined;
	this.kills = 0;
	this.heightAdvantage = 0;
	this.lastGround = undefined;
	this.ambushUntil = -Infinity;
	this.ambushedBy = {};
	this.stakesUsed = false;
	this.statKey = undefined;
	this.barKey = "";
};

BattalionTactics.prototype.Get = function(name, fallback)
{
	return this.template && this.template[name] !== undefined ? +this.template[name] : fallback;
};

BattalionTactics.prototype.GetTime = function()
{
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime();
};

BattalionTactics.prototype.GetMoraleState = function()
{
	if (this.routing || this.morale < this.Get("BrokenThreshold", 20))
		return "broken";
	if (this.morale < this.Get("ShakenThreshold", 50))
		return "shaken";
	return "steady";
};

BattalionTactics.prototype.IsRouting = function()
{
	return this.routing;
};

BattalionTactics.prototype.GetLevel = function()
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	if (!cmpLeader)
		return 0;
	const xp = cmpLeader.GetCurrentXp();
	const required = Math.max(1, cmpLeader.GetRequiredXp());
	let level = 0;
	while (level < this.LEVEL_THRESHOLDS.length && xp >= this.LEVEL_THRESHOLDS[level] * required)
		++level;
	return level;
};

BattalionTactics.prototype.GetNextLevelXp = function()
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	const level = this.GetLevel();
	if (!cmpLeader || level >= this.LEVEL_THRESHOLDS.length)
		return undefined;
	return this.LEVEL_THRESHOLDS[level] * cmpLeader.GetRequiredXp();
};

BattalionTactics.prototype.GetPostureEffects = function()
{
	return this.POSTURE_EFFECTS[this.posture] || this.POSTURE_EFFECTS.normal;
};

BattalionTactics.prototype.GetFormationOverride = function(memberCount)
{
	const effects = this.GetPostureEffects();
	const n = Math.max(1, memberCount);
	const columns = {
		"all": n,
		"deep2": Math.ceil(n / 2),
		"deep3": Math.ceil(n / 3),
		"deep4": Math.ceil(n / 4),
		"square": Math.ceil(Math.sqrt(n))
	}[effects.columns] || effects.columns;
	return { "columns": columns, "spacingScale": effects.spacing, "shape": effects.shape };
};

BattalionTactics.prototype.GetSplashDamageMultiplier = function()
{
	return this.GetPostureEffects().splash;
};

/** Posturas comuns e as formações culturais deste batalhão. */
BattalionTactics.prototype.GetAvailablePostures = function()
{
	// Nó com atributo (datatype="tokens") chega como objeto: o texto fica em _string.
	const raw = this.template && this.template.Formations;
	const text = typeof raw == "string" ? raw : raw && raw._string || "";
	const extra = text.split(/\s+/).filter(name => this.CULTURAL_FORMATIONS.indexOf(name) != -1);
	return this.POSTURES.concat(extra);
};

/** Formação cultural preferida (para a IA e o desdobramento). */
BattalionTactics.prototype.GetPreferredFormation = function()
{
	const order = ["phalanx", "syntagma", "shield_wall", "fish_scale", "volley_ranks", "wedge"];
	const available = this.GetAvailablePostures();
	return order.find(name => available.indexOf(name) != -1);
};

BattalionTactics.prototype.CanBrace = function()
{
	// No bosque ou na água ninguém firma as lanças.
	if (this.IsDisordered() || this.terrain.water)
		return false;
	return !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWBrace") || !!this.GetPostureEffects().brace;
};

BattalionTactics.prototype.HasClass = function(cls)
{
	return !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass(cls);
};

/** Quantas fileiras lutam corpo a corpo (atiradores e cavalaria: todas). */
BattalionTactics.prototype.GetFightingRanks = function()
{
	if (this.IsRangedBattalion() || this.HasClass("Cavalry") || this.HasClass("Elephant"))
		return Infinity;
	const ranks = this.FIGHTING_RANKS[this.posture];
	return ranks === undefined ? 2 : ranks;
};

/** Formação cerrada desfeita pelo bosque, ou cavalaria no bosque. */
BattalionTactics.prototype.IsDisordered = function()
{
	return !!this.terrain.forest && (this.HasClass("Cavalry") || this.HasClass("Elephant") ||
		this.FOREST_DISORDERED.indexOf(this.posture) != -1);
};

BattalionTactics.prototype.IsElite = function()
{
	return this.HasClass("Champion");
};

// ------------------------------------------------ cansaço

BattalionTactics.prototype.GetVigorState = function()
{
	return this.VIGOR_STATES.find(([, min]) => this.vigor >= min)[0];
};

BattalionTactics.prototype.GetVigorEffects = function()
{
	return this.VIGOR_EFFECTS[this.GetVigorState()];
};

/** Quem do batalhão está lutando corpo a corpo e quem está atirando (frações). */
BattalionTactics.prototype.GetActivity = function(cmpLeader)
{
	let melee = 0;
	let shoot = 0;
	const entities = cmpLeader.GetBattalionEntities();
	for (const ent of entities)
	{
		const order = Engine.QueryInterface(ent, IID_UnitAI)?.order;
		if (!order || order.type != "Attack" || !order.data)
			continue;
		if (order.data.attackType == "Ranged")
			++shoot;
		else
			++melee;
	}
	const n = Math.max(1, entities.length);
	return { "melee": melee / n, "shoot": shoot / n };
};

BattalionTactics.prototype.UpdateVigor = function(cmpLeader, dt)
{
	const activity = this.GetActivity(cmpLeader);
	const moving = !!Engine.QueryInterface(this.entity, IID_UnitMotion)?.IsMoveRequested();
	const running = this.IsRunningIn() || this.routing;
	let rate;
	if (running)
		rate = this.VIGOR_RATES.run * (this.HasClass("Cavalry") ? this.CAVALRY_RUN_FATIGUE : 1);
	else if (!moving && !activity.melee && !activity.shoot)
		rate = this.VIGOR_RATES.rest;
	else
		rate = (moving && !activity.melee ? this.VIGOR_RATES.walk : 0) +
			this.VIGOR_RATES.melee * Math.min(1, activity.melee * 2) + this.VIGOR_RATES.shoot * Math.min(1, activity.shoot * 2);
	// Peso: campeões e elefantes cansam mais (o descanso não muda).
	if (rate < 0 || moving)
		for (const cls in this.HEAVY_FATIGUE)
			if (this.HasClass(cls))
			{
				rate = rate < 0 ? rate * this.HEAVY_FATIGUE[cls] : rate / this.HEAVY_FATIGUE[cls];
				break;
			}
	// Subida: cada metro subido custa vigor (descer não descansa).
	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	if (cmpPosition && cmpPosition.IsInWorld())
	{
		const p = cmpPosition.GetPosition2D();
		const ground = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetGroundLevel(p.x, p.y);
		if (this.lastGround !== undefined && moving && ground > this.lastGround)
			rate -= this.CLIMB_FATIGUE * (ground - this.lastGround) / Math.max(dt, 0.001) * (this.HasClass("Cavalry") ? 0.6 : 1);
		this.lastGround = ground;
	}
	this.vigor = Math.max(0, Math.min(100, this.vigor + rate * dt));
};

// ------------------------------------------------ munição

BattalionTactics.prototype.InitAmmo = function(cmpLeader)
{
	if (this.ammo !== undefined)
		return;
	const types = Engine.QueryInterface(this.entity, IID_Attack)?.GetAttackTypes() || [];
	if (types.indexOf("Ranged") == -1 && !(this.template && this.template.Ammo))
	{
		this.ammo = null;
		return;
	}
	let perSoldier = this.Get("Ammo", undefined);
	if (perSoldier === undefined)
	{
		perSoldier = this.AMMO_DEFAULT;
		for (const cls in this.AMMO_PER_SOLDIER)
			if (this.HasClass(cls))
			{
				perSoldier = this.AMMO_PER_SOLDIER[cls];
				break;
			}
	}
	this.ammoMax = perSoldier * cmpLeader.GetMaxStrength();
	this.ammo = perSoldier * cmpLeader.GetStrength();
	if (this.options.skirmish === undefined)
		this.options.skirmish = this.IsRangedBattalion();
};

/** O batalhão tem munição limitada? */
BattalionTactics.prototype.UsesAmmo = function()
{
	return this.ammo !== undefined && this.ammo !== null;
};

BattalionTactics.prototype.HasAmmo = function()
{
	return !this.UsesAmmo() || this.ammo > 0;
};

/** Gasta um disparo; falso se acabou. */
BattalionTactics.prototype.UseAmmo = function()
{
	if (!this.UsesAmmo())
		return true;
	if (this.ammo <= 0)
		return false;
	--this.ammo;
	if (this.ammo <= 0)
		this.OutOfAmmo();
	return true;
};

/** Acabou a munição: quem atirava escolhe de novo (faca ou corpo a corpo). */
BattalionTactics.prototype.OutOfAmmo = function()
{
	this.options.skirmish = false;
	this.options.fireArrows = false;
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	if (cmpLeader)
		for (const ent of cmpLeader.GetBattalionEntities())
		{
			const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
			if (cmpUnitAI && cmpUnitAI.order && cmpUnitAI.order.data && cmpUnitAI.order.data.attackType == "Ranged")
				cmpUnitAI.Stop(false);
			Engine.QueryInterface(ent, IID_Attack)?.SetDaggerMode?.(true);
		}
	this.ApplyModifiers();
	this.Notify(markForTranslation("A battalion is out of ammunition!"));
};

// ------------------------------------------------ opções

/** Opções que este batalhão tem. */
BattalionTactics.prototype.GetAvailableOptions = function()
{
	const options = ["guard"];
	const ranged = (Engine.QueryInterface(this.entity, IID_Attack)?.GetAttackTypes() || []).indexOf("Ranged") != -1 || this.UsesAmmo();
	if (ranged)
		options.push("fireAtWill");
	if (ranged && this.HasAmmo())
		options.push("skirmish");
	if (this.HasClass("Archer") && this.HasAmmo())
		options.push("fireArrows");
	if (this.HasClass("Cavalry") && this.HasClass("TWCharger"))
		options.push("cycleCharge");
	return options;
};

BattalionTactics.prototype.SetOption = function(name, value)
{
	if (this.GetAvailableOptions().indexOf(name) == -1)
		return;
	this.options[name] = !!value;
	if (name == "guard" || name == "fireAtWill")
		this.ApplyStanceOptions();
	if (name == "cycleCharge" && !value)
		this.cycle = undefined;
	this.ApplyModifiers();
};

/**
 * Guarda: o batalhão segura a posição (líder parado, ninguém persegue).
 * Sem fogo à vontade: ninguém atira nem ataca sem ordem.
 */
BattalionTactics.prototype.ApplyStanceOptions = function()
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	const cmpLeaderAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (!cmpLeader || !cmpLeaderAI)
		return;
	const forced = !this.options.fireAtWill ? "passive" : this.options.guard ? "standground" : undefined;
	if (forced)
	{
		if (this.stanceBeforeOption === undefined)
			this.stanceBeforeOption = cmpLeaderAI.GetStanceName();
		cmpLeaderAI.SwitchToStance(forced);
	}
	else if (this.stanceBeforeOption !== undefined)
	{
		cmpLeaderAI.SwitchToStance(this.stanceBeforeOption);
		this.stanceBeforeOption = undefined;
	}
	for (const ent of cmpLeader.members)
		Engine.QueryInterface(ent, IID_UnitAI)?.SwitchToStance(this.options.fireAtWill ? "standground" : "passive");
};

// ------------------------------------------------ dano

/** Lado do batalhão que o golpe atinge: "front", "flank" ou "rear". */
BattalionTactics.prototype.GetHitSide = function(attacker, victim)
{
	const multiplier = this.GetDirectionMultiplier(attacker, victim);
	return multiplier >= 2.5 ? "rear" : multiplier > 1 ? "flank" : "front";
};

/** Dano a mais que este batalhão recebe (lado, cansaço, água, desordem, fuga). */
BattalionTactics.prototype.GetDefenseMultiplier = function(attacker, victim)
{
	let multiplier = this.SIDE_DAMAGE[this.GetHitSide(attacker, victim)];
	const closed = this.CLOSED_FORMATIONS[this.posture];
	if (closed !== undefined)
		multiplier = Math.min(multiplier, closed);
	multiplier *= this.GetVigorEffects().defense;
	if (this.terrain.water)
		multiplier *= this.WATER_EFFECTS.defense;
	else if (this.IsDisordered())
		multiplier *= this.DISORDER_EFFECTS.defense;
	if (this.routing)
	{
		const attackerLeader = GetBattalionLeaderEntity(attacker);
		const cavalry = Engine.QueryInterface(attackerLeader != INVALID_ENTITY ? attackerLeader : attacker, IID_Identity)?.HasClass("Cavalry");
		multiplier *= cavalry ? this.ROUTING_DAMAGE_CAVALRY : this.ROUTING_DAMAGE;
	}
	return multiplier;
};

/** Dano a mais que este batalhão causa a `target` (flechas incendiárias). */
BattalionTactics.prototype.GetOffenseMultiplier = function(target)
{
	if (!this.options.fireArrows)
		return 1;
	return Engine.QueryInterface(target, IID_Identity)?.HasClass("Structure") ? this.FIRE_ARROW_STRUCTURE : this.FIRE_ARROW_UNITS;
};

/** Golpe de cima para baixo vale mais (e de baixo para cima, menos). */
BattalionTactics.prototype.GetHeightMultiplier = function(attacker, victim)
{
	const a = Engine.QueryInterface(attacker, IID_Position);
	const v = Engine.QueryInterface(victim, IID_Position);
	if (!a || !v || !a.IsInWorld() || !v.IsInWorld())
		return 1;
	const diff = a.GetPosition().y - v.GetPosition().y;
	return Math.max(this.HEIGHT_DAMAGE_MIN, Math.min(this.HEIGHT_DAMAGE_MAX, 1 + diff * this.HEIGHT_DAMAGE_PER_M));
};

/** "high", "low" ou "level": altura em relação ao inimigo mais próximo (UpdateSlow). */
BattalionTactics.prototype.GetHeightState = function()
{
	return this.heightAdvantage >= this.HIGH_GROUND ? "high" : this.heightAdvantage <= -this.HIGH_GROUND ? "low" : "level";
};

BattalionTactics.prototype.GetHeightEffects = function()
{
	return this.HIGH_GROUND_EFFECTS[this.GetHeightState()];
};

/** Abate feito por um soldado deste batalhão (relatório da batalha). */
BattalionTactics.prototype.AddKill = function()
{
	++this.kills;
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	const stats = cmpTrigger && this.GetStatsEntry(cmpTrigger);
	if (stats)
		++stats.kills;
};

BattalionTactics.prototype.GetStatsEntry = function(cmpTrigger)
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	if (!cmpLeader)
		return undefined;
	if (this.statKey === undefined)
		this.statKey = cmpLeader.GetCampaignId() !== undefined ? String(cmpLeader.GetCampaignId()) : "b" + this.entity;
	if (!cmpTrigger.twStats)
		cmpTrigger.twStats = {};
	if (!cmpTrigger.twStats[this.statKey])
		cmpTrigger.twStats[this.statKey] = {
			"name": Engine.QueryInterface(this.entity, IID_Identity)?.GetGenericName() || "",
			"player": Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner(),
			"kills": 0,
			"max": cmpLeader.GetMaxStrength(),
			"initial": cmpLeader.GetStrength()
		};
	return cmpTrigger.twStats[this.statKey];
};

// ------------------------------------------------ habilidades

BattalionTactics.prototype.CanWarCry = function()
{
	return this.HasClass("TWWarCry") && !this.routing && this.GetTime() >= this.warCryReady;
};

/** Grito de guerra: abala os inimigos perto e anima o batalhão. */
BattalionTactics.prototype.WarCry = function()
{
	if (!this.CanWarCry())
		return false;
	const time = this.GetTime();
	this.warCryReady = time + this.WAR_CRY_COOLDOWN;
	this.warCryUntil = time + this.WAR_CRY_TIME;
	const pos = Engine.QueryInterface(this.entity, IID_Position)?.GetPosition2D();
	const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
	const cmpDiplomacy = owner !== undefined && QueryPlayerIDInterface(owner, IID_Diplomacy);
	if (pos && cmpDiplomacy)
	{
		const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		for (const ent of cmpRangeManager.ExecuteQueryAroundPos(pos, 0, this.WAR_CRY_RADIUS,
			cmpDiplomacy.GetEnemies().filter(p => p > 0), IID_BattalionTactics, false))
		{
			const cmpOther = Engine.QueryInterface(ent, IID_BattalionTactics);
			cmpOther.ReduceMorale(this.WAR_CRY_MORALE * this.MORALE_RESILIENCE);
			cmpOther.Flash("impact");
		}
	}
	PlaySound("order_attack", this.entity);
	this.Flash("charge");
	this.ApplyModifiers();
	return true;
};

// ------------------------------------------------ estacas

BattalionTactics.prototype.CanEverPlantStakes = function()
{
	return this.STAKES_CLASSES.some(cls => this.HasClass(cls)) && !this.HasClass("Cavalry");
};

/** Parado, fora de combate, sem inimigo perto e sem ter cravado ainda. */
BattalionTactics.prototype.CanPlantStakes = function()
{
	if (!this.CanEverPlantStakes() || this.stakesUsed || this.routing || this.IsEngaged())
		return false;
	if (Engine.QueryInterface(this.entity, IID_UnitMotion)?.IsMoveRequested())
		return false;
	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
	const cmpDiplomacy = owner !== undefined && QueryPlayerIDInterface(owner, IID_Diplomacy);
	if (!cmpPosition || !cmpPosition.IsInWorld() || !cmpDiplomacy)
		return false;
	const enemies = cmpDiplomacy.GetEnemies().filter(p => p > 0);
	return !enemies.length || !Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).ExecuteQueryAroundPos(
		cmpPosition.GetPosition2D(), 0, this.STAKES_ENEMY_DISTANCE, enemies, IID_UnitAI, false).length;
};

/** Crava a fileira de estacas à frente do batalhão (uma vez por batalha). */
BattalionTactics.prototype.PlantStakes = function()
{
	if (!this.CanPlantStakes())
		return false;
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	const owner = Engine.QueryInterface(this.entity, IID_Ownership).GetOwner();
	const angle = cmpLeader.facing !== undefined ? cmpLeader.facing : cmpPosition.GetRotation().y;
	const pos = cmpPosition.GetPosition2D();
	const front = new Vector2D(Math.sin(angle), Math.cos(angle));
	const right = new Vector2D(Math.cos(angle), -Math.sin(angle));
	const width = Math.max(this.STAKES_SPACING * 2, cmpLeader.GetFrontWidth() + this.STAKES_SPACING);
	const count = Math.max(2, Math.round(width / this.STAKES_SPACING));
	const center = Vector2D.add(pos, Vector2D.mult(front, this.STAKES_DISTANCE));
	for (let k = 0; k < count; ++k)
	{
		const offset = (k - (count - 1) / 2) * this.STAKES_SPACING;
		const spot = Vector2D.add(center, Vector2D.mult(right, offset));
		const ent = Engine.AddEntity(this.STAKES_TEMPLATE);
		if (ent == INVALID_ENTITY)
			return false;
		const cmpStakePosition = Engine.QueryInterface(ent, IID_Position);
		cmpStakePosition.JumpTo(spot.x, spot.y);
		// A ponta das estacas (lado do modelo) para o inimigo.
		cmpStakePosition.SetYRotation(angle + Math.PI);
		Engine.QueryInterface(ent, IID_Ownership)?.SetOwner(owner);
	}
	this.stakesUsed = true;
	PlaySound("order_repair", this.entity);
	return true;
};

/** General: reagrupa quem foge (se ainda pode) e anima os outros. */
BattalionTactics.prototype.Rallied = function(amount)
{
	if (this.routing && !this.IsShattered())
	{
		this.morale = Math.max(this.morale, this.Get("ShakenThreshold", 50) + 10);
		this.lastHitTime = -Infinity;
		const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
		if (cmpLeader)
			this.Rally(cmpLeader);
		return;
	}
	if (!this.routing)
		this.morale = Math.min(this.maxMorale + this.GetSupportEffects().maxMorale, this.morale + amount);
	this.ApplyModifiers();
};

BattalionTactics.prototype.Inspire = function(duration)
{
	this.inspiredUntil = Math.max(this.inspiredUntil, this.GetTime() + duration);
	this.Flash("brace");
	this.ApplyModifiers();
};

BattalionTactics.prototype.IsInspired = function()
{
	return this.GetTime() < this.inspiredUntil;
};

BattalionTactics.prototype.IsWarCrying = function()
{
	return this.GetTime() < this.warCryUntil;
};

BattalionTactics.prototype.SetPosture = function(posture)
{
	if (this.GetAvailablePostures().indexOf(posture) == -1)
		return;
	this.posture = posture;
	this.ApplyModifiers();
};

// ------------------------------------------------ moral

/**
 * Golpe em um soldado (ou no líder). Flanco: 1,5x; retaguarda: 2,5x
 * (pela direção do atacante em relação à frente do batalhão). A primeira
 * pancada de uma carga de cavalaria corpo a corpo abala mais.
 */
BattalionTactics.prototype.SoldierAttacked = function(msg, victim = this.entity)
{
	if (msg.fromStatusEffect && !msg.damage)
		return;

	// Golpe pesa pela fração da vida que tirou: soldados mais resistentes
	// (mixins tw_tough_*) também se abalam mais devagar.
	const maxHp = Engine.QueryInterface(victim, IID_Health)?.GetMaxHitpoints() || 100;
	let loss = this.Get("HitMoraleLoss", 0.6) * 0.5 + 4 * (msg.damage || 0) / maxHp;
	loss *= this.GetDirectionMultiplier(msg.attacker, victim);
	// Atiradores não aguentam o corpo a corpo: desmoralizam e fogem fácil.
	if ((msg.type == "Melee" || msg.type == "Slaughter") && this.IsRangedBattalion())
		loss *= this.RANGED_IN_MELEE_MULTIPLIER;
	// Flechas incendiárias assustam; golpes de cima também.
	const attackerBattalion = GetBattalionLeaderEntity(msg.attacker);
	const cmpAttackerSide = attackerBattalion != INVALID_ENTITY && Engine.QueryInterface(attackerBattalion, IID_BattalionTactics);
	if (cmpAttackerSide && cmpAttackerSide.options.fireArrows && msg.type == "Ranged")
		loss *= this.FIRE_ARROW_MORALE;
	if (this.GetHeightMultiplier(msg.attacker, victim) > 1.05)
		loss *= 1.15;
	loss *= this.GetHeightEffects().moraleLoss;

	const time = this.GetTime();

	// Emboscada: o primeiro golpe de um batalhão que saiu do esconderijo.
	if (cmpAttackerSide && cmpAttackerSide.ambushUntil > time &&
		!(time - (this.ambushedBy[attackerBattalion] || -Infinity) < this.AMBUSH_TIME))
	{
		this.ambushedBy[attackerBattalion] = time;
		loss += this.AMBUSH_MORALE;
		this.Flash("impact");
		this.Notify("Your troops have been ambushed!");
	}

	// Choque de uma carga: o primeiro golpe corpo a corpo do batalhão que
	// carregou. Lanceiros firmes, atingidos pela frente, seguram a carga.
	const attackerLeader = GetBattalionLeaderEntity(msg.attacker);
	const cmpAttackerTactics = attackerLeader != INVALID_ENTITY && Engine.QueryInterface(attackerLeader, IID_BattalionTactics);
	if (cmpAttackerTactics && msg.type == "Melee" && cmpAttackerTactics.charge && !cmpAttackerTactics.charge.impact)
	{
		const direction = this.GetDirectionMultiplier(msg.attacker, victim);
		const braced = direction == 1 && !this.routing && this.GetMoraleState() != "broken" && this.CanBrace();
		cmpAttackerTactics.ChargeImpact(braced);
		if (braced)
			this.Flash("brace");
		else
		{
			loss += cmpAttackerTactics.Get("ChargeMoraleLoss", 12) * direction * cmpAttackerTactics.GetSupportEffects().charge;
			this.Flash("impact");
		}
	}

	this.ReduceMorale(loss);
	this.lastHitTime = time;
};

BattalionTactics.prototype.IsRangedBattalion = function()
{
	const category = Engine.QueryInterface(this.entity, IID_BattalionLeader)?.GetCategory() || "";
	if (category.indexOf("ranged") != -1)
		return true;
	const types = Engine.QueryInterface(this.entity, IID_Attack)?.GetAttackTypes() || [];
	return types.indexOf("Ranged") != -1 && types.indexOf("Melee") == -1;
};

BattalionTactics.prototype.OnAttacked = function(msg)
{
	this.SoldierAttacked(msg, this.entity);
};

BattalionTactics.prototype.GetDirectionMultiplier = function(attacker, victim)
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	const cmpAttackerPosition = Engine.QueryInterface(attacker, IID_Position);
	const cmpVictimPosition = Engine.QueryInterface(victim, IID_Position);
	if (!cmpLeader || cmpLeader.facing === undefined || !cmpAttackerPosition || !cmpAttackerPosition.IsInWorld() ||
		!cmpVictimPosition || !cmpVictimPosition.IsInWorld())
		return 1;
	const toAttacker = Vector2D.sub(cmpAttackerPosition.GetPosition2D(), cmpVictimPosition.GetPosition2D());
	const length = toAttacker.length();
	if (length < 0.01)
		return 1;
	const dot = (toAttacker.x * Math.sin(cmpLeader.facing) + toAttacker.y * Math.cos(cmpLeader.facing)) / length;
	if (dot < -0.5)
		return 2.5;
	if (dot < 0.3)
		return 1.5;
	return 1;
};

/** Efeito somado dos acompanhantes vivos. */
BattalionTactics.prototype.GetSupportEffects = function()
{
	const result = { "loss": 1, "recovery": 1, "maxMorale": 0, "charge": 1 };
	const kinds = Engine.QueryInterface(this.entity, IID_BattalionLeader)?.GetAttachmentKinds() || [];
	for (const kind of new Set(kinds))
	{
		const effect = this.SUPPORT_EFFECTS[kind];
		if (!effect)
			continue;
		result.loss *= effect.loss;
		result.recovery *= effect.recovery;
		result.maxMorale += effect.maxMorale;
		result.charge *= effect.charge;
	}
	return result;
};

BattalionTactics.prototype.ReduceMorale = function(amount)
{
	const resistance = this.GetPostureEffects().moraleLoss * (1 - this.LEVEL_MORALE_BONUS * this.GetLevel()) *
		this.GetSupportEffects().loss / this.MORALE_RESILIENCE * this.GetVigorEffects().morale *
		(this.IsElite() ? this.ELITE_MORALE_LOSS : 1) * (this.IsInspired() ? this.INSPIRE_MORALE_LOSS : 1) *
		(this.IsWarCrying() ? this.WAR_CRY_MORALE_LOSS : 1);
	const before = this.GetMoraleState();
	this.morale = Math.max(0, this.morale - amount * resistance);
	if (this.GetMoraleState() != before)
		this.ApplyModifiers();
};

/** Bônus de recuperação: perto do general (herói) do próprio exército. */
BattalionTactics.prototype.GetRecoveryMultiplier = function(pos, owner)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const nearGeneral = cmpRangeManager.ExecuteQueryAroundPos(pos, 0, 50, [owner], IID_Identity, false)
		.some(ent => Engine.QueryInterface(ent, IID_Identity).HasClass("Hero"));
	return (1 + 0.25 * this.GetLevel()) * (nearGeneral ? 2 : 1) * (this.winning ? this.WINNING_RECOVERY : 1);
};

/** Batalhões amigos fugindo perto (cada um abala um pouco por tick). */
BattalionTactics.prototype.CountRoutingNeighbours = function(pos, owner)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	let count = 0;
	for (const ent of cmpRangeManager.ExecuteQueryAroundPos(pos, 0, this.PANIC_RADIUS, [owner], IID_BattalionTactics, false))
		if (ent != this.entity && Engine.QueryInterface(ent, IID_BattalionTactics).IsRouting())
			++count;
	return count;
};

// ------------------------------------------------ carga

BattalionTactics.prototype.CanCharge = function()
{
	return !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWCharger") && !this.routing && !this.charge &&
		this.GetMoraleState() != "broken" && this.GetTime() - this.lastChargeEnd > this.CHARGE_RECHARGE &&
		this.GetVigorState() != "exhausted" && !this.IsDisordered() && !this.terrain.water;
};

BattalionTactics.prototype.IsCharging = function()
{
	return !!this.charge && !this.charge.braced;
};

/** Correndo para o choque (antes do impacto). */
BattalionTactics.prototype.IsRunningIn = function()
{
	return this.IsCharging() && !this.charge.impact;
};

/** Começa a carga contra o batalhão de `targetLeader` (BattalionLeader.Engage). */
BattalionTactics.prototype.StartCharge = function(targetLeader)
{
	// Morro abaixo a carga bate mais forte; morro acima, mais fraca.
	let slope = 1;
	const from = Engine.QueryInterface(this.entity, IID_Position);
	const to = Engine.QueryInterface(targetLeader, IID_Position);
	if (from && to && from.IsInWorld() && to.IsInWorld())
	{
		const cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
		const a = from.GetPosition2D();
		const b = to.GetPosition2D();
		slope = Math.max(this.CHARGE_SLOPE_MIN, Math.min(this.CHARGE_SLOPE_MAX,
			1 + this.CHARGE_SLOPE_PER_M * (cmpTerrain.GetGroundLevel(a.x, a.y) - cmpTerrain.GetGroundLevel(b.x, b.y))));
	}
	this.charge = { "target": targetLeader, "start": this.GetTime(), "impact": undefined, "braced": false, "slope": slope };
	// Grito de guerra.
	PlaySound("order_attack", this.entity);
	this.ApplyModifiers();
	this.UpdateTint();
};

BattalionTactics.prototype.ChargeImpact = function(braced)
{
	if (!this.charge || this.charge.impact)
		return;
	this.charge.impact = this.GetTime();
	this.lastImpact = { "time": this.charge.impact, "target": this.charge.target };
	if (braced)
	{
		// Bateu numa parede de lanças: perde o bônus e o ânimo.
		this.charge.braced = true;
		this.ReduceMorale(this.Get("ChargeMoraleLoss", 12));
		this.Flash("impact");
	}
	this.ApplyModifiers();
};

BattalionTactics.prototype.EndCharge = function()
{
	this.charge = undefined;
	this.lastChargeEnd = this.GetTime();
	this.ApplyModifiers();
};

BattalionTactics.prototype.UpdateCharge = function()
{
	if (!this.charge)
		return;
	const time = this.GetTime();
	if (this.routing || time - this.charge.start > this.CHARGE_MAX_TIME ||
		this.charge.impact && time - this.charge.impact > this.CHARGE_IMPACT_TIME)
		this.EndCharge();
};

// ------------------------------------------------ furtividade

/**
 * Esconderijo e emboscada (Rome II): batalhão parado há STEALTH_DELAY, sem
 * lutar nem fugir, sob a copa das árvores (STEALTH_TREES árvores perto) fica
 * oculto dos inimigos que não tenham unidade a menos de
 * STEALTH_REVEAL_DISTANCE m. Tropa leve (classe TWStealth) também se esconde
 * num ponto alto (STEALTH_HIGH_GROUND m acima dos arredores). Elefantes,
 * carros e máquinas não se escondem. Atacar (ou ser atingido) revela; quem
 * abre o ataque escondido faz uma emboscada (AMBUSH_*).
 * ZZ_TWStealth.js aplica a visibilidade.
 */
BattalionTactics.prototype.CanHide = function()
{
	const cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);
	if (!cmpIdentity || this.NO_HIDE_CLASSES.some(cls => cmpIdentity.HasClass(cls)))
		return false;
	return cmpIdentity.HasClass("TWStealth") || cmpIdentity.HasClass("Infantry") || cmpIdentity.HasClass("Cavalry");
};

BattalionTactics.prototype.IsAmbushing = function()
{
	return this.GetTime() < this.ambushUntil;
};

BattalionTactics.prototype.UpdateStealth = function(cmpLeader, pos, owner)
{
	if (!this.CanHide())
		return;
	const time = this.GetTime();
	// Saiu do esconderijo atacando: emboscada.
	if (this.hidden && cmpLeader.GetBattalionEntities().some(ent => {
		const order = Engine.QueryInterface(ent, IID_UnitAI)?.order;
		return order && order.type == "Attack";
	}))
	{
		this.ambushUntil = time + this.AMBUSH_TIME;
		this.Notify("Ambush! Your hidden troops strike first.");
		this.Flash("charge");
	}
	// Parado = o líder parado e ninguém lutando. Soldados se ajeitando entre as
	// árvores (os lugares da formação caem em troncos) não contam.
	const busy = this.routing || this.charge || time - this.lastHitTime < this.STEALTH_DELAY ||
		!!Engine.QueryInterface(this.entity, IID_UnitMotion)?.IsMoveRequested() ||
		cmpLeader.GetBattalionEntities().some(ent => {
			const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
			return cmpUnitAI && cmpLeader.IsInCombat(cmpUnitAI);
		});
	if (busy)
		this.stillSince = time;
	else if (this.stillSince === undefined)
		this.stillSince = time;

	// Escondido tempo demais: aparece e espera antes de sumir de novo.
	if (this.hidden && this.hiddenSince !== undefined && time - this.hiddenSince > this.STEALTH_MAX_TIME)
		this.stillSince = time + this.STEALTH_COOLDOWN;
	let concealed = !busy && time - this.stillSince >= this.STEALTH_DELAY && !this.IsLastStand(owner) &&
		this.IsGoodCover(pos, Engine.QueryInterface(this.entity, IID_Identity).HasClass("TWStealth"));
	const hiddenFrom = [];
	if (concealed)
	{
		const cmpDiplomacy = QueryPlayerIDInterface(owner, IID_Diplomacy);
		const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		const radius = this.STEALTH_REVEAL_DISTANCE + cmpLeader.GetFrontWidth() / 2;
		for (const enemy of cmpDiplomacy ? cmpDiplomacy.GetEnemies() : [])
			if (enemy > 0 && !cmpRangeManager.ExecuteQueryAroundPos(pos, 0, radius, [enemy], IID_UnitAI, false).length)
				hiddenFrom.push(enemy);
		concealed = hiddenFrom.length > 0;
	}
	// Emboscada: escondido, o líder só ataca quem estiver ao alcance das
	// armas (não sai correndo atrás de quem só está à vista).
	const cmpLeaderAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (cmpLeaderAI && concealed && !this.hidden)
	{
		this.stanceBeforeHiding = cmpLeaderAI.GetStanceName();
		cmpLeaderAI.SwitchToStance("standground");
	}
	else if (cmpLeaderAI && !concealed && this.hidden && this.stanceBeforeHiding)
	{
		if (cmpLeaderAI.GetStanceName() == "standground")
			cmpLeaderAI.SwitchToStance(this.stanceBeforeHiding);
		this.stanceBeforeHiding = undefined;
	}
	if (concealed && !this.hidden)
		this.hiddenSince = time;
	this.hidden = concealed;
	for (const ent of cmpLeader.GetBattalionEntities())
	{
		const cmpVisibility = Engine.QueryInterface(ent, IID_Visibility);
		if (!cmpVisibility || !cmpVisibility.SetTWHiddenFrom)
			continue;
		cmpVisibility.SetTWHiddenFrom(concealed ? hiddenFrom : []);
	}
};

/**
 * Sem esconderijo quando o exército está em fuga ou só resta um batalhão
 * lutando: a batalha precisa poder acabar.
 */
BattalionTactics.prototype.IsLastStand = function(owner)
{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	if (!cmpTrigger || typeof cmpTrigger.TWLeadersOf != "function")
		return false;
	if (cmpTrigger.twFlight && cmpTrigger.twFlight.player == owner)
		return true;
	// O último batalhão em pé não se esconde (e ninguém fica oculto mais
	// que STEALTH_MAX_TIME seguidos, ver UpdateStealth).
	return cmpTrigger.TWLeadersOf(owner).filter(ent => !Engine.QueryInterface(ent, IID_BattalionTactics)?.routing).length < 2;
};

/** Bosque (árvores perto) ou, para tropa leve (`highGround`), ponto alto em relação ao entorno. */
BattalionTactics.prototype.IsGoodCover = function(pos, highGround = true)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const trees = cmpRangeManager.ExecuteQueryAroundPos(pos, 0, 14, [0], IID_ResourceSupply, false).filter(ent =>
		Engine.QueryInterface(ent, IID_ResourceSupply).GetType().generic == "wood").length;
	if (trees >= this.STEALTH_TREES)
		return true;
	if (!highGround)
		return false;
	const cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
	const here = cmpTerrain.GetGroundLevel(pos.x, pos.y);
	let around = 0;
	for (let k = 0; k < 8; ++k)
	{
		const a = k * Math.PI / 4;
		around += cmpTerrain.GetGroundLevel(pos.x + Math.cos(a) * 40, pos.y + Math.sin(a) * 40);
	}
	return here - around / 8 >= this.STEALTH_HIGH_GROUND;
};

BattalionTactics.prototype.IsHidden = function()
{
	return !!this.hidden;
};

// ------------------------------------------------ cores

/** Pisca uma cor por FLASH_TIME (choque recebido, lança firme). */
BattalionTactics.prototype.Flash = function(tint)
{
	this.flash = { "tint": tint, "until": this.GetTime() + this.FLASH_TIME };
	this.UpdateTint();
};

/**
 * Sombreamento dos modelos de todo o batalhão: dourado na carga, vermelho
 * no choque, azul na lança firme, cinza na fuga.
 */
BattalionTactics.prototype.UpdateTint = function()
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	if (!cmpLeader)
		return;
	if (this.flash && this.GetTime() > this.flash.until)
		this.flash = undefined;
	const name = this.flash ? this.flash.tint : this.IsCharging() ? "charge" : this.routing ? "rout" : this.hidden ? "hidden" : "normal";
	const entities = cmpLeader.GetBattalionEntities();
	const key = name + ":" + entities.join(",");
	if (key == this.appliedTint)
		return;
	this.appliedTint = key;
	const color = this.TINTS[name];
	for (const ent of entities)
		Engine.QueryInterface(ent, IID_Visual)?.SetShadingColor(color[0], color[1], color[2], 1);
};

BattalionTactics.prototype.Update = function(dt)
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	const cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
	if (!cmpLeader || !cmpPosition || !cmpPosition.IsInWorld() || !cmpOwnership)
		return;
	const pos = cmpPosition.GetPosition2D();
	const owner = cmpOwnership.GetOwner();

	// Baixas desde o último tick: batalhões pequenos sentem mais cada morte.
	const count = cmpLeader.members.length;
	if (this.lastMemberCount >= 0 && count < this.lastMemberCount)
		this.ReduceMorale(this.Get("CasualtyMoraleLoss", 4) * (this.lastMemberCount - count) * 20 / Math.max(4, cmpLeader.GetMaxStrength()));
	this.lastMemberCount = count;

	const panic = this.CountRoutingNeighbours(pos, owner);
	if (panic && !this.routing)
		this.ReduceMorale(1 * panic * dt);

	this.InitAmmo(cmpLeader);
	// Linha do relatório da batalha desde o começo (mesmo sem abates).
	if (this.statKey === undefined)
		this.GetStatsEntry(Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger));
	this.UpdateVigor(cmpLeader, dt);
	this.slowTimer -= dt;
	if (this.slowTimer <= 0)
	{
		this.slowTimer = this.SLOW_TICK;
		this.UpdateSlow(cmpLeader, pos, owner);
	}

	// Pressão contínua: flanco e retaguarda em contato, cercado, medo,
	// exército perdendo. Inimigos fugindo por perto animam.
	if (!this.routing)
	{
		let pressure = this.slowPressure;
		let sideCount = 0;
		for (const side in this.contactSides)
		{
			++sideCount;
			pressure += this.SIDE_PRESSURE[side] || 0;
		}
		if (sideCount >= 3)
			pressure += this.SURROUNDED_PRESSURE;
		if (pressure > 0)
			this.ReduceMorale(pressure * dt);
		if (this.winning)
			this.morale = Math.min(this.maxMorale + this.GetSupportEffects().maxMorale, this.morale + this.WINNING_MORALE * dt);
	}

	const stateBefore = this.GetMoraleState();
	if (this.GetTime() - this.lastHitTime > this.RECOVERY_DELAY * 1000)
	{
		const support = this.GetSupportEffects();
		this.morale = Math.min(this.maxMorale + support.maxMorale,
			this.morale + this.Get("MoraleRecoveryRate", 4) * this.GetRecoveryMultiplier(pos, owner) * support.recovery *
				this.GetHeightEffects().recovery * dt);
	}
	// Inquebráveis (classe TWUnbreakable) lutam até o fim.
	if (this.HasClass("TWUnbreakable") && !this.noRally)
		this.morale = Math.max(this.morale, this.Get("BrokenThreshold", 20));

	if (!this.routing && this.morale < this.Get("BrokenThreshold", 20))
		this.StartRout(cmpLeader);
	else if (this.routing && !this.noRally && this.morale >= this.GetRallyThreshold())
		this.Rally(cmpLeader);
	else if (this.routing)
	{
		// Destroçado (fugiu de novo, ou o exército perdeu) e na borda do
		// mapa: sai do campo (parte volta ao exército).
		const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
		if (this.IsShattered() && Math.min(pos.x, pos.y, mapSize - pos.x, mapSize - pos.y) < this.ESCAPE_EDGE_DISTANCE)
		{
			cmpLeader.Escape();
			return;
		}
		this.routTimer -= dt;
		if (this.routTimer <= 0)
			this.Flee(cmpLeader, pos, owner);
	}

	this.UpdateCharge();
	this.UpdateContact(cmpLeader, pos, owner);
	this.UpdateCycleCharge(cmpLeader, pos);
	this.UpdateStealth(cmpLeader, pos, owner);
	if (this.GetMoraleState() != stateBefore)
		this.ApplyModifiers();
	else
		this.ApplyModifiers(true);
	this.UpdateTint();
	this.UpdateBars();
};

BattalionTactics.prototype.GetRallyThreshold = function()
{
	return this.IsElite() ? Math.min(this.ELITE_RALLY, this.Get("ShakenThreshold", 50)) : this.Get("ShakenThreshold", 50);
};

/**
 * A cada SLOW_TICK s: terreno (bosque, água), medo de elefantes e carros,
 * perdas do exército e inimigos em fuga por perto. Guarda a pressão de
 * moral (por segundo) em slowPressure.
 */
BattalionTactics.prototype.UpdateSlow = function(cmpLeader, pos, owner)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
	const cmpWater = Engine.QueryInterface(SYSTEM_ENTITY, IID_WaterManager);

	const trees = cmpRangeManager.ExecuteQueryAroundPos(pos, 0, this.FOREST_RADIUS, [0], IID_ResourceSupply, false).filter(ent =>
		Engine.QueryInterface(ent, IID_ResourceSupply).GetType().generic == "wood").length;
	const depth = cmpWater ? cmpWater.GetWaterLevel(pos.x, pos.y) - cmpTerrain.GetGroundLevel(pos.x, pos.y) : 0;
	const terrain = { "forest": trees >= this.FOREST_TREES, "water": depth > this.WATER_DEPTH };
	const changed = terrain.forest != this.terrain.forest || terrain.water != this.terrain.water;
	this.terrain = terrain;

	let pressure = 0;
	const cmpDiplomacy = QueryPlayerIDInterface(owner, IID_Diplomacy);
	const enemies = cmpDiplomacy ? cmpDiplomacy.GetEnemies().filter(p => p > 0) : [];
	if (enemies.length && !this.FEAR_CLASSES.some(cls => this.HasClass(cls)))
	{
		const radius = this.FEAR_RADIUS + cmpLeader.GetFrontWidth() / 2;
		const scary = cmpRangeManager.ExecuteQueryAroundPos(pos, 0, radius, enemies, IID_Identity, false).some(ent => {
			const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
			return this.FEAR_CLASSES.some(cls => cmpIdentity.HasClass(cls));
		});
		if (scary)
			pressure += this.HasClass("Cavalry") ? this.FEAR_PRESSURE_CAVALRY : this.FEAR_PRESSURE;
	}

	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	const losses = cmpTrigger && typeof cmpTrigger.TWArmyLossFraction == "function" ? cmpTrigger.TWArmyLossFraction(owner) : 0;
	for (const [fraction, value] of this.ARMY_LOSS_PRESSURE)
		if (losses >= fraction)
		{
			pressure += value;
			break;
		}
	this.slowPressure = pressure;

	this.winning = enemies.length > 0 && cmpRangeManager.ExecuteQueryAroundPos(pos, 0, this.WINNING_RADIUS, enemies, IID_BattalionTactics, false)
		.some(ent => Engine.QueryInterface(ent, IID_BattalionTactics).IsRouting());

	// Terreno elevado: altura em relação ao batalhão inimigo mais próximo.
	const heightBefore = this.GetHeightState();
	let nearest;
	let nearestDistance = Infinity;
	for (const ent of enemies.length ? cmpRangeManager.ExecuteQueryAroundPos(pos, 0, this.HEIGHT_COMPARE_RADIUS, enemies, IID_BattalionTactics, false) : [])
	{
		const other = Engine.QueryInterface(ent, IID_Position);
		if (!other || !other.IsInWorld())
			continue;
		const d = other.GetPosition2D().distanceToSquared(pos);
		if (d < nearestDistance)
		{
			nearestDistance = d;
			nearest = other.GetPosition2D();
		}
	}
	this.heightAdvantage = nearest ? cmpTerrain.GetGroundLevel(pos.x, pos.y) - cmpTerrain.GetGroundLevel(nearest.x, nearest.y) : 0;

	if (changed || heightBefore != this.GetHeightState())
		this.ApplyModifiers();
};

/**
 * Carga em ciclo (cavalaria): depois do choque, ainda presa ao inimigo, a
 * cavalaria recua CYCLE_DISTANCE m e, com a carga pronta, carrega de novo.
 */
BattalionTactics.prototype.UpdateCycleCharge = function(cmpLeader, pos)
{
	if (!this.options.cycleCharge || this.routing)
	{
		this.cycle = undefined;
		return;
	}
	const time = this.GetTime();
	const alive = ent => ent !== undefined && (Engine.QueryInterface(ent, IID_Health)?.GetHitpoints() || 0) > 0 &&
		!!Engine.QueryInterface(ent, IID_Position)?.IsInWorld();
	const cmpLeaderAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (!cmpLeaderAI)
		return;
	if (!this.cycle)
	{
		if (!this.lastImpact || time - this.lastImpact.time < this.CYCLE_AFTER_IMPACT || !this.IsEngaged())
			return;
		const target = this.lastImpact.target;
		this.lastImpact = undefined;
		if (!alive(target))
			return;
		const away = Vector2D.sub(pos, Engine.QueryInterface(target, IID_Position).GetPosition2D());
		if (away.length() < 0.01)
			return;
		away.normalize().mult(this.CYCLE_DISTANCE);
		const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
		const x = Math.max(4, Math.min(mapSize - 4, pos.x + away.x));
		const z = Math.max(4, Math.min(mapSize - 4, pos.y + away.y));
		this.cycle = { "target": target, "until": time + this.CYCLE_MAX_TIME };
		cmpLeader.StopAll();
		cmpLeaderAI.Walk(x, z, false, false);
		return;
	}
	if (!alive(this.cycle.target))
	{
		this.cycle = undefined;
		return;
	}
	const moving = !!Engine.QueryInterface(this.entity, IID_UnitMotion)?.IsMoveRequested();
	if (!moving && this.CanCharge() || time > this.cycle.until)
	{
		const target = this.cycle.target;
		this.cycle = undefined;
		cmpLeaderAI.Attack(target, false, false, false);
		cmpLeader.Engage();
	}
};

/** Barras de moral, vigor e munição sobre o líder: redesenha quando mudam. */
BattalionTactics.prototype.UpdateBars = function()
{
	const key = [Math.round(this.morale / 5), Math.round(this.vigor / 10),
		this.UsesAmmo() ? Math.round(10 * this.ammo / Math.max(1, this.ammoMax)) : "-", this.routing].join("|");
	if (key == this.barKey)
		return;
	this.barKey = key;
	Engine.QueryInterface(this.entity, IID_StatusBars)?.RegenerateSprites();
};

// ------------------------------------------------ contato

BattalionTactics.prototype.GetMass = function(ent)
{
	const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
	if (!cmpIdentity)
		return 1;
	for (const cls in this.MASS)
		if (cmpIdentity.HasClass(cls))
			return this.MASS[cls];
	return 1;
};

BattalionTactics.prototype.IsEngaged = function()
{
	return this.GetTime() < this.engagedUntil;
};

/**
 * Procura soldados de batalhões inimigos encostados nos nossos. Batalhão
 * preso anda devagar; a velocidade depende da massa dos dois lados (cavalaria
 * pesada atravessa infantaria leve melhor, mas lanceiros firmes a seguram).
 */
BattalionTactics.prototype.UpdateContact = function(cmpLeader, pos, owner)
{
	const entities = cmpLeader.GetBattalionEntities();
	const cmpDiplomacy = QueryPlayerIDInterface(owner, IID_Diplomacy);
	const enemyPlayers = cmpDiplomacy ? cmpDiplomacy.GetEnemies().filter(p => p > 0) : [];
	const own = [];
	let radius = 0;
	for (const ent of entities)
	{
		const cmpPos = Engine.QueryInterface(ent, IID_Position);
		if (!cmpPos || !cmpPos.IsInWorld())
			continue;
		const p = cmpPos.GetPosition2D();
		own.push(p);
		radius = Math.max(radius, p.distanceTo(pos));
	}

	let contacts = 0;
	let enemyMass = 0;
	let enemyCount = 0;
	const sides = {};
	if (own.length && enemyPlayers.length)
	{
		const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		const enemies = [];
		for (const ent of cmpRangeManager.ExecuteQueryAroundPos(pos, 0, radius + this.ENGAGE_RANGE, enemyPlayers, IID_UnitAI, false))
		{
			// Só soldados de batalhão contam (aldeões e animais não prendem).
			const member = Engine.QueryInterface(ent, IID_BattalionMember);
			const leader = member ? member.GetLeader() : Engine.QueryInterface(ent, IID_BattalionLeader) ? ent : INVALID_ENTITY;
			if (leader == INVALID_ENTITY)
				continue;
			const p = Engine.QueryInterface(ent, IID_Position)?.GetPosition2D();
			if (!p)
				continue;
			const tactics = Engine.QueryInterface(leader, IID_BattalionTactics);
			// Quem está em fuga não segura ninguém.
			if (tactics && tactics.routing)
				continue;
			enemies.push({ "p": p, "ent": ent, "braced": !!tactics && tactics.CanBrace() });
		}
		if (enemies.length)
		{
			const range2 = this.ENGAGE_RANGE * this.ENGAGE_RANGE;
			const touching = new Set();
			for (const p of own)
			{
				let hit = false;
				for (const enemy of enemies)
					if (p.distanceToSquared(enemy.p) <= range2)
					{
						hit = true;
						touching.add(enemy);
					}
				if (hit)
					++contacts;
			}
			const heavy = this.GetMass(this.entity) > 1;
			// De que lados o inimigo está encostado (frente, esquerda, direita, retaguarda).
			const center = own.reduce((sum, p) => sum.add(p), new Vector2D(0, 0)).div(own.length);
			const facing = cmpLeader.facing !== undefined ? cmpLeader.facing : 0;
			const forward = new Vector2D(Math.sin(facing), Math.cos(facing));
			const right = new Vector2D(Math.cos(facing), -Math.sin(facing));
			const halfDepth = Math.max(1, cmpLeader.GetDepth() / 2);
			const halfWidth = Math.max(1, cmpLeader.GetFrontWidth() / 2);
			for (const enemy of touching)
			{
				enemyMass += this.GetMass(enemy.ent) * (heavy && enemy.braced ? this.BRACE_MASS : 1);
				++enemyCount;
				const d = Vector2D.sub(enemy.p, center);
				const f = d.dot(forward) / halfDepth;
				const r = d.dot(right) / halfWidth;
				sides[f >= Math.abs(r) ? "front" : -f >= Math.abs(r) ? "rear" : r > 0 ? "right" : "left"] = true;
			}
		}
	}
	if (contacts)
		this.contactSides = sides;
	else if (!this.IsEngaged())
		this.contactSides = {};

	if (contacts && contacts >= Math.min(this.ENGAGE_MIN_CONTACTS, own.length))
	{
		this.engagedUntil = this.GetTime() + this.ENGAGE_HOLD;
		const ratio = this.GetMass(this.entity) / Math.max(0.5, enemyMass / Math.max(1, enemyCount));
		this.engagedWalk = Math.max(this.ENGAGED_WALK_MIN, Math.min(this.ENGAGED_WALK_MAX, this.ENGAGED_WALK * Math.sqrt(ratio)));
	}
	else if (!this.IsEngaged())
		this.engagedWalk = 1;
};

BattalionTactics.prototype.GetEngagedWalk = function()
{
	if (this.engagedWalk >= 1)
		return 1;
	return this.routing ? Math.max(this.engagedWalk, this.ENGAGED_ROUT_WALK) : this.engagedWalk;
};

BattalionTactics.prototype.StartRout = function(cmpLeader)
{
	this.routing = true;
	++this.routCount;
	this.maxMorale = Math.max(60, 100 - this.ROUT_MAX_MORALE_PENALTY * this.routCount);
	this.routTimer = 0;
	this.ApplyModifiers();
	this.Notify(markForTranslation("A battalion is routing!"));
};

/**
 * Exército derrotado: o batalhão foge até sair do campo e não se reagrupa.
 */
/** Batalhão que não vai mais se reagrupar no campo: vai embora pela borda. */
BattalionTactics.prototype.IsShattered = function()
{
	return !!this.noRally || this.routCount >= 2;
};

BattalionTactics.prototype.ForceRout = function()
{
	this.noRally = true;
	this.morale = 0;
	if (!this.routing)
	{
		this.routing = true;
		++this.routCount;
	}
	this.routTimer = 0;
	this.ApplyModifiers();
};

BattalionTactics.prototype.Rally = function(cmpLeader)
{
	this.routing = false;
	cmpLeader.StopAll();
	this.ApplyModifiers();
	this.Notify(markForTranslation("A battalion has rallied."));
};

/**
 * Foge para o lado oposto aos inimigos próximos (ou para a zona de
 * desdobramento, sem inimigos à vista). Todos os soldados andam juntos.
 */
BattalionTactics.prototype.Flee = function(cmpLeader, pos, owner)
{
	this.routTimer = this.ROUT_REORDER;
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const cmpDiplomacy = QueryPlayerIDInterface(owner, IID_Diplomacy);
	const enemies = cmpDiplomacy ? cmpDiplomacy.GetEnemies() : [];
	let away = new Vector2D(0, 0);
	for (const ent of cmpRangeManager.ExecuteQueryAroundPos(pos, 0, 80, enemies, IID_UnitAI, false))
	{
		const enemyPos = Engine.QueryInterface(ent, IID_Position)?.GetPosition2D();
		if (enemyPos)
			away.add(Vector2D.sub(pos, enemyPos).normalize());
	}

	// Foge para a borda do próprio lado (de onde veio), desviando de
	// quem estiver perto. Sem a batalha, só para longe do inimigo.
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	// Primeira fuga: volta para o acampamento (zona de desdobramento) e
	// pode se reagrupar. Destroçado: para a borda, saindo do campo.
	const exit = cmpTrigger && (this.IsShattered() ?
		typeof cmpTrigger.TWGetRetreatPoint == "function" && cmpTrigger.TWGetRetreatPoint(owner, pos) :
		typeof cmpTrigger.TWGetDeployCenter == "function" && cmpTrigger.TWGetDeployCenter(owner));
	if (away.length() > 0.01)
		away.normalize();
	if (exit)
	{
		const toExit = Vector2D.sub(new Vector2D(exit.x, exit.y), pos);
		if (toExit.length() > 0.01)
			away.add(toExit.normalize().mult(1.5));
	}
	if (away.length() < 0.01)
		return;
	away.normalize().mult(this.ROUT_DISTANCE);

	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	// Pode ir até a borda (é por ela que o batalhão sai do campo).
	const x = Math.max(2, Math.min(mapSize - 2, pos.x + away.x));
	const z = Math.max(2, Math.min(mapSize - 2, pos.y + away.y));
	for (const ent of cmpLeader.GetBattalionEntities())
	{
		const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		if (cmpUnitAI)
			cmpUnitAI.Walk(x, z, false, false);
	}
};

BattalionTactics.prototype.Notify = function(message)
{
	const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
	if (!(owner > 0))
		return;
	Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).PushNotification({
		"type": "text",
		"players": [owner],
		"message": message,
		"translateMessage": true
	});
};

// ------------------------------------------------ modificadores

/**
 * Soma postura, moral e nível num conjunto de modificadores e aplica em
 * todos os soldados. Só reaplica quando algo mudou.
 */
BattalionTactics.prototype.ApplyModifiers = function(onlyIfChanged = false)
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	if (!cmpLeader)
		return;

	const posture = this.GetPostureEffects();
	const morale = this.MORALE_EFFECTS[this.GetMoraleState()];
	const level = this.GetLevel();

	const vigor = this.GetVigorEffects();
	const ground = this.terrain.water ? this.WATER_EFFECTS : this.IsDisordered() ? this.DISORDER_EFFECTS : { "walk": 1, "attack": 1 };
	const height = this.GetHeightEffects();
	const spread = posture.spread * morale.spread * (1 - 0.08 * level) * height.spread;
	const repeat = posture.repeat * morale.repeat * (1 - 0.04 * level) * vigor.repeat;
	const rangedRepeat = repeat * (this.options.fireArrows ? this.FIRE_ARROW_REPEAT : 1);
	const walk = posture.walk * morale.walk * this.GetEngagedWalk() * vigor.walk * ground.walk;
	const attack = morale.attack * (1 + this.LEVEL_ATTACK_BONUS * level) * (posture.attack || 1) * vigor.attack * ground.attack *
		(this.IsWarCrying() ? this.WAR_CRY_ATTACK : 1) * (this.IsInspired() ? this.INSPIRE_ATTACK : 1) *
		(this.IsAmbushing() ? this.AMBUSH_ATTACK : 1);
	const armor = this.LEVEL_ARMOR_BONUS * level + (posture.armor || 0);
	const pierce = posture.pierce || 0;
	// Carga: dano corpo a corpo maior até pouco depois do choque, e corrida.
	const charge = this.IsCharging() ? this.Get("ChargeDamage", 1) * (posture.charge || 1) * (this.charge.slope || 1) : 1;
	const chargeSpeed = this.IsRunningIn() ? this.Get("ChargeSpeed", 1) : 1;
	const key = [spread, repeat, rangedRepeat, walk * chargeSpeed, attack, armor, pierce, charge].map(v => v.toFixed(3)).join("|");

	const entities = cmpLeader.GetBattalionEntities();
	const entitiesKey = entities.join(",");
	if (onlyIfChanged && entitiesKey == this.appliedEntities.join(",") && key == this.appliedKey)
		return;

	const cmpModifiersManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ModifiersManager);
	for (const ent of this.appliedEntities)
		if (Engine.QueryInterface(ent, IID_Identity))
			cmpModifiersManager.RemoveAllModifiers(this.MODIFIER_ID, ent);

	const modifiers = {};
	const multiply = (path, value) => {
		if (Math.abs(value - 1) > 0.0005)
			modifiers[path] = [{ "multiply": value, "affects": [] }];
	};
	const add = (path, value) => {
		if (value)
			modifiers[path] = [{ "add": value, "affects": [] }];
	};
	multiply("Attack/Ranged/Projectile/Spread", spread);
	multiply("Attack/Ranged/RepeatTime", rangedRepeat);
	multiply("Attack/Melee/RepeatTime", repeat);
	multiply("UnitMotion/WalkSpeed", walk * chargeSpeed);
	for (const type of ["Hack", "Pierce", "Crush"])
	{
		multiply("Attack/Melee/Damage/" + type, attack * charge);
		multiply("Attack/Ranged/Damage/" + type, attack);
		add("Resistance/Entity/Damage/" + type, armor + (type == "Pierce" ? pierce : 0));
	}

	const hasModifiers = Object.keys(modifiers).length > 0;
	if (hasModifiers)
		for (const ent of entities)
			cmpModifiersManager.AddModifiers(this.MODIFIER_ID, modifiers, ent);

	this.appliedEntities = hasModifiers ? entities : [];
	this.appliedKey = key;
};

/**
 * Novo líder (o anterior morreu): mantém postura, moral e fugas, com a
 * penalidade pela perda do líder.
 */
BattalionTactics.prototype.InheritFrom = function(cmpOld, formerLeader)
{
	this.posture = cmpOld.posture;
	this.morale = cmpOld.morale;
	this.maxMorale = cmpOld.maxMorale;
	this.routing = cmpOld.routing;
	this.noRally = cmpOld.noRally;
	this.routCount = cmpOld.routCount;
	this.lastHitTime = this.GetTime();
	this.appliedEntities = cmpOld.appliedEntities.filter(ent => ent != formerLeader);
	this.appliedKey = "";
	this.charge = cmpOld.charge;
	this.lastChargeEnd = cmpOld.lastChargeEnd;
	this.engagedUntil = cmpOld.engagedUntil;
	this.engagedWalk = cmpOld.engagedWalk;
	this.contactSides = cmpOld.contactSides;
	this.vigor = cmpOld.vigor;
	this.ammo = cmpOld.ammo;
	this.ammoMax = cmpOld.ammoMax;
	this.options = Object.assign({}, cmpOld.options);
	this.stanceBeforeOption = cmpOld.stanceBeforeOption;
	this.terrain = cmpOld.terrain;
	this.slowPressure = cmpOld.slowPressure;
	this.winning = cmpOld.winning;
	this.warCryUntil = cmpOld.warCryUntil;
	this.warCryReady = cmpOld.warCryReady;
	this.inspiredUntil = cmpOld.inspiredUntil;
	this.cycle = cmpOld.cycle;
	this.lastImpact = cmpOld.lastImpact;
	this.kills = cmpOld.kills;
	this.statKey = cmpOld.statKey !== undefined ? cmpOld.statKey : "b" + formerLeader;
	// O líder novo nasce com a postura do template: aplica as opções de novo.
	if (!this.options.fireAtWill || this.options.guard)
	{
		this.stanceBeforeOption = undefined;
		this.ApplyStanceOptions();
	}
	this.ReduceMorale(this.Get("LeaderLossMoraleLoss", 15));
};

BattalionTactics.prototype.GetStatus = function()
{
	const cmpLeader = Engine.QueryInterface(this.entity, IID_BattalionLeader);
	return {
		"morale": Math.round(this.morale),
		"maxMorale": this.maxMorale,
		"moraleState": this.GetMoraleState(),
		"routing": this.routing,
		"charging": this.IsCharging(),
		"engaged": this.IsEngaged(),
		"contactSides": Object.keys(this.contactSides),
		"vigor": Math.round(this.vigor),
		"vigorState": this.GetVigorState(),
		"ammo": this.UsesAmmo() ? this.ammo : undefined,
		"ammoMax": this.UsesAmmo() ? this.ammoMax : undefined,
		"options": this.options,
		"availableOptions": this.GetAvailableOptions(),
		"terrain": this.terrain,
		"disordered": this.IsDisordered(),
		"elite": this.IsElite(),
		"unbreakable": this.HasClass("TWUnbreakable"),
		"warCry": this.HasClass("TWWarCry") ? Math.max(0, Math.ceil((this.warCryReady - this.GetTime()) / 1000)) : undefined,
		"warCrying": this.IsWarCrying(),
		"inspired": this.IsInspired(),
		"cycling": !!this.cycle,
		"fightingRanks": isFinite(this.GetFightingRanks()) ? this.GetFightingRanks() : 0,
		"kills": this.kills,
		"hidden": !!this.hidden,
		"canHide": this.CanHide(),
		"hideAnywhere": !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWStealth"),
		"ambushing": this.IsAmbushing(),
		"height": this.GetHeightState(),
		"heightAdvantage": Math.round(this.heightAdvantage),
		"stakes": this.CanEverPlantStakes() ? (this.stakesUsed ? -1 : this.CanPlantStakes() ? 0 : 1) : undefined,
		"canCharge": !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWCharger"),
		"brace": !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWBrace"),
		"posture": this.posture,
		"postures": this.GetAvailablePostures(),
		"level": this.GetLevel(),
		"xp": cmpLeader ? Math.round(cmpLeader.GetCurrentXp()) : 0,
		"nextLevelXp": this.GetNextLevelXp()
	};
};

Engine.RegisterComponentType(IID_BattalionTactics, "BattalionTactics", BattalionTactics);
