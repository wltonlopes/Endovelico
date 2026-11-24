/**
 * Comandos com batalhões (Total Warfield), por cima do Commands.js do jogo
 * (sem substituí-lo):
 *
 * - Soldados nos comandos viram o líder do batalhão (um comando por
 *   batalhão). Batalhões não entram nas formações do 0AD.
 * - Andar com vários batalhões: eles se espalham em linha, lado a lado,
 *   na ordem em que estão, virados para a direção do movimento (como num
 *   jogo Total War). Andar tira os soldados da luta (desengajar).
 * - Atacar: o batalhão inteiro ataca o batalhão inimigo, cada soldado um
 *   alvo (BattalionLeader.Engage).
 * - Parar e apagar valem para o batalhão inteiro; postura (stance) vale
 *   para o líder, que decide quando o batalhão luta.
 * - "battalion-posture": formação do batalhão (BattalionTactics).
 */

/** Espaço entre batalhões vizinhos numa linha (m). */
const TW_LINE_GAP = 4;

// Cada helper tem escopo próprio: só g_Commands (registrado como global) é
// compartilhado. Por isso cada comando abaixo separa os batalhões antes de
// chamar o original, que nunca os recebe (nem os põe em formações).

/** Separa líderes de batalhão das demais entidades (já sem soldados). */
function TWSplitBattalions(ents)
{
	const leaders = [];
	const others = [];
	for (const ent of CollapseBattalionEntities(ents || []))
		(Engine.QueryInterface(ent, IID_BattalionLeader) ? leaders : others).push(ent);
	return { "leaders": leaders, "others": others };
}

/** Soldados param o que fazem (saem da luta) e voltam à formação. */
function TWDisengage(leader)
{
	const cmpLeader = Engine.QueryInterface(leader, IID_BattalionLeader);
	if (!cmpLeader)
		return;
	for (const ent of cmpLeader.members)
	{
		const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		if (cmpUnitAI && cmpLeader.IsInCombat(cmpUnitAI))
			cmpUnitAI.Stop(false);
	}
}

/**
 * Destinos de batalhões andando juntos para (x, z): uma linha centrada no
 * ponto, perpendicular ao movimento, na ordem lateral atual.
 * @return {Object[]} [{ "ent", "x", "z", "angle" }]
 */
function TWLinePositions(leaders, x, z, facingAngle)
{
	const positions = leaders.map(ent => Engine.QueryInterface(ent, IID_Position)).filter(cmp => cmp && cmp.IsInWorld());
	if (!positions.length)
		return [];
	const valid = leaders.filter(ent => Engine.QueryInterface(ent, IID_Position)?.IsInWorld());
	const center = positions.reduce((sum, cmp) => sum.add(cmp.GetPosition2D()), new Vector2D(0, 0)).div(positions.length);

	let angle = facingAngle;
	if (angle === undefined)
	{
		const dx = x - center.x;
		const dz = z - center.y;
		angle = Math.abs(dx) + Math.abs(dz) > 1 ? Math.atan2(dx, dz) :
			Engine.QueryInterface(valid[0], IID_Position).GetRotation().y;
	}
	const right = new Vector2D(Math.cos(angle), -Math.sin(angle));

	const entries = valid.map(ent => ({
		"ent": ent,
		"side": Engine.QueryInterface(ent, IID_Position).GetPosition2D().dot(right),
		"width": Engine.QueryInterface(ent, IID_BattalionLeader).GetFrontWidth()
	})).sort((a, b) => a.side - b.side);

	const total = entries.reduce((sum, e) => sum + e.width, 0) + TW_LINE_GAP * (entries.length - 1);
	let offset = -total / 2;
	return entries.map(e => {
		const middle = offset + e.width / 2;
		offset += e.width + TW_LINE_GAP;
		return { "ent": e.ent, "x": x + right.x * middle, "z": z + right.y * middle, "angle": angle };
	});
}

/**
 * Linha arrastada com vários batalhões: do primeiro ao último ponto, cada
 * batalhão recebe um trecho de largura igual (menos os vãos), com a frente
 * ajustada a esse trecho, virado para o lado em que o grupo avança.
 * @return {Map} líder -> { "x", "z", "angle" }
 */
function TWDraggedLine(entities, targets)
{
	const result = new Map();
	const entries = [];
	entities.forEach((ent, i) => {
		if (Engine.QueryInterface(ent, IID_BattalionLeader) && targets[i] && Engine.QueryInterface(ent, IID_Position)?.IsInWorld())
			entries.push({ "ent": ent, "p": new Vector2D(+targets[i].x, +targets[i].y) });
	});
	if (entries.length < 2)
		return result;
	const start = entries[0].p;
	const end = entries[entries.length - 1].p;
	const along = Vector2D.sub(end, start);
	const length = along.length();
	if (length < 1)
		return result;
	along.div(length);
	// Batalhões ocupam a linha toda: as pontas são as bordas, não os centros.
	const slot = length / (entries.length - 1);
	const total = length + slot;
	const width = Math.max(2, (total - TW_LINE_GAP * (entries.length - 1)) / entries.length);
	const from = Vector2D.sub(start, Vector2D.mult(along, slot / 2));

	const center = entries.reduce((sum, e) => sum.add(Engine.QueryInterface(e.ent, IID_Position).GetPosition2D()), new Vector2D(0, 0)).div(entries.length);
	const middle = Vector2D.add(start, end).div(2);
	let normal = new Vector2D(along.y, -along.x);
	if (Vector2D.sub(middle, center).dot(normal) < 0)
		normal = normal.mult(-1);
	const angle = Math.atan2(normal.x, normal.y);

	entries.forEach((entry, k) => {
		const cmpLeader = Engine.QueryInterface(entry.ent, IID_BattalionLeader);
		cmpLeader.SetFrontageWidth(width);
		const offset = k * (width + TW_LINE_GAP) + width / 2;
		// O líder fica à frente das fileiras: o ponto é o meio da frente.
		const spot = Vector2D.add(from, Vector2D.mult(along, offset));
		result.set(entry.ent, { "x": spot.x, "z": spot.y, "angle": angle });
	});
	return result;
}

{
	const twWalk = g_Commands.walk;
	g_Commands.walk = function(player, cmd, data)
	{
		const split = TWSplitBattalions(data.entities);
		for (const pos of split.leaders.length > 1 ? TWLinePositions(split.leaders, cmd.x, cmd.z, cmd.angle) :
			split.leaders.map(ent => ({ "ent": ent, "x": cmd.x, "z": cmd.z, "angle": cmd.angle })))
		{
			TWDisengage(pos.ent);
			Engine.QueryInterface(pos.ent, IID_UnitAI)?.Walk(pos.x, pos.z, cmd.queued, cmd.pushFront);
			if (pos.angle !== undefined)
				Engine.QueryInterface(pos.ent, IID_BattalionLeader).SetFacing(pos.angle);
		}
		if (split.others.length)
			twWalk(player, cmd, Object.assign({}, data, { "entities": split.others }));
	};

	const twAttackWalk = g_Commands["attack-walk"];
	g_Commands["attack-walk"] = function(player, cmd, data)
	{
		const split = TWSplitBattalions(data.entities);
		for (const pos of split.leaders.length > 1 ? TWLinePositions(split.leaders, cmd.x, cmd.z) :
			split.leaders.map(ent => ({ "ent": ent, "x": cmd.x, "z": cmd.z })))
			Engine.QueryInterface(pos.ent, IID_UnitAI)?.WalkAndFight(pos.x, pos.z, cmd.targetClasses, cmd.allowCapture, cmd.queued, cmd.pushFront);
		if (split.others.length)
			twAttackWalk(player, cmd, Object.assign({}, data, { "entities": split.others }));
	};

	const twAttack = g_Commands.attack;
	g_Commands.attack = function(player, cmd, data)
	{
		const split = TWSplitBattalions(data.entities);
		for (const ent of split.leaders)
		{
			const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
			if (!cmpUnitAI)
				continue;
			// Atacar com o batalhão parado (fora da fuga): todos entram.
			cmpUnitAI.Attack(cmd.target, cmd.allowCapture, cmd.queued, cmd.pushFront);
			if (!cmd.queued)
				Engine.QueryInterface(ent, IID_BattalionLeader).Engage();
		}
		if (split.others.length)
			twAttack(player, cmd, Object.assign({}, data, { "entities": split.others }));
	};

	const twStop = g_Commands.stop;
	g_Commands.stop = function(player, cmd, data)
	{
		const split = TWSplitBattalions(data.entities);
		for (const ent of split.leaders)
			Engine.QueryInterface(ent, IID_BattalionLeader).StopAll();
		if (split.others.length)
			twStop(player, cmd, Object.assign({}, data, { "entities": split.others }));
	};

	const twDelete = g_Commands["delete-entities"];
	g_Commands["delete-entities"] = function(player, cmd, data)
	{
		// Soldados primeiro: assim o líder não passa o comando adiante.
		const all = ExpandBattalionEntities(data.entities).reverse();
		twDelete(player, cmd, Object.assign({}, data, { "entities": all }));
	};

	const twFormation = g_Commands.formation;
	g_Commands.formation = function(player, cmd, data)
	{
		const split = TWSplitBattalions(data.entities);
		if (split.others.length)
			twFormation(player, cmd, Object.assign({}, data, { "entities": split.others }));
	};

	// Comandos que não fazem sentido para batalhões em campo.
	for (const type of ["gather", "gather-near-position", "repair", "construct", "construct-wall",
		"garrison", "occupy-turret", "returnresource", "back-to-work", "guard", "heal", "collect-treasure",
		"collect-treasure-near-position", "patrol", "walk-to-range", "walk-custom", "attack-walk-custom", "attack-group"])
	{
		const original = g_Commands[type];
		if (!original)
			continue;
		g_Commands[type] = function(player, cmd, data)
		{
			const split = TWSplitBattalions(data.entities);
			if (type == "walk-custom" || type == "attack-walk-custom")
			{
				// Arrastar linha (como no Total War): os batalhões cobrem a
				// linha inteira, lado a lado; o comprimento da linha decide a
				// largura de cada frente (e o número de fileiras).
				const targets = cmd.targetPositions || [];
				const line = TWDraggedLine(data.entities || [], targets);
				(data.entities || []).forEach((ent, i) => {
					if (!Engine.QueryInterface(ent, IID_BattalionLeader) || !targets[i])
						return;
					const spot = line.get(ent) || { "x": targets[i].x, "z": targets[i].y };
					const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
					if (type == "walk-custom")
					{
						TWDisengage(ent);
						cmpUnitAI?.Walk(spot.x, spot.z, cmd.queued, cmd.pushFront);
					}
					else
						cmpUnitAI?.WalkAndFight(spot.x, spot.z, cmd.targetClasses, cmd.allowCapture, cmd.queued, cmd.pushFront);
					if (spot.angle !== undefined)
						Engine.QueryInterface(ent, IID_BattalionLeader).SetFacing(spot.angle);
				});
				const others = (data.entities || []).filter(ent => !Engine.QueryInterface(ent, IID_BattalionLeader));
				if (others.length)
					original(player, Object.assign({}, cmd, {
						"targetPositions": (data.entities || []).map((ent, i) => targets[i]).filter((t, i) => !Engine.QueryInterface(data.entities[i], IID_BattalionLeader))
					}), Object.assign({}, data, { "entities": others }));
				return;
			}
			if (type == "attack-group")
			{
				// Vários alvos: cada batalhão ataca o mais próximo.
				for (const ent of split.leaders)
				{
					const pos = Engine.QueryInterface(ent, IID_Position)?.GetPosition2D();
					const target = pos && (cmd.targets || []).map(t => ({ "t": t, "p": Engine.QueryInterface(t, IID_Position) }))
						.filter(e => e.p && e.p.IsInWorld())
						.sort((a, b) => a.p.GetPosition2D().distanceToSquared(pos) - b.p.GetPosition2D().distanceToSquared(pos))[0];
					if (target)
					{
						Engine.QueryInterface(ent, IID_UnitAI)?.Attack(target.t, cmd.allowCapture, cmd.queued, cmd.pushFront);
						Engine.QueryInterface(ent, IID_BattalionLeader).Engage();
					}
				}
			}
			if (type == "patrol" || type == "walk-to-range")
				for (const ent of split.leaders)
					Engine.QueryInterface(ent, IID_UnitAI)?.Walk(cmd.x, cmd.z, cmd.queued, cmd.pushFront);
			if (split.others.length)
				original(player, cmd, Object.assign({}, data, { "entities": split.others }));
		};
	}

	// Fim da batalha de campo: encerrar ou perseguir (TWFieldBattle.js).
	g_Commands["tw-battle-choice"] = function(player, cmd, data)
	{
		const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
		if (cmpTrigger && typeof cmpTrigger.TWBattleChoice == "function")
			cmpTrigger.TWBattleChoice(player, cmd.choice, cmd.conquest);
	};

	g_Commands["battalion-posture"] = function(player, cmd, data)
	{
		for (const ent of TWSplitBattalions(data.entities).leaders)
			Engine.QueryInterface(ent, IID_BattalionTactics)?.SetPosture(cmd.posture);
	};

	// Opções do batalhão: guard, skirmish, fireAtWill, fireArrows, cycleCharge.
	g_Commands["battalion-option"] = function(player, cmd, data)
	{
		for (const ent of TWSplitBattalions(data.entities).leaders)
			Engine.QueryInterface(ent, IID_BattalionTactics)?.SetOption(cmd.option, !!cmd.value);
	};

	// Habilidades: warCry (batalhões com TWWarCry), rally e inspire (general).
	g_Commands["battalion-ability"] = function(player, cmd, data)
	{
		const split = TWSplitBattalions(data.entities);
		if (cmd.ability == "warCry")
			for (const ent of split.leaders)
				Engine.QueryInterface(ent, IID_BattalionTactics)?.WarCry();
		else
			for (const ent of split.others)
				TWUseGeneralAbility(ent, cmd.ability);
	};
}

/**
 * Lados comandados pelo diretor da batalha (maps/scripts/TWFieldBattle.js):
 * a IA do jogo (Petra) continua rodando para eles, mas sem base ela dá
 * ordens sem sentido (andar até o canto do mapa...). Os comandos desses
 * jogadores só valem quando vêm do diretor. O estado fica no componente
 * Trigger (twAI, twDirectorActive): globais registradas não aceitam mudança.
 */
{
	const allowed = new Set(["aichat", "resign", "diplomacy", "tribute", "dialog-answer"]);
	for (const type in g_Commands)
	{
		if (allowed.has(type))
			continue;
		const handler = g_Commands[type];
		g_Commands[type] = function(player, cmd, data)
		{
			const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
			if (cmpTrigger && cmpTrigger.twAI && !cmpTrigger.twDirectorActive && cmpTrigger.twAI.indexOf(player) != -1)
				return;
			return handler(player, cmd, data);
		};
	}
}
