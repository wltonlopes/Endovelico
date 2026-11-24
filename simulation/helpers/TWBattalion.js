/**
 * Funções de batalhão usadas por componentes, comandos e pela batalha.
 */

/** Líder do batalhão de `ent` (ele mesmo, se for o líder), ou INVALID_ENTITY. */
function GetBattalionLeaderEntity(ent)
{
	if (Engine.QueryInterface(ent, IID_BattalionLeader))
		return ent;
	const cmpMember = Engine.QueryInterface(ent, IID_BattalionMember);
	if (!cmpMember)
		return INVALID_ENTITY;
	const leader = cmpMember.GetLeader();
	return leader != INVALID_ENTITY && Engine.QueryInterface(leader, IID_BattalionLeader) ? leader : INVALID_ENTITY;
}

/** Todas as entidades do batalhão de `ent` (ou só `ent`, se não for de batalhão). */
function GetBattalionEntitiesOf(ent)
{
	const leader = GetBattalionLeaderEntity(ent);
	if (leader == INVALID_ENTITY)
		return [ent];
	return Engine.QueryInterface(leader, IID_BattalionLeader).GetBattalionEntities();
}

/** Troca soldados pelos líderes, sem repetir. */
function CollapseBattalionEntities(ents)
{
	const result = [];
	const seen = new Set();
	for (const ent of ents)
	{
		const leader = GetBattalionLeaderEntity(ent);
		const commandEnt = leader != INVALID_ENTITY ? leader : ent;
		if (seen.has(commandEnt))
			continue;
		seen.add(commandEnt);
		result.push(commandEnt);
	}
	return result;
}

/** Líderes e soldados de todos os batalhões em `ents`, sem repetir. */
function ExpandBattalionEntities(ents)
{
	const result = [];
	const seen = new Set();
	for (const ent of ents)
		for (const member of GetBattalionEntitiesOf(ent))
			if (!seen.has(member))
			{
				seen.add(member);
				result.push(member);
			}
	return result;
}

/**
 * Habilidades do general (herói de um exército de batalhões), com recarga:
 *  - rally: batalhões em fuga por perto se reagrupam (se ainda podem) e os
 *    outros recuperam moral;
 *  - inspire: batalhões por perto perdem menos moral e batem mais forte.
 * Os tempos ficam no componente Trigger (twAbilityReady), que é salvo.
 */
var TW_GENERAL_ABILITIES = {
	"rally": { "radius": 60, "cooldown": 75000, "morale": 25 },
	"inspire": { "radius": 60, "cooldown": 90000, "duration": 25000 }
};

/** Herói com batalhões do mesmo dono no campo. */
function TWIsGeneral(ent)
{
	const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
	if (!cmpIdentity || !cmpIdentity.HasClass("Hero") || Engine.QueryInterface(ent, IID_BattalionLeader))
		return false;
	const owner = Engine.QueryInterface(ent, IID_Ownership)?.GetOwner();
	if (!(owner > 0))
		return false;
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).GetEntitiesByPlayer(owner)
		.some(other => !!Engine.QueryInterface(other, IID_BattalionLeader));
}

/** Segundos até a habilidade ficar pronta (0 = pronta). */
function TWGeneralAbilityCooldown(ent, ability)
{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	const ready = cmpTrigger && cmpTrigger.twAbilityReady && cmpTrigger.twAbilityReady[ent] && cmpTrigger.twAbilityReady[ent][ability] || 0;
	return Math.max(0, Math.ceil((ready - Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime()) / 1000));
}

function TWUseGeneralAbility(ent, ability)
{
	const info = TW_GENERAL_ABILITIES[ability];
	if (!info || !TWIsGeneral(ent) || TWGeneralAbilityCooldown(ent, ability) > 0)
		return false;
	const pos = Engine.QueryInterface(ent, IID_Position);
	const owner = Engine.QueryInterface(ent, IID_Ownership)?.GetOwner();
	if (!pos || !pos.IsInWorld() || !(owner > 0))
		return false;
	const leaders = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).ExecuteQueryAroundPos(
		pos.GetPosition2D(), 0, info.radius, [owner], IID_BattalionTactics, false);
	for (const leader of leaders)
	{
		const cmpTactics = Engine.QueryInterface(leader, IID_BattalionTactics);
		if (ability == "rally")
			cmpTactics.Rallied(info.morale);
		else if (ability == "inspire")
			cmpTactics.Inspire(info.duration);
	}
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	if (!cmpTrigger.twAbilityReady)
		cmpTrigger.twAbilityReady = {};
	if (!cmpTrigger.twAbilityReady[ent])
		cmpTrigger.twAbilityReady[ent] = {};
	cmpTrigger.twAbilityReady[ent][ability] = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetTime() + info.cooldown;
	PlaySound("order_attack", ent);
	return true;
}

Engine.RegisterGlobal("TWIsGeneral", TWIsGeneral);
Engine.RegisterGlobal("TWGeneralAbilityCooldown", TWGeneralAbilityCooldown);
Engine.RegisterGlobal("TWUseGeneralAbility", TWUseGeneralAbility);
Engine.RegisterGlobal("GetBattalionLeaderEntity", GetBattalionLeaderEntity);
Engine.RegisterGlobal("GetBattalionEntitiesOf", GetBattalionEntitiesOf);
Engine.RegisterGlobal("CollapseBattalionEntities", CollapseBattalionEntities);
Engine.RegisterGlobal("ExpandBattalionEntities", ExpandBattalionEntities);
