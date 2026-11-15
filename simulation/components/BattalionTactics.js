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
	"<optional><element name='BrokenThreshold' a:help='Below this, the battalion routs.'><ref name='nonNegativeDecimal'/></element></optional>";

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
	return !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWBrace") || !!this.GetPostureEffects().brace;
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

	const time = this.GetTime();

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
		this.GetSupportEffects().loss / this.MORALE_RESILIENCE;
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
	return (1 + 0.25 * this.GetLevel()) * (nearGeneral ? 2 : 1);
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
		this.GetMoraleState() != "broken" && this.GetTime() - this.lastChargeEnd > this.CHARGE_RECHARGE;
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
	this.charge = { "target": targetLeader, "start": this.GetTime(), "impact": undefined, "braced": false };
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
 * Tropa leve (classe TWStealth) parada há STEALTH_DELAY, sem lutar nem
 * fugir, sob a copa das árvores (STEALTH_TREES árvores perto) ou num ponto
 * alto (STEALTH_HIGH_GROUND m acima dos arredores): fica oculta dos
 * inimigos que não tenham unidade a menos de STEALTH_REVEAL_DISTANCE m.
 * Atacar (ou ser atingido) revela; ZZ_TWStealth.js aplica a visibilidade.
 */
BattalionTactics.prototype.UpdateStealth = function(cmpLeader, pos, owner)
{
	if (!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWStealth"))
		return;
	const time = this.GetTime();
	const busy = this.routing || this.charge || time - this.lastHitTime < this.STEALTH_DELAY ||
		cmpLeader.GetBattalionEntities().some(ent => {
			const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
			const cmpMotion = Engine.QueryInterface(ent, IID_UnitMotion);
			return cmpUnitAI && cmpLeader.IsInCombat(cmpUnitAI) || cmpMotion && cmpMotion.IsMoveRequested();
		});
	if (busy)
		this.stillSince = time;
	else if (this.stillSince === undefined)
		this.stillSince = time;

	// Escondido tempo demais: aparece e espera antes de sumir de novo.
	if (this.hidden && this.hiddenSince !== undefined && time - this.hiddenSince > this.STEALTH_MAX_TIME)
		this.stillSince = time + this.STEALTH_COOLDOWN;
	let concealed = !busy && time - this.stillSince >= this.STEALTH_DELAY && !this.IsLastStand(owner) && this.IsGoodCover(pos);
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
 * Sem esconderijo quando o exército está em fuga ou quando só restam
 * batalhões furtivos: a batalha precisa poder acabar.
 */
BattalionTactics.prototype.IsLastStand = function(owner)
{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	if (!cmpTrigger || typeof cmpTrigger.TWLeadersOf != "function")
		return false;
	if (cmpTrigger.twFlight && cmpTrigger.twFlight.player == owner)
		return true;
	return cmpTrigger.TWLeadersOf(owner).every(ent => {
		const cmpTactics = Engine.QueryInterface(ent, IID_BattalionTactics);
		return Engine.QueryInterface(ent, IID_Identity)?.HasClass("TWStealth") && (!cmpTactics || !cmpTactics.routing);
	});
};

/** Bosque (árvores perto) ou ponto alto em relação ao entorno. */
BattalionTactics.prototype.IsGoodCover = function(pos)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const trees = cmpRangeManager.ExecuteQueryAroundPos(pos, 0, 14, [0], IID_ResourceSupply, false).filter(ent =>
		Engine.QueryInterface(ent, IID_ResourceSupply).GetType().generic == "wood").length;
	if (trees >= this.STEALTH_TREES)
		return true;
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

	const stateBefore = this.GetMoraleState();
	if (this.GetTime() - this.lastHitTime > this.RECOVERY_DELAY * 1000)
	{
		const support = this.GetSupportEffects();
		this.morale = Math.min(this.maxMorale + support.maxMorale,
			this.morale + this.Get("MoraleRecoveryRate", 4) * this.GetRecoveryMultiplier(pos, owner) * support.recovery * dt);
	}

	if (!this.routing && this.morale < this.Get("BrokenThreshold", 20))
		this.StartRout(cmpLeader);
	else if (this.routing && !this.noRally && this.morale >= this.Get("ShakenThreshold", 50))
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
	this.UpdateStealth(cmpLeader, pos, owner);
	if (this.GetMoraleState() != stateBefore)
		this.ApplyModifiers();
	else
		this.ApplyModifiers(true);
	this.UpdateTint();
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

	const spread = posture.spread * morale.spread * (1 - 0.08 * level);
	const repeat = posture.repeat * morale.repeat * (1 - 0.04 * level);
	const walk = posture.walk * morale.walk;
	const attack = morale.attack * (1 + this.LEVEL_ATTACK_BONUS * level) * (posture.attack || 1);
	const armor = this.LEVEL_ARMOR_BONUS * level + (posture.armor || 0);
	const pierce = posture.pierce || 0;
	// Carga: dano corpo a corpo maior até pouco depois do choque, e corrida.
	const charge = this.IsCharging() ? this.Get("ChargeDamage", 1) * (posture.charge || 1) : 1;
	const chargeSpeed = this.IsRunningIn() ? this.Get("ChargeSpeed", 1) : 1;
	const key = [spread, repeat, walk * chargeSpeed, attack, armor, pierce, charge].map(v => v.toFixed(3)).join("|");

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
	multiply("Attack/Ranged/RepeatTime", repeat);
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
		"hidden": !!this.hidden,
		"canHide": !!Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWStealth"),
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
