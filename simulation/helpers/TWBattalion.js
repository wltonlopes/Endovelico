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

Engine.RegisterGlobal("GetBattalionLeaderEntity", GetBattalionLeaderEntity);
Engine.RegisterGlobal("GetBattalionEntitiesOf", GetBattalionEntitiesOf);
Engine.RegisterGlobal("CollapseBattalionEntities", CollapseBattalionEntities);
Engine.RegisterGlobal("ExpandBattalionEntities", ExpandBattalionEntities);
