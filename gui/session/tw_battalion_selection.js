/**
 * Batalhão como um objeto só na interface (Total Warfield).
 *
 * O líder é quem fica na seleção; clicar, arrastar caixa ou usar grupos de
 * controle num soldado seleciona o líder. O destaque de seleção e as barras
 * de status valem para todos os soldados do batalhão.
 */
function TWGetBattalionPanelEntity(entity)
{
	const state = GetEntityState(entity);
	return state?.battalion?.leader || entity;
}

function TWNormalizeBattalionEntities(entities)
{
	const result = [];
	const seen = new Set();
	for (const entity of entities)
	{
		const leader = TWGetBattalionPanelEntity(entity);
		if (!seen.has(leader))
		{
			seen.add(leader);
			result.push(leader);
		}
	}
	return result;
}

function TWExpandBattalionEntities(entities)
{
	const result = [];
	const seen = new Set();
	for (const entity of entities)
		for (const member of GetEntityState(entity)?.battalion?.members || [entity])
			if (!seen.has(member))
			{
				seen.add(member);
				result.push(member);
			}
	return result;
}

{
	const twSetHighlight = _setHighlight;
	_setHighlight = function(entities, alpha, selected)
	{
		twSetHighlight(TWExpandBattalionEntities(entities), alpha, selected);
	};

	const twSetStatusBars = _setStatusBars;
	_setStatusBars = function(entities, enabled)
	{
		twSetStatusBars(TWExpandBattalionEntities(entities), enabled);
	};

	const twAddList = EntitySelection.prototype.addList;
	EntitySelection.prototype.addList = function(entities, quiet, force, addFormationMembers)
	{
		return twAddList.call(this, TWNormalizeBattalionEntities(entities), quiet, force, addFormationMembers);
	};

	const twRemoveList = EntitySelection.prototype.removeList;
	EntitySelection.prototype.removeList = function(entities, addFormationMembers)
	{
		return twRemoveList.call(this, TWNormalizeBattalionEntities(entities), addFormationMembers);
	};

	const twSetHighlightList = EntitySelection.prototype.setHighlightList;
	EntitySelection.prototype.setHighlightList = function(entities)
	{
		return twSetHighlightList.call(this, TWNormalizeBattalionEntities(entities));
	};

	const twSelectAndMoveTo = EntitySelection.prototype.selectAndMoveTo;
	EntitySelection.prototype.selectAndMoveTo = function(entity)
	{
		return twSelectAndMoveTo.call(this, TWGetBattalionPanelEntity(entity));
	};
}
