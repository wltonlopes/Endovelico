/**
 * Cartões de unidade (Total Warfield): um botão por batalhão do jogador
 * (gui/session/session_objects/tw_unit_cards.xml), atualizado a cada passo
 * da simulação. Clique seleciona o batalhão, Shift+clique soma à seleção,
 * duplo clique leva a câmera até ele. No jogo de um jogador só, o botão do
 * canto liga a câmera lenta (meia velocidade).
 */
var g_TWCardsCount = 22;
var g_TWCardsLastClick = { "ent": undefined, "time": 0 };
var g_TWSlowMotion = false;
var g_TWMoraleSprites = { "steady": "color: 70 140 235 255", "shaken": "color: 230 200 90 255", "broken": "color: 150 150 150 255" };

function TWSetBar(name, fraction)
{
	const bar = Engine.GetGUIObjectByName(name);
	// Barras de 1 a 39 px dentro do cartão.
	const size = bar.size;
	size.right = 1 + 38 * Math.max(0, Math.min(1, fraction));
	bar.size = size;
}

function TWCardTooltip(card)
{
	let text = setStringTags(card.name, { "font": "sans-bold-14" }) + "\n" +
		sprintf(translate("Soldiers: %(alive)s / %(max)s"), { "alive": card.strength, "max": card.maxStrength }) + "\n" +
		sprintf(translate("Morale: %(morale)s%%"), { "morale": card.morale }) + "\n" +
		sprintf(translate("Vigor: %(vigor)s%%"), { "vigor": card.vigor });
	if (card.ammo !== undefined)
		text += "\n" + sprintf(translate("Ammunition: %(ammo)s%%"), { "ammo": Math.round(100 * card.ammo) });
	if (card.routing)
		text += "\n" + coloredText(translate("Routing!"), "230 100 90");
	else if (card.engaged)
		text += "\n" + coloredText(translate("Engaged in melee."), "255 150 110");
	return text + "\n" + translate("Click to select, Shift+click to add, double-click to focus.");
}

function TWCardClick(ent)
{
	const now = Date.now();
	if (Engine.HotkeyIsPressed("selection.add"))
		g_Selection.addList([ent]);
	else
	{
		const double = g_TWCardsLastClick.ent == ent && now - g_TWCardsLastClick.time < 400;
		g_Selection.reset();
		g_Selection.addList([ent]);
		const state = double && GetEntityState(ent);
		if (state && state.position)
			Engine.CameraMoveTo(state.position.x, state.position.z);
	}
	g_TWCardsLastClick = { "ent": ent, "time": now };
}

function TWToggleSlowMotion()
{
	g_TWSlowMotion = !g_TWSlowMotion;
	Engine.SetSimRate(g_TWSlowMotion ? 0.5 : 1);
}

function TWUpdateUnitCards()
{
	const panel = Engine.GetGUIObjectByName("twUnitCards");
	if (!panel)
		return;
	const cards = g_ViewedPlayer > 0 ? Engine.GuiInterfaceCall("TWGetBattalionCards", g_ViewedPlayer) || [] : [];
	panel.hidden = !cards.length;
	if (!cards.length)
		return;

	const selected = new Set(g_Selection.toList());
	for (let i = 0; i < g_TWCardsCount; ++i)
	{
		const button = Engine.GetGUIObjectByName("twCard[" + i + "]");
		const card = cards[i];
		button.hidden = !card;
		if (!card)
			continue;
		const size = button.size;
		size.left = i * 42;
		size.right = i * 42 + 40;
		button.size = size;
		Engine.GetGUIObjectByName("twCardIcon[" + i + "]").sprite = "stretched:" + (card.routing ? "grayscale:" : "") + "session/portraits/" + card.icon;
		Engine.GetGUIObjectByName("twCardStrength[" + i + "]").caption = card.strength;
		Engine.GetGUIObjectByName("twCardSelected[" + i + "]").hidden = !selected.has(card.ent);
		Engine.GetGUIObjectByName("twCardEngaged[" + i + "]").hidden = !card.engaged || card.routing;
		Engine.GetGUIObjectByName("twCardMorale[" + i + "]").sprite = g_TWMoraleSprites[card.moraleState] || g_TWMoraleSprites.steady;
		TWSetBar("twCardMorale[" + i + "]", card.morale / 100);
		TWSetBar("twCardVigor[" + i + "]", card.vigor / 100);
		Engine.GetGUIObjectByName("twCardAmmoBg[" + i + "]").hidden = card.ammo === undefined;
		Engine.GetGUIObjectByName("twCardAmmo[" + i + "]").hidden = card.ammo === undefined;
		if (card.ammo !== undefined)
			TWSetBar("twCardAmmo[" + i + "]", card.ammo);
		button.tooltip = TWCardTooltip(card);
		const ent = card.ent;
		button.onPress = () => TWCardClick(ent);
	}

	// Câmera lenta: só sem rede (no multijogador a velocidade é da partida).
	const slow = Engine.GetGUIObjectByName("twSlowMotion");
	slow.hidden = g_IsNetworked;
	if (!g_IsNetworked)
	{
		Engine.GetGUIObjectByName("twSlowMotionLabel").caption = g_TWSlowMotion ? "1×" : "½×";
		slow.tooltip = g_TWSlowMotion ? translate("Back to normal speed.") :
			translate("Slow motion: half speed, to give orders calmly. You can also pause and give orders before resuming.");
		slow.onPress = TWToggleSlowMotion;
	}
}

registerSimulationUpdateHandler(TWUpdateUnitCards);
