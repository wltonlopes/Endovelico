/**
 * Batalhão (Total Warfield): o líder comanda um grupo fixo de soldados.
 *
 * - O líder é a entidade selecionável e que recebe as ordens de movimento;
 *   os soldados (BattalionMember) ficam em fileiras atrás dele, viradas
 *   para onde o líder olha, e correm de volta à posição quando ficam para
 *   trás. Ordens de ataque vão para todos (helpers/ZZ_TWCommands.js).
 * - Força inicial: por padrão o batalhão nasce completo (Size, contando o
 *   líder). A batalha da campanha define antes do dono a força, a
 *   experiência e o id do batalhão na campanha (SetCampaignData), e no fim
 *   lê os sobreviventes por esse id (maps/scripts/TWFieldBattle.js).
 * - Se o líder morre, o soldado mais experiente assume (um novo líder é
 *   criado no lugar dele) e o batalhão continua, com o mesmo id.
 * - Moral, posturas e níveis ficam em BattalionTactics, atualizado aqui.
 */
function BattalionLeader() {}

BattalionLeader.prototype.Schema =
	"<a:help>Battalion: a leader that keeps a fixed group of soldiers in formation.</a:help>" +
	"<optional><element name='Size' a:help='Soldiers including the leader.'><data type='positiveInteger'/></element></optional>" +
	"<optional><element name='Columns' a:help='Soldiers per rank.'><data type='positiveInteger'/></element></optional>" +
	"<optional><element name='Spacing' a:help='Distance between soldiers (m).'><ref name='positiveDecimal'/></element></optional>" +
	"<optional><element name='MemberTemplate'><text/></element></optional>" +
	"<optional><element name='Category'><text/></element></optional>" +
	"<optional><element name='RequiredXp' a:help='XP of the first level.'><data type='positiveInteger'/></element></optional>";

/** Intervalo do tick do batalhão (ms). */
BattalionLeader.prototype.UPDATE_INTERVAL = 500;
/** Soldado a mais que isso da posição corre para alcançá-la (m). */
BattalionLeader.prototype.CATCH_UP_DISTANCE = 5;
/** Tolerância para não reenviar a mesma ordem de andar (m). */
BattalionLeader.prototype.REORDER_TOLERANCE = 1.0;

BattalionLeader.prototype.Init = function()
{
	this.members = [];
	this.size = +(this.template.Size || 20);
	this.columns = +(this.template.Columns || 5);
	this.spacing = +(this.template.Spacing || 2.2);
	this.category = this.template.Category || "infantry_melee";
	this.requiredXp = +(this.template.RequiredXp || 150);
	this.currentXp = 0;
	this.spawned = false;
	this.spawnAfterMapLoad = false;
	// Dados da campanha: id do batalhão, soldados a criar (com o líder).
	this.campaignId = undefined;
	this.initialStrength = undefined;
	// Acompanhantes (sacerdote, músico...): [{ "ent", "kind" }] e os que
	// ainda vão nascer ([{ "kind", "template" }]).
	this.attachments = [];
	this.pendingAttachments = [];
	// Última direção conhecida (radianos, como Position.GetRotation().y).
	this.facing = undefined;

	Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).SetInterval(this.entity, IID_BattalionLeader,
		"UpdateBattalion", this.UPDATE_INTERVAL, this.UPDATE_INTERVAL, null);
};

/**
 * Chamado antes de dar o dono ao líder (que é quando os soldados nascem).
 * @param {Object} data - { id, strength (com o líder), xp }
 */
BattalionLeader.prototype.SetCampaignData = function(data)
{
	if (data.id !== undefined)
		this.campaignId = data.id;
	if (data.strength !== undefined)
		this.initialStrength = Math.max(1, Math.min(this.size, Math.round(+data.strength)));
	if (data.xp !== undefined)
		this.currentXp = Math.max(0, +data.xp);
	if (data.attachments)
		this.pendingAttachments = data.attachments.filter(a => a && a.kind && a.template);
};

BattalionLeader.prototype.GetCampaignId = function()
{
	return this.campaignId;
};

BattalionLeader.prototype.GetCategory = function()
{
	return this.category;
};

BattalionLeader.prototype.OnOwnershipChanged = function(msg)
{
	if (msg.to == INVALID_PLAYER || this.spawned)
		return;

	// Durante o carregamento do mapa (tempo 0) o motor cria as entidades do
	// mapa com ids fixos; criar soldados agora tomaria esses ids.
	if (Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() == 0)
	{
		this.spawnAfterMapLoad = true;
		return;
	}
	this.spawned = true;
	this.SpawnMembers();
};

BattalionLeader.prototype.OnInitGame = function()
{
	this.SpawnDeferredMembers();
};

BattalionLeader.prototype.SpawnDeferredMembers = function()
{
	if (!this.spawnAfterMapLoad || this.spawned)
		return;
	this.spawnAfterMapLoad = false;
	this.spawned = true;
	this.SpawnMembers();
};

BattalionLeader.prototype.GetMemberTemplate = function()
{
	if (this.template.MemberTemplate)
		return this.template.MemberTemplate;
	const name = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager).GetCurrentTemplateName(this.entity);
	return name.replace(/\/([^/]*)$/, "/m_$1");
};

BattalionLeader.prototype.SpawnMembers = function()
{
	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	const cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
	if (!cmpPosition || !cmpPosition.IsInWorld() || !cmpOwnership)
		return;

	const owner = cmpOwnership.GetOwner();
	const count = (this.initialStrength || this.size) - 1;
	const template = this.GetMemberTemplate();
	const leaderPos = cmpPosition.GetPosition2D();
	const angle = cmpPosition.GetRotation().y;
	this.facing = angle;

	for (let i = 0; i < count; ++i)
	{
		const ent = Engine.AddEntity(template);
		if (ent == INVALID_ENTITY)
		{
			warn("Total Warfield: could not create battalion member '" + template + "'.");
			return;
		}
		const slot = this.GetSlotPosition(leaderPos, angle, i, count);
		const cmpMemberPosition = Engine.QueryInterface(ent, IID_Position);
		if (cmpMemberPosition)
		{
			cmpMemberPosition.JumpTo(slot.x, slot.y);
			cmpMemberPosition.SetYRotation(angle);
		}
		Engine.QueryInterface(ent, IID_Ownership)?.SetOwner(owner);
		Engine.QueryInterface(ent, IID_BattalionMember)?.SetLeader(this.entity);
		this.members.push(ent);
	}
	this.SpawnAttachments(leaderPos, angle, owner);
	// Tropa leve: visibilidade por script desde já (ZZ_TWStealth.js).
	if (Engine.QueryInterface(this.entity, IID_Identity)?.HasClass("TWStealth"))
		for (const ent of this.GetBattalionEntities())
			Engine.QueryInterface(ent, IID_Visibility)?.EnableTWStealth?.();
	Engine.QueryInterface(this.entity, IID_BattalionTactics)?.ApplyModifiers();
};

BattalionLeader.prototype.SpawnAttachments = function(leaderPos, angle, owner)
{
	const count = this.members.length;
	this.pendingAttachments.forEach((attachment, k) => {
		const ent = Engine.AddEntity(attachment.template);
		if (ent == INVALID_ENTITY)
		{
			warn("Total Warfield: could not create battalion attachment '" + attachment.template + "'.");
			return;
		}
		const slot = this.GetAttachmentSlot(leaderPos, angle, k, count);
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		cmpPosition?.JumpTo(slot.x, slot.y);
		cmpPosition?.SetYRotation(angle);
		Engine.QueryInterface(ent, IID_Ownership)?.SetOwner(owner);
		Engine.QueryInterface(ent, IID_BattalionMember)?.SetLeader(this.entity);
		this.attachments.push({ "ent": ent, "kind": attachment.kind });
	});
	this.pendingAttachments = [];
};

/** Acompanhantes atrás da última fileira, no centro. */
BattalionLeader.prototype.GetAttachmentSlot = function(leaderPos, angle, k, memberCount)
{
	const shape = this.GetFormationShape(Math.max(1, memberCount));
	const rows = Math.ceil(memberCount / shape.columns);
	const localX = (k - (this.attachments.length + this.pendingAttachments.length - 1) / 2) * shape.spacing * 1.5;
	const localY = -(rows + 1.5) * shape.spacing;
	const sin = Math.sin(angle);
	const cos = Math.cos(angle);
	return { "x": leaderPos.x + localX * cos + localY * sin, "y": leaderPos.y - localX * sin + localY * cos };
};

/** Tipos de acompanhante ainda vivos. */
BattalionLeader.prototype.GetAttachmentKinds = function()
{
	this.CleanupMembers();
	return this.attachments.map(a => a.kind);
};

// ------------------------------------------------ formação

/**
 * Colunas e espaçamento atuais (a postura do batalhão pode mudar).
 */
BattalionLeader.prototype.GetFormationShape = function(memberCount)
{
	const cmpTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	const override = cmpTactics ? cmpTactics.GetFormationOverride(memberCount) : { "columns": null, "spacingScale": 1 };
	return {
		"columns": Math.max(1, Math.min(memberCount, override.columns || this.columns)),
		"spacing": this.spacing * (override.spacingScale || 1),
		"shape": override.shape
	};
};

/**
 * Posição do soldado `index` (0 = primeiro da primeira fileira). As
 * fileiras ficam atrás do líder, centradas, viradas para `angle`.
 */
BattalionLeader.prototype.GetSlotPosition = function(leaderPos, angle, index, memberCount)
{
	const shape = this.GetFormationShape(memberCount);
	let localX;
	let localY;
	if (shape.shape == "wedge" || shape.shape == "staggered")
	{
		// Triângulo atrás do líder (na ponta): fileira r tem 2r+1 lugares.
		const g = index + 1;
		const row = Math.floor(Math.sqrt(g));
		const column = g - row * row - row;
		const stagger = shape.shape == "staggered" && row % 2 ? 0.5 : 0;
		localX = (column + stagger) * shape.spacing;
		localY = -row * shape.spacing * (shape.shape == "staggered" ? 0.8 : 1);
	}
	else
	{
		const row = Math.floor(index / shape.columns);
		const inRow = Math.min(shape.columns, memberCount - row * shape.columns);
		const column = index % shape.columns - (inRow - 1) / 2;
		// Fileiras desencontradas (meia posição) parecem mais naturais.
		const stagger = row % 2 ? 0.25 : 0;
		localX = (column + stagger) * shape.spacing;
		localY = -(row + 1) * shape.spacing;
		// Crescente: as pontas avançam (asa de grou).
		if (shape.shape == "crescent")
		{
			const half = Math.max(1, (shape.columns - 1) / 2);
			localY += Math.pow(Math.abs(column) / half, 2) * shape.spacing * 3;
		}
	}

	// Frente = (sin a, cos a); direita = (cos a, -sin a).
	const sin = Math.sin(angle);
	const cos = Math.cos(angle);
	return {
		"x": leaderPos.x + localX * cos + localY * sin,
		"y": leaderPos.y - localX * sin + localY * cos
	};
};

/** Largura da frente do batalhão (m), para espalhar grupos em linha. */
BattalionLeader.prototype.GetFrontWidth = function()
{
	const shape = this.GetFormationShape(this.members.length);
	return Math.max(1, shape.columns) * shape.spacing;
};

/** Profundidade do batalhão (m). */
BattalionLeader.prototype.GetDepth = function()
{
	const shape = this.GetFormationShape(this.members.length);
	return (Math.ceil(this.members.length / shape.columns) + 1) * shape.spacing;
};

BattalionLeader.prototype.IsInCombat = function(cmpUnitAI)
{
	if (!cmpUnitAI || !cmpUnitAI.order)
		return false;
	const type = cmpUnitAI.order.type;
	return type == "Attack" || type == "WalkAndFight" || type == "Patrol" || type == "Flee";
};

BattalionLeader.prototype.IsAlreadyWalkingTo = function(cmpUnitAI, target)
{
	const order = cmpUnitAI.order;
	if (!order || order.type != "Walk" || !order.data || cmpUnitAI.orderQueue.length > 1)
		return false;
	const dx = order.data.x - target.x;
	const dz = order.data.z - target.y;
	return dx * dx + dz * dz < this.REORDER_TOLERANCE * this.REORDER_TOLERANCE;
};

/**
 * Direção da formação: enquanto o líder anda, para onde ele vai; parado,
 * a última direção (ou a escolhida pelo jogador ao mover em linha).
 */
BattalionLeader.prototype.UpdateFacing = function(cmpPosition)
{
	const cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	const cmpUnitMotion = Engine.QueryInterface(this.entity, IID_UnitMotion);
	if (this.facing === undefined || cmpUnitMotion && cmpUnitMotion.IsMoveRequested() || cmpUnitAI && this.IsInCombat(cmpUnitAI))
		this.facing = cmpPosition.GetRotation().y;
	return this.facing;
};

/** Direção final pedida por um comando de movimento em linha. */
BattalionLeader.prototype.SetFacing = function(angle)
{
	this.facing = angle;
};

BattalionLeader.prototype.UpdateBattalion = function()
{
	this.SpawnDeferredMembers();
	this.CleanupMembers();

	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return;

	Engine.QueryInterface(this.entity, IID_BattalionTactics)?.Update(this.UPDATE_INTERVAL / 1000);

	this.Engage();
	this.UpdateDaggers(cmpPosition.GetPosition2D());

	const leaderPos = cmpPosition.GetPosition2D();
	const angle = this.UpdateFacing(cmpPosition);
	const charging = !!Engine.QueryInterface(this.entity, IID_BattalionTactics)?.IsRunningIn();
	Engine.QueryInterface(this.entity, IID_UnitMotion)?.SetSpeedMultiplier(charging ?
		Engine.QueryInterface(this.entity, IID_UnitMotion).GetRunMultiplier() : 1);
	const count = this.members.length;
	let index = 0;
	for (const ent of this.members)
	{
		const slotIndex = index++;
		const cmpMemberPosition = Engine.QueryInterface(ent, IID_Position);
		const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		const cmpUnitMotion = Engine.QueryInterface(ent, IID_UnitMotion);
		if (!cmpMemberPosition || !cmpMemberPosition.IsInWorld() || !cmpUnitAI)
			continue;

		// Combate é do próprio soldado; a formação espera ele terminar.
		// Na carga, todos vêm correndo.
		if (this.IsInCombat(cmpUnitAI))
		{
			cmpUnitMotion?.SetSpeedMultiplier(charging ? cmpUnitMotion.GetRunMultiplier() : 1);
			continue;
		}

		const target = this.GetSlotPosition(leaderPos, angle, slotIndex, count);
		const distance = cmpMemberPosition.GetPosition2D().distanceTo(new Vector2D(target.x, target.y));
		if (cmpUnitMotion)
			cmpUnitMotion.SetSpeedMultiplier(distance > this.CATCH_UP_DISTANCE ? cmpUnitMotion.GetRunMultiplier() : 1);

		if (distance < 0.5)
		{
			if (cmpUnitAI.IsIdle())
				cmpMemberPosition.TurnTo(angle);
			continue;
		}
		if (this.IsAlreadyWalkingTo(cmpUnitAI, target))
			continue;
		cmpUnitAI.Walk(target.x, target.y, false, false);
	}

	// Acompanhantes no fundo (curandeiros curam quando parados).
	this.attachments.forEach((attachment, k) => {
		const cmpAttachmentPosition = Engine.QueryInterface(attachment.ent, IID_Position);
		const cmpAttachmentAI = Engine.QueryInterface(attachment.ent, IID_UnitAI);
		if (!cmpAttachmentPosition || !cmpAttachmentPosition.IsInWorld() || !cmpAttachmentAI)
			return;
		const order = cmpAttachmentAI.order && cmpAttachmentAI.order.type;
		if (order == "Heal" || order == "Flee")
			return;
		const target = this.GetAttachmentSlot(leaderPos, angle, k, count);
		const distance = cmpAttachmentPosition.GetPosition2D().distanceTo(new Vector2D(target.x, target.y));
		const cmpAttachmentMotion = Engine.QueryInterface(attachment.ent, IID_UnitMotion);
		cmpAttachmentMotion?.SetSpeedMultiplier(distance > this.CATCH_UP_DISTANCE ? cmpAttachmentMotion.GetRunMultiplier() : 1);
		if (distance > 1.5 && !this.IsAlreadyWalkingTo(cmpAttachmentAI, target))
			cmpAttachmentAI.Walk(target.x, target.y, false, false);
	});
};

// ------------------------------------------------ combate

/** Alvo de ataque atual de uma UnitAI, se for um ataque. */
BattalionLeader.prototype.GetAttackTarget = function(cmpUnitAI)
{
	const order = cmpUnitAI && cmpUnitAI.order;
	if (!order || order.type != "Attack" || !order.data || order.data.target === undefined)
		return INVALID_ENTITY;
	const cmpHealth = Engine.QueryInterface(order.data.target, IID_Health);
	return cmpHealth && cmpHealth.GetHitpoints() > 0 ? order.data.target : INVALID_ENTITY;
};

/**
 * O batalhão luta junto: quando o líder ou um soldado está atacando, quem
 * estiver parado ou andando em formação ataca o mesmo batalhão inimigo,
 * cada um o soldado inimigo mais próximo ainda pouco visado. Batalhões em
 * fuga não se engajam, nem em postura passiva.
 */
BattalionLeader.prototype.Engage = function()
{
	const cmpTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	if (cmpTactics && cmpTactics.IsRouting())
		return;
	const cmpLeaderAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (!cmpLeaderAI || cmpLeaderAI.GetStanceName() == "passive")
		return;
	// Ordem de andar (do jogador, recuo): ninguém volta para a luta.
	if (cmpLeaderAI.order && cmpLeaderAI.order.type == "Walk")
		return;

	let target = this.GetAttackTarget(cmpLeaderAI);
	if (target == INVALID_ENTITY)
		for (const ent of this.members)
		{
			target = this.GetAttackTarget(Engine.QueryInterface(ent, IID_UnitAI));
			if (target != INVALID_ENTITY)
				break;
		}
	if (target == INVALID_ENTITY)
		return;

	// Líder parado enquanto os soldados lutam: entra também.
	if (cmpLeaderAI.IsIdle() && cmpLeaderAI.CanAttack(target))
		cmpLeaderAI.Attack(target, false, false, false);

	// Carga: batalhão com carga indo contra outro batalhão a uma distância
	// boa para ganhar velocidade.
	const targetLeader = GetBattalionLeaderEntity(target);
	if (cmpTactics && targetLeader != INVALID_ENTITY && cmpTactics.CanCharge())
	{
		const myPos = Engine.QueryInterface(this.entity, IID_Position)?.GetPosition2D();
		const targetPos = Engine.QueryInterface(targetLeader, IID_Position)?.GetPosition2D();
		const distance = myPos && targetPos ? myPos.distanceTo(targetPos) : 0;
		if (distance >= cmpTactics.CHARGE_MIN_DISTANCE && distance <= cmpTactics.CHARGE_MAX_DISTANCE)
			cmpTactics.StartCharge(targetLeader);
	}

	const targets = GetBattalionEntitiesOf(target).filter(ent => {
		const cmpHealth = Engine.QueryInterface(ent, IID_Health);
		return cmpHealth && cmpHealth.GetHitpoints() > 0 && Engine.QueryInterface(ent, IID_Position)?.IsInWorld();
	});
	if (!targets.length)
		return;

	const load = new Map(targets.map(ent => [ent, 0]));
	for (const ent of this.members)
	{
		const current = this.GetAttackTarget(Engine.QueryInterface(ent, IID_UnitAI));
		if (load.has(current))
			load.set(current, load.get(current) + 1);
	}
	const positions = new Map(targets.map(ent => [ent, Engine.QueryInterface(ent, IID_Position).GetPosition2D()]));
	for (const ent of this.members)
	{
		const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		if (!cmpUnitAI || !cmpPosition || !cmpPosition.IsInWorld() || this.IsInCombat(cmpUnitAI))
			continue;
		const pos = cmpPosition.GetPosition2D();
		let best = INVALID_ENTITY;
		let bestScore = Infinity;
		for (const candidate of targets)
		{
			// Cada soldado já visando o alvo vale 6 m a mais de distância.
			const score = pos.distanceTo(positions.get(candidate)) + 6 * load.get(candidate);
			if (score < bestScore && cmpUnitAI.CanAttack(candidate))
			{
				bestScore = score;
				best = candidate;
			}
		}
		if (best == INVALID_ENTITY)
			continue;
		load.set(best, load.get(best) + 1);
		cmpUnitAI.Attack(best, false, false, false);
	}
};

/** Distância (m) em que o atirador saca a faca, e em que volta ao arco. */
BattalionLeader.prototype.DAGGER_DRAW_RANGE = 5;
BattalionLeader.prototype.DAGGER_SHEATHE_RANGE = 10;

/**
 * Atiradores a pé com inimigo colado lutam de faca (ZZ_TWDagger.js); sem
 * ninguém por perto, voltam a atirar. Quem saca a faca ataca o inimigo
 * mais próximo na hora (a escolha do ataque é refeita na ordem nova).
 */
BattalionLeader.prototype.UpdateDaggers = function(leaderPos)
{
	const cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);
	if (!cmpIdentity || !cmpIdentity.HasClass("TWDagger"))
		return;
	const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
	const cmpDiplomacy = owner > 0 && QueryPlayerIDInterface(owner, IID_Diplomacy);
	if (!cmpDiplomacy)
		return;
	const enemies = cmpDiplomacy.GetEnemies();
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const alive = ent => (Engine.QueryInterface(ent, IID_Health)?.GetHitpoints() || 0) > 0;

	// Ninguém perto do batalhão inteiro: só guarda as facas que estiverem fora.
	const near = cmpRangeManager.ExecuteQueryAroundPos(leaderPos, 0, this.GetDepth() + this.GetFrontWidth() / 2 + this.DAGGER_SHEATHE_RANGE,
		enemies, IID_UnitAI, false).filter(alive);

	for (const ent of this.GetBattalionEntities())
	{
		const cmpAttack = Engine.QueryInterface(ent, IID_Attack);
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		if (!cmpAttack || !cmpAttack.SetDaggerMode || !cmpPosition || !cmpPosition.IsInWorld())
			continue;
		const pos = cmpPosition.GetPosition2D();
		let nearest = INVALID_ENTITY;
		let best = Infinity;
		for (const enemy of near)
		{
			const enemyPos = Engine.QueryInterface(enemy, IID_Position)?.GetPosition2D();
			const distance = enemyPos ? pos.distanceTo(enemyPos) : Infinity;
			if (distance < best)
			{
				best = distance;
				nearest = enemy;
			}
		}
		const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		if (!cmpAttack.IsDaggerMode() && best < this.DAGGER_DRAW_RANGE)
		{
			cmpAttack.SetDaggerMode(true);
			if (cmpUnitAI && nearest != INVALID_ENTITY)
				cmpUnitAI.Attack(nearest, false, false, false);
		}
		else if (cmpAttack.IsDaggerMode() && best > this.DAGGER_SHEATHE_RANGE)
		{
			cmpAttack.SetDaggerMode(false);
			// A ordem de faca não vale mais: volta a escolher alvo (atirando).
			if (cmpUnitAI && cmpUnitAI.order && cmpUnitAI.order.data && cmpUnitAI.order.data.attackType == "Slaughter")
				cmpUnitAI.Stop(false);
		}
	}
};

/**
 * O batalhão saiu do campo de batalha (fugiu pela borda do mapa): some
 * sem deixar corpos e avisa a batalha, que devolve parte dos soldados ao
 * exército na campanha.
 */
BattalionLeader.prototype.Escape = function()
{
	const strength = this.GetStrength();
	const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
	this.escapedAttachments = this.GetAttachmentKinds();
	this.escaped = true;
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	if (cmpTrigger && typeof cmpTrigger.TWBattalionEscaped == "function")
		cmpTrigger.TWBattalionEscaped(this.entity, this.campaignId, strength, owner);
	for (const ent of this.members.concat(this.attachments.map(a => a.ent)))
		Engine.DestroyEntity(ent);
	this.members = [];
	this.attachments = [];
	Engine.DestroyEntity(this.entity);
};

/** Para todos os soldados (fuga, ordem de parar, recuo). */
BattalionLeader.prototype.StopAll = function()
{
	for (const ent of this.GetBattalionEntities())
		Engine.QueryInterface(ent, IID_UnitAI)?.Stop(false);
};

// ------------------------------------------------ soldados

BattalionLeader.prototype.CleanupMembers = function()
{
	const alive = ent => {
		const cmpHealth = Engine.QueryInterface(ent, IID_Health);
		return cmpHealth && cmpHealth.GetHitpoints() > 0;
	};
	this.members = this.members.filter(alive);
	this.attachments = (this.attachments || []).filter(a => alive(a.ent));
};

/** Líder, soldados e acompanhantes (seleção, ordens de andar, modificadores). */
BattalionLeader.prototype.GetBattalionEntities = function()
{
	return [this.entity].concat(this.members, (this.attachments || []).map(a => a.ent));
};

/** Soldados vivos, contando o líder. */
BattalionLeader.prototype.GetStrength = function()
{
	this.CleanupMembers();
	const cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
	return this.members.length + (cmpHealth && cmpHealth.GetHitpoints() > 0 ? 1 : 0);
};

BattalionLeader.prototype.GetMaxStrength = function()
{
	return this.size;
};

/**
 * Experiência ganha por um soldado (abate, cura...). O batalhão aprende
 * junto: o ganho é dividido pelo tamanho (XP_SHARE soldiers "inteiros").
 */
BattalionLeader.prototype.XP_SHARE = 4;

BattalionLeader.prototype.AddExperience = function(amount)
{
	this.currentXp += +amount * this.XP_SHARE / Math.max(1, this.size);
	Engine.PostMessage(this.entity, MT_ExperienceChanged, {});
};

BattalionLeader.prototype.GetCurrentXp = function()
{
	return this.currentXp;
};

BattalionLeader.prototype.GetRequiredXp = function()
{
	return this.requiredXp;
};

/**
 * Líder morto: o soldado com mais vida assume. Cria um líder novo no lugar
 * dele, com os mesmos soldados, experiência, id da campanha e táticas.
 */
BattalionLeader.prototype.OnDestroy = function()
{
	if (this.escaped)
		return;
	this.CleanupMembers();
	if (!this.members.length)
	{
		// Sem soldados, os acompanhantes deixam o campo.
		for (const attachment of this.attachments)
			Engine.DestroyEntity(attachment.ent);
		this.ReportDestroyed();
		return;
	}

	const healthOf = ent => Engine.QueryInterface(ent, IID_Health)?.GetHitpoints() || 0;
	const successor = this.members.slice().sort((a, b) => healthOf(b) - healthOf(a))[0];
	const cmpSuccessorPosition = Engine.QueryInterface(successor, IID_Position);
	const cmpSuccessorOwnership = Engine.QueryInterface(successor, IID_Ownership);
	if (!cmpSuccessorPosition || !cmpSuccessorPosition.IsInWorld() || !cmpSuccessorOwnership)
		return;

	const leaderTemplate = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager).GetCurrentTemplateName(this.entity);
	const newLeader = Engine.AddEntity(leaderTemplate);
	const cmpNewLeader = newLeader != INVALID_ENTITY && Engine.QueryInterface(newLeader, IID_BattalionLeader);
	if (!cmpNewLeader)
		return;

	cmpNewLeader.spawned = true;
	cmpNewLeader.currentXp = this.currentXp;
	cmpNewLeader.campaignId = this.campaignId;
	cmpNewLeader.facing = this.facing;
	cmpNewLeader.members = this.members.filter(ent => ent != successor);
	cmpNewLeader.attachments = this.attachments;

	const pos = cmpSuccessorPosition.GetPosition2D();
	const cmpNewPosition = Engine.QueryInterface(newLeader, IID_Position);
	cmpNewPosition.JumpTo(pos.x, pos.y);
	cmpNewPosition.SetYRotation(cmpSuccessorPosition.GetRotation().y);
	Engine.QueryInterface(newLeader, IID_Ownership).SetOwner(cmpSuccessorOwnership.GetOwner());

	// O soldado promovido não pode se curar com a troca.
	const cmpOldHealth = Engine.QueryInterface(successor, IID_Health);
	const cmpNewHealth = Engine.QueryInterface(newLeader, IID_Health);
	if (cmpOldHealth && cmpNewHealth && cmpOldHealth.GetMaxHitpoints() > 0)
		cmpNewHealth.SetHitpoints(cmpNewHealth.GetMaxHitpoints() * cmpOldHealth.GetHitpoints() / cmpOldHealth.GetMaxHitpoints());

	for (const ent of cmpNewLeader.members.concat(cmpNewLeader.attachments.map(a => a.ent)))
		Engine.QueryInterface(ent, IID_BattalionMember)?.SetLeader(newLeader);

	// O novo líder continua a ordem atual do antigo (ataque, movimento...).
	const cmpOldUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	const cmpNewUnitAI = Engine.QueryInterface(newLeader, IID_UnitAI);
	if (cmpOldUnitAI && cmpNewUnitAI && cmpOldUnitAI.order && cmpOldUnitAI.order.type == "Walk")
		cmpNewUnitAI.Walk(cmpOldUnitAI.order.data.x, cmpOldUnitAI.order.data.z, false, false);
	const cmpOldStance = cmpOldUnitAI && cmpOldUnitAI.GetStanceName();
	if (cmpOldStance && cmpNewUnitAI)
		cmpNewUnitAI.SwitchToStance(cmpOldStance);

	const cmpOldTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	const cmpNewTactics = Engine.QueryInterface(newLeader, IID_BattalionTactics);
	if (cmpOldTactics && cmpNewTactics)
		cmpNewTactics.InheritFrom(cmpOldTactics, this.entity);

	// Seleções e grupos de controle passam para o novo líder.
	Engine.PostMessage(this.entity, MT_EntityRenamed, { "entity": this.entity, "newentity": newLeader });

	Engine.DestroyEntity(successor);
};

/** Batalhão aniquilado: avisa a batalha (para o relatório de baixas). */
BattalionLeader.prototype.ReportDestroyed = function()
{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	if (cmpTrigger && typeof cmpTrigger.TWBattalionDestroyed == "function")
		cmpTrigger.TWBattalionDestroyed(this.entity, this.campaignId);
};

BattalionLeader.prototype.GetStatus = function()
{
	return {
		"leader": this.entity,
		"members": this.GetBattalionEntities(),
		"strength": this.GetStrength(),
		"maxStrength": this.size,
		"category": this.category,
		"campaignId": this.campaignId,
		"attachments": this.GetAttachmentKinds(),
		"xp": Math.round(this.currentXp),
		"requiredXp": this.requiredXp
	};
};

Engine.RegisterComponentType(IID_BattalionLeader, "BattalionLeader", BattalionLeader);
