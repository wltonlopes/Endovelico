/**
 * Emblema de uma civilização, como o jogo faz: o ícone do template
 * special/players/<civ>. No Endovelico o arquivo nem sempre se chama
 * emblem_<código>.png (ex.: "aden" usa emblem_adena.png).
 */
var g_CivEmblemCache = {};

function getCivEmblem(civ)
{
	if (g_CivEmblemCache[civ] === undefined)
	{
		let icon = "";
		try
		{
			const template = civ && Engine.TemplateExists("special/players/" + civ) ?
				Engine.GetTemplate("special/players/" + civ) : undefined;
			icon = template?.Identity?.Icon ? "session/portraits/" + template.Identity.Icon : "";
		}
		catch (e)
		{
			icon = "";
		}
		g_CivEmblemCache[civ] = icon;
	}
	return g_CivEmblemCache[civ];
}

/**
 * Versão redonda (com borda) de um retrato de herói, gerada em
 * art/textures/ui/campaigns/grand_strategy/heroes/ com o caminho do retrato
 * original trocando "/" por "_". Sem versão redonda, usa o retrato padrão.
 */
function getRoundHeroPortrait(portrait)
{
	const dir = "campaigns/grand_strategy/heroes/";
	if (!portrait)
		return dir + "default.png";
	if (portrait.startsWith(dir))
		return portrait;
	const round = dir + portrait.replace("session/portraits/", "").replace(/\//g, "_");
	return Engine.TextureExists("art/textures/ui/" + round) ? round : dir + "default.png";
}

/** Sprite do emblema, ou do emblema de gaia em cinza quando não há civ. */
function getCivEmblemSprite(civ)
{
	const emblem = getCivEmblem(civ);
	return emblem ? "stretched:" + emblem : "grayscale:stretched:" + getCivEmblem("gaia");
}
