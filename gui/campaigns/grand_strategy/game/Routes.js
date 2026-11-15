/**
 * Marcha de vários turnos e registro de movimentos para o mapa animado.
 *
 * - O jogador escolhe um destino distante; o general anda o que der neste
 *   turno e segue sozinho nos próximos (hero.route), como no Total War.
 * - Cada troca de `hero.location` (jogador, IA, retirada, vitória) entra em
 *   g_TWMapMoves, e cada batalha em g_TWMapEvents. O MapAnimator consome
 *   essas listas para animar a marcha e marcar as batalhas. Não são salvas.
 */
var g_TWMapMoves = [];
var g_TWMapEvents = [];

/** Turnos mostrados no máximo na prévia da rota. */
var TW_ROUTE_MAX_TURNS = 12;

function twNoteMove(hero, from, to)
{
	g_TWMapMoves.push({ "id": hero.id, "tribe": hero.tribe, "from": from, "to": to });
	if (g_TWMapMoves.length > 400)
		g_TWMapMoves.splice(0, g_TWMapMoves.length - 400);
}

function twNoteMapEvent(event)
{
	event.turn = g_GameData?.turn;
	event.time = Date.now();
	g_TWMapEvents.push(event);
	if (g_TWMapEvents.length > 60)
		g_TWMapEvents.splice(0, g_TWMapEvents.length - 60);
}

/**
 * Pode passar de `from` para `to` numa marcha? O destino final pode ter um
 * general inimigo (vira batalha); no meio do caminho, não.
 */
function twRouteCanEnter(hero, from, to, isFinal)
{
	const target = g_GameData.provinces[to];
	if (!target || !target.canTravel(from))
		return false;
	const tribe = g_GameData.tribes[hero.tribe];
	if (!tribe.techs.canNavigate(from, to))
		return false;
	if (!twCanEnterTerritory(hero.tribe, target.ownerTribe))
		return false;
	if (hero.getMoveCost(to) > tribe.techs.getMoveCap())
		return false;
	for (const code in g_GameData.tribes)
		for (const other of g_GameData.tribes[code].generals)
		{
			if (other === hero || other.location != to)
				continue;
			// Dois generais da mesma tribo não dividem a província; o inimigo
			// só no destino (batalha); os demais (de passagem) não atrapalham.
			if (other.tribe == hero.tribe || !isFinal && twAtWar(hero.tribe, other.tribe))
				return false;
		}
	return true;
}

/**
 * Caminho mais barato (em movimentos) até `target`.
 * @return { path: [códigos], turns: [turno de chegada de cada passo, 0 = este],
 *           battle: o último passo é contra um general inimigo } ou null.
 */
function twPlanRoute(hero, target)
{
	if (!hero || !g_GameData.provinces[target] || target == hero.location)
		return null;

	const dist = { [hero.location]: 0 };
	const previous = {};
	const done = new Set();
	const open = [hero.location];
	while (open.length)
	{
		let best = 0;
		for (let i = 1; i < open.length; ++i)
			if (dist[open[i]] < dist[open[best]])
				best = i;
		const code = open.splice(best, 1)[0];
		if (done.has(code))
			continue;
		done.add(code);
		if (code == target)
			break;
		// Só se atravessa províncias livres; a batalha só no destino.
		if (code != hero.location && g_GameData.getHostileGeneralAtProvince(code, hero.tribe))
			continue;
		for (const next of g_GameData.provinces[code].getLinks())
		{
			if (done.has(next) || !twRouteCanEnter(hero, code, next, next == target))
				continue;
			const cost = dist[code] + hero.getMoveCost(next);
			if (dist[next] === undefined || cost < dist[next])
			{
				dist[next] = cost;
				previous[next] = code;
				open.push(next);
			}
		}
	}
	if (dist[target] === undefined)
		return null;

	const path = [];
	for (let code = target; code != hero.location; code = previous[code])
		path.unshift(code);

	const turns = twRouteTurns(hero, path);
	if (!turns)
		return null;
	return {
		"path": path,
		"turns": turns,
		"battle": !!g_GameData.getHostileGeneralAtProvince(target, hero.tribe)
	};
}

/**
 * Turno de chegada de cada passo (0 = este turno), com a regeneração de
 * movimentos; null se não chega em TW_ROUTE_MAX_TURNS.
 */
function twRouteTurns(hero, path)
{
	const techs = g_GameData.tribes[hero.tribe].techs;
	const regen = techs.getMoveRegen();
	const cap = techs.getMoveCap();
	let available = hero.actionsLeft;
	let turn = 0;
	const turns = [];
	for (const code of path)
	{
		const cost = hero.getMoveCost(code);
		while (available < cost)
		{
			if (regen <= 0 || turn >= TW_ROUTE_MAX_TURNS)
				return null;
			++turn;
			available = Math.min(cap, available + regen);
		}
		available -= cost;
		turns.push(turn);
	}
	return turns;
}

/** Dá a ordem de marcha e já anda o que puder neste turno. */
function twOrderMarch(hero, target)
{
	const plan = twPlanRoute(hero, target);
	if (!plan)
		return false;
	hero.route = plan.path.slice();
	twAdvanceRoute(hero);
	return true;
}

/**
 * Anda pela rota enquanto houver movimentos. Para (e esquece a rota) se o
 * caminho fechou: guerra acabou, general inimigo no meio, tecnologia.
 * @return texto do motivo da parada, ou "" se seguiu normalmente.
 */
function twAdvanceRoute(hero)
{
	while (hero.route?.length)
	{
		const next = hero.route[0];
		const isFinal = hero.route.length == 1;
		if (!twRouteCanEnter(hero, hero.location, next, isFinal))
		{
			hero.route = [];
			return "The march was halted: the way to " + (g_GameData.provinces[next]?.getName() || next) + " is closed.";
		}
		if (hero.actionsLeft < hero.getMoveCost(next))
			return "";
		hero.route.shift();
		// No destino com inimigo, doMove abre a batalha.
		if (!hero.doMove(next))
		{
			hero.route = [];
			return "";
		}
		if (hero.location != next)
		{
			hero.route = [];
			return "";
		}
	}
	return "";
}

/** No começo do turno do jogador, os generais com rota seguem marchando. */
function twAdvancePlayerRoutes()
{
	const messages = [];
	for (const hero of g_GameData.tribes[g_GameData.playerTribe]?.generals || [])
		if (hero.route?.length)
		{
			const message = twAdvanceRoute(hero);
			if (message)
				messages.push(message);
		}
	return messages;
}
