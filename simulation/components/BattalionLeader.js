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
/**
 * Luta em formação: soldado das fileiras da frente só ataca inimigo a até
 * REACH m dele (atirador: alcance da arma); em combate, quem se afasta mais
 * que LEASH m do seu lugar volta para a formação (não persegue sozinho).
 */
BattalionLeader.prototype.MELEE_REACH = 12;
BattalionLeader.prototype.GUARD_REACH = 5;
BattalionLeader.prototype.MELEE_LEASH = 18;
BattalionLeader.prototype.GUARD_LEASH = 6;
BattalionLeader.prototype.CAVALRY_LEASH = 35;
/** Largura mínima da frente (soldados) ao formar por linha arrastada. */
BattalionLeader.prototype.MIN_FRONTAGE = 2;

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
	// Soldados por fileira escolhidos pelo jogador (linha arrastada).
	this.frontage = undefined;
	this.pendingFacing = undefined;
	this.nextSkirmish = 0;

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
	// Suprimentos da campanha: exército longe de casa chega cansado.
	const cmpTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	if (cmpTactics && data.vigor !== undefined && data.vigor !== null)
		cmpTactics.vigor = Math.max(0, Math.min(100, +data.vigor));
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
	// Quem pode se esconder (bosque, emboscada): visibilidade por script desde já (ZZ_TWStealth.js).
	if (Engine.QueryInterface(this.entity, IID_BattalionTactics)?.CanHide())
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

/**
 * Tipos de acompanhante ainda vivos. Só lê (a interface também chama):
 * quem arruma a formação é o tick do batalhão (CleanupMembers).
 */
BattalionLeader.prototype.GetAttachmentKinds = function()
{
	return (this.attachments || []).filter(a => this.IsAlive(a.ent)).map(a => a.kind);
};

BattalionLeader.prototype.IsAlive = function(ent)
{
	const cmpHealth = Engine.QueryInterface(ent, IID_Health);
	return !!cmpHealth && cmpHealth.GetHitpoints() > 0;
};

// ------------------------------------------------ formação

/**
 * Colunas e espaçamento atuais (a postura do batalhão pode mudar).
 */
BattalionLeader.prototype.GetFormationShape = function(memberCount, frontage = this.frontage)
{
	const cmpTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	const override = cmpTactics ? cmpTactics.GetFormationOverride(memberCount) : { "columns": null, "spacingScale": 1 };
	return {
		"columns": Math.max(1, Math.min(memberCount, override.columns || frontage || this.columns)),
		"spacing": this.spacing * (override.spacingScale || 1),
		"shape": override.shape
	};
};

/**
 * Posição do soldado `index` (0 = primeiro da primeira fileira). As
 * fileiras ficam atrás do líder, centradas, viradas para `angle`.
 */
BattalionLeader.prototype.GetSlotPosition = function(leaderPos, angle, index, memberCount, frontage = this.frontage)
{
	const shape = this.GetFormationShape(memberCount, frontage);
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

/** Soldados por fileira pedidos para uma frente de `width` m (linha arrastada). */
BattalionLeader.prototype.SetFrontageWidth = function(width)
{
	this.frontage = this.FrontageForWidth(width);
};

/** Soldados por fileira para uma frente de `width` m, sem mudar nada. */
BattalionLeader.prototype.FrontageForWidth = function(width)
{
	const count = Math.max(1, this.members.length);
	const columns = Math.round(width / this.spacing);
	return Math.max(Math.min(this.MIN_FRONTAGE, count), Math.min(count, columns));
};

/**
 * Prévia (só leitura): onde o batalhão ficaria com o líder em (x, z),
 * virado para `angle`, com uma frente de `width` m (ou a atual).
 * @return {Object} { "leader": {x, y}, "slots": [{x, y}], "angle" }
 */
BattalionLeader.prototype.PreviewSlots = function(x, z, angle, width)
{
	const count = this.members.length;
	const frontage = width ? this.FrontageForWidth(width) : this.frontage;
	const leaderPos = new Vector2D(x, z);
	const slots = [];
	for (let i = 0; i < count; ++i)
		slots.push(this.GetSlotPosition(leaderPos, angle, i, count, frontage));
	return { "leader": { "x": x, "y": z }, "slots": slots, "angle": angle };
};

/**
 * Fase de desdobramento: o batalhão vai direto ao lugar (sem andar), já em
 * formação, virado para `angle`; `width` (m) muda a frente.
 */
BattalionLeader.prototype.Teleport = function(x, z, angle, width)
{
	if (width)
		this.SetFrontageWidth(width);
	const count = this.members.length;
	const leaderPos = new Vector2D(x, z);
	const place = (ent, pos) => {
		Engine.QueryInterface(ent, IID_UnitAI)?.Stop(false);
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		if (!cmpPosition || !cmpPosition.IsInWorld())
			return;
		cmpPosition.JumpTo(pos.x, pos.y);
		cmpPosition.SetYRotation(angle);
	};
	place(this.entity, leaderPos);
	this.members.forEach((ent, i) => place(ent, this.GetSlotPosition(leaderPos, angle, i, count)));
	this.attachments.forEach((attachment, k) => place(attachment.ent, this.GetAttachmentSlot(leaderPos, angle, k, count)));
	this.facing = angle;
	this.pendingFacing = undefined;
};

/** Fileira (0 = a da frente) do soldado no lugar `slotIndex`. */
BattalionLeader.prototype.GetRank = function(slotIndex, memberCount)
{
	const shape = this.GetFormationShape(memberCount);
	if (shape.shape == "wedge" || shape.shape == "staggered")
		return Math.floor(Math.sqrt(slotIndex + 1)) - 1;
	return Math.floor(slotIndex / shape.columns);
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
	const moving = cmpUnitMotion && cmpUnitMotion.IsMoveRequested();
	const fighting = cmpUnitAI && this.IsInCombat(cmpUnitAI);
	if (this.facing === undefined || moving || fighting)
		this.facing = cmpPosition.GetRotation().y;
	// Chegou: vira para a direção pedida (linha arrastada, escaramuça).
	if (!moving && !fighting && this.pendingFacing !== undefined)
	{
		this.facing = this.pendingFacing;
		this.pendingFacing = undefined;
		cmpPosition.TurnTo(this.facing);
	}
	else if (fighting)
		this.pendingFacing = undefined;
	return this.facing;
};

/** Direção final pedida por um comando de movimento em linha (vale ao chegar). */
BattalionLeader.prototype.SetFacing = function(angle)
{
	this.pendingFacing = angle;
	const cmpUnitMotion = Engine.QueryInterface(this.entity, IID_UnitMotion);
	if (!cmpUnitMotion || !cmpUnitMotion.IsMoveRequested())
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
	this.UpdateSkirmish(cmpPosition.GetPosition2D());

	const leaderPos = cmpPosition.GetPosition2D();
	const angle = this.UpdateFacing(cmpPosition);
	const cmpTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	const charging = !!cmpTactics?.IsRunningIn();
	const leash = this.GetLeash(cmpTactics);
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

		const target = this.GetSlotPosition(leaderPos, angle, slotIndex, count);

		// Combate é do próprio soldado; a formação espera ele terminar.
		// Na carga, todos vêm correndo. Quem se afasta demais do seu lugar
		// (perseguindo alguém) larga o alvo e volta para a formação.
		if (this.IsInCombat(cmpUnitAI))
		{
			cmpUnitMotion?.SetSpeedMultiplier(charging ? cmpUnitMotion.GetRunMultiplier() : 1);
			const away = cmpMemberPosition.GetPosition2D().distanceTo(new Vector2D(target.x, target.y));
			if (!charging && cmpUnitAI.order.type == "Attack" && away > leash && !this.IsRangedAttack(cmpUnitAI))
				cmpUnitAI.Stop(false);
			continue;
		}

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

BattalionLeader.prototype.IsRangedAttack = function(cmpUnitAI)
{
	return !!cmpUnitAI && !!cmpUnitAI.order && !!cmpUnitAI.order.data && cmpUnitAI.order.data.attackType == "Ranged";
};

/** Até onde um soldado em combate pode se afastar do seu lugar (m). */
BattalionLeader.prototype.GetLeash = function(cmpTactics)
{
	if (cmpTactics && cmpTactics.options.guard)
		return this.GUARD_LEASH;
	const cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);
	if (cmpIdentity && (cmpIdentity.HasClass("Cavalry") || cmpIdentity.HasClass("Elephant")))
		return this.CAVALRY_LEASH;
	return this.MELEE_LEASH;
};

/**
 * Escaramuça (atiradores com munição): inimigo corpo a corpo chegando perto
 * faz o batalhão recuar, para continuar atirando de longe.
 */
BattalionLeader.prototype.UpdateSkirmish = function(pos)
{
	const cmpTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	if (!cmpTactics || !cmpTactics.options.skirmish || !cmpTactics.HasAmmo() || cmpTactics.IsRouting() || cmpTactics.IsEngaged())
		return;
	const time = cmpTactics.GetTime();
	if (time < this.nextSkirmish)
		return;
	const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
	const cmpDiplomacy = owner > 0 && QueryPlayerIDInterface(owner, IID_Diplomacy);
	if (!cmpDiplomacy)
		return;
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const radius = cmpTactics.SKIRMISH_RANGE + this.GetDepth() + this.GetFrontWidth() / 2;
	const away = new Vector2D(0, 0);
	let threats = 0;
	for (const ent of cmpRangeManager.ExecuteQueryAroundPos(pos, 0, radius, cmpDiplomacy.GetEnemies().filter(p => p > 0), IID_UnitAI, false))
	{
		const leader = GetBattalionLeaderEntity(ent);
		if (leader == INVALID_ENTITY)
			continue;
		const cmpOther = Engine.QueryInterface(leader, IID_BattalionTactics);
		// Só foge de quem vem para o corpo a corpo: não está fugindo nem
		// já preso lutando com outro batalhão.
		if (!cmpOther || cmpOther.IsRouting() || cmpOther.IsRangedBattalion() || cmpOther.IsEngaged())
			continue;
		const enemyPos = Engine.QueryInterface(ent, IID_Position)?.GetPosition2D();
		if (!enemyPos)
			continue;
		const d = Vector2D.sub(pos, enemyPos);
		if (d.length() > 0.01)
		{
			away.add(d.normalize());
			++threats;
		}
	}
	if (!threats || away.length() < 0.01)
		return;
	this.nextSkirmish = time + cmpTactics.SKIRMISH_INTERVAL;
	away.normalize();
	const mapSize = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain).GetMapSize();
	const x = Math.max(4, Math.min(mapSize - 4, pos.x + away.x * cmpTactics.SKIRMISH_STEP));
	const z = Math.max(4, Math.min(mapSize - 4, pos.y + away.y * cmpTactics.SKIRMISH_STEP));
	for (const ent of this.members)
	{
		const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		if (cmpUnitAI && this.IsInCombat(cmpUnitAI))
			cmpUnitAI.Stop(false);
	}
	Engine.QueryInterface(this.entity, IID_UnitAI)?.Walk(x, z, false, false);
	// Ao parar, vira de novo para o inimigo.
	this.SetFacing(Math.atan2(-away.x, -away.y));
};

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
 * O batalhão luta junto e em formação (como no Total War): quando o líder
 * ou um soldado está atacando, o batalhão vai contra o mesmo batalhão
 * inimigo, mas só os soldados das fileiras da frente (BattalionTactics.
 * GetFightingRanks) entram no corpo a corpo, cada um contra o inimigo mais
 * próximo ao seu alcance ainda pouco visado. Os de trás esperam no lugar
 * (lutam só com quem chegar neles) e sobem quando alguém da frente cai.
 * Batalhões em fuga não se engajam; em guarda, ninguém sai do lugar; sem
 * fogo à vontade (passivo), só com ordem de ataque do jogador.
 */
BattalionLeader.prototype.Engage = function()
{
	const cmpTactics = Engine.QueryInterface(this.entity, IID_BattalionTactics);
	if (cmpTactics && cmpTactics.IsRouting())
		return;
	const cmpLeaderAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (!cmpLeaderAI)
		return;
	const ordered = this.GetAttackTarget(cmpLeaderAI) != INVALID_ENTITY;
	if (cmpLeaderAI.GetStanceName() == "passive" && !ordered)
		return;
	// Ordem de andar (do jogador, recuo): ninguém volta para a luta.
	if (cmpLeaderAI.order && cmpLeaderAI.order.type == "Walk")
		return;
	const guard = !!cmpTactics && cmpTactics.options.guard;

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

	// Líder parado enquanto os soldados lutam: entra também (puxando a
	// formação). Em guarda ele segura a posição.
	if (!guard && cmpLeaderAI.IsIdle() && cmpLeaderAI.CanAttack(target))
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
	const ranks = cmpTactics ? cmpTactics.GetFightingRanks() : Infinity;
	const charging = !!cmpTactics && cmpTactics.IsRunningIn();
	const count = this.members.length;
	this.members.forEach((ent, slotIndex) => {
		const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		const cmpPosition = Engine.QueryInterface(ent, IID_Position);
		if (!cmpUnitAI || !cmpPosition || !cmpPosition.IsInWorld() || this.IsInCombat(cmpUnitAI))
			return;
		// Fileiras de trás esperam (na carga, todos vêm juntos).
		if (!charging && this.GetRank(slotIndex, count) >= ranks)
			return;
		const pos = cmpPosition.GetPosition2D();
		const cmpAttack = Engine.QueryInterface(ent, IID_Attack);
		const ranged = !!cmpAttack && cmpAttack.GetAttackTypes().indexOf("Ranged") != -1;
		const reach = ranged ? (cmpAttack.GetRange("Ranged")?.max || 30) + 2 :
			guard ? this.GUARD_REACH : charging ? Infinity : this.MELEE_REACH;
		let best = INVALID_ENTITY;
		let bestScore = Infinity;
		for (const candidate of targets)
		{
			const distance = pos.distanceTo(positions.get(candidate));
			if (distance > reach)
				continue;
			// Cada soldado já visando o alvo vale 6 m a mais de distância.
			const score = distance + 6 * load.get(candidate);
			if (score < bestScore && cmpUnitAI.CanAttack(candidate))
			{
				bestScore = score;
				best = candidate;
			}
		}
		if (best == INVALID_ENTITY)
			return;
		load.set(best, load.get(best) + 1);
		cmpUnitAI.Attack(best, false, false, false);
	});
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
		// Sem munição a faca fica na mão.
		else if (cmpAttack.IsDaggerMode() && best > this.DAGGER_SHEATHE_RANGE &&
			(Engine.QueryInterface(this.entity, IID_BattalionTactics)?.HasAmmo() ?? true))
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

/**
 * Tira os mortos. O lugar de quem caiu é ocupado pelo soldado da última
 * fileira (a frente se refaz com quem está atrás, como no Total War), sem
 * embaralhar o resto da formação.
 */
BattalionLeader.prototype.CleanupMembers = function()
{
	const alive = ent => {
		const cmpHealth = Engine.QueryInterface(ent, IID_Health);
		return cmpHealth && cmpHealth.GetHitpoints() > 0;
	};
	const members = this.members.slice();
	for (let i = 0; i < members.length; ++i)
	{
		if (alive(members[i]))
			continue;
		while (members.length - 1 > i && !alive(members[members.length - 1]))
			members.pop();
		if (members.length - 1 > i)
			members[i] = members.pop();
		else
			members.length = i;
	}
	this.members = members;
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
	return this.members.filter(ent => this.IsAlive(ent)).length + (this.IsAlive(this.entity) ? 1 : 0);
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
	cmpNewLeader.frontage = this.frontage;
	cmpNewLeader.pendingFacing = this.pendingFacing;
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
