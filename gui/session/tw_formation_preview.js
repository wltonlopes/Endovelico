/**
 * Prévia do posicionamento (Total Warfield, como no Total War): ao arrastar
 * o botão direito com batalhões selecionados, o terreno mostra onde cada
 * soldado vai ficar (marcadores verdes) e para onde cada batalhão vai olhar
 * (seta amarela). Soltar dá a ordem: os batalhões cobrem o traço, e o
 * comprimento dele decide a largura da frente, também com um batalhão só.
 *
 * O cálculo é o mesmo da ordem (simulation/helpers/ZZ_TWCommands.js,
 * TWPlanDraggedLine); a simulação desenha marcadores locais
 * (ZZ_TWGuiInterface.js, TWSetFormationPreview).
 */
var g_TWPreviewActive = false;
var g_TWPreviewLastKey = "";
var g_TWPreviewLastTime = 0;
/** Intervalo mínimo entre duas atualizações da prévia (ms). */
var g_TWPreviewInterval = 60;

/** Batalhões (líderes) da seleção, ou nada se houver outra coisa selecionada. */
function TWSelectedBattalions()
{
	const selection = g_Selection.toList();
	if (!selection.length)
		return [];
	const states = selection.map(ent => GetEntityState(ent));
	if (states.some(state => !state || !state.battalion || state.battalion.leader != state.id))
		return [];
	return selection.slice().sort((a, b) => a - b);
}

/**
 * Traço atual, entidades ordenadas ao longo dele e um ponto por entidade
 * (o mesmo rateio da interface base); undefined se o traço é curto.
 */
function TWDraggedOrder(inputLine)
{
	const leaders = TWSelectedBattalions();
	if (!leaders.length || inputLine.length < 2)
		return undefined;
	let length = 0;
	for (let i = 1; i < inputLine.length; ++i)
		length += inputLine[i].distanceTo(inputLine[i - 1]);
	if (length < g_FreehandSelection_MinLengthOfLine)
		return undefined;
	const start = inputLine[0];
	const end = inputLine[inputLine.length - 1];
	const sorted = leaders.length > 1 ? sortEntitiesAlongLine(leaders, start, end, true) : leaders;
	const targets = sorted.map((ent, i) => {
		const t = sorted.length > 1 ? i / (sorted.length - 1) : 0;
		return Vector2D.add(start, Vector2D.sub(end, start).mult(t));
	});
	return {
		"entities": sorted,
		"targetPositions": targets.map(p => ({ "x": +p.x.toFixed(2), "y": +p.y.toFixed(2) })),
		"line": { "start": { "x": start.x, "y": start.y }, "end": { "x": end.x, "y": end.y } }
	};
}

function TWClearFormationPreview()
{
	if (!g_TWPreviewActive)
		return;
	g_TWPreviewActive = false;
	g_TWPreviewLastKey = "";
	Engine.GuiInterfaceCall("TWSetFormationPreview", null);
}

{
	const twMouseMove = positionUnitsFreehandSelectionMouseMove;
	positionUnitsFreehandSelectionMouseMove = function(ev)
	{
		const result = twMouseMove(ev);
		const order = TWDraggedOrder(g_FreehandSelection_InputLine);
		if (!order)
		{
			TWClearFormationPreview();
			return result;
		}
		const now = Date.now();
		const key = JSON.stringify(order.line);
		if (key != g_TWPreviewLastKey && now - g_TWPreviewLastTime >= g_TWPreviewInterval)
		{
			g_TWPreviewLastKey = key;
			g_TWPreviewLastTime = now;
			g_TWPreviewActive = true;
			Engine.GuiInterfaceCall("TWSetFormationPreview", order);
		}
		return result;
	};

	const twMouseUp = positionUnitsFreehandSelectionMouseUp;
	positionUnitsFreehandSelectionMouseUp = function(ev)
	{
		TWClearFormationPreview();
		const order = ev.button == SDL_BUTTON_RIGHT ? TWDraggedOrder(g_FreehandSelection_InputLine) : undefined;
		if (!order)
			return twMouseUp(ev);
		// Batalhões: a ordem leva as pontas do traço (twLine), inclusive com um só.
		inputState = INPUT_NORMAL;
		g_FreehandSelection_InputLine = [];
		Engine.PostNetworkCommand({
			"type": isAttackMovePressed() ? "attack-walk-custom" : "walk-custom",
			"entities": order.entities,
			"targetPositions": order.targetPositions,
			"twLine": order.line,
			"targetClasses": Engine.HotkeyIsPressed("session.attackmoveUnit") ? { "attack": ["Unit"] } : { "attack": ["Unit", "Structure"] },
			"queued": Engine.HotkeyIsPressed("session.queue"),
			"pushFront": Engine.HotkeyIsPressed("session.pushorderfront"),
			"formation": NULL_FORMATION
		});
		DrawTargetMarker({ "x": order.line.start.x, "z": order.line.start.y });
		DrawTargetMarker({ "x": order.line.end.x, "z": order.line.end.y });
		Engine.GuiInterfaceCall("PlaySound", { "name": "order_walk", "entity": order.entities[0] });
		return true;
	};

	// Arrasto cancelado (Esc, outro botão...): apaga a prévia.
	const twHandleInputAfterGui = handleInputAfterGui;
	handleInputAfterGui = function(ev)
	{
		const result = twHandleInputAfterGui(ev);
		if (g_TWPreviewActive && inputState != INPUT_UNIT_POSITION)
			TWClearFormationPreview();
		return result;
	};
}
