/**
 * Order in which the tabs should show up.
 */
var g_OrderTabNames = [
	"mod_endovelico",
	"special",
	"programming",
	"art",
	"audio",
	"maps",
	"history",
	"balancing",
	"community",
	"translators",
	"donators"
];

/**
 * Array of Objects containg all relevant data per tab.
 */
var g_PanelData = [];

/**
 * Vertical size of a tab button.
 */
var g_TabButtonHeight = 34;

/**
 * Vertical space between two tab buttons.
 */
var g_TabButtonDist = 5;

function init()
{
	// Load credits list from the disk and parse them
	for (const category of g_OrderTabNames)
	{
		const json = Engine.ReadJSONFile("gui/credits/texts/" + category + ".json");
		if (!json || !json.Content)
		{
			if (category == "translators")
				warn("Translators credits are not present, pull translations from the nightly build to get them.");
			else
				error("Could not load credits for " + category + "!");
			continue;
		}
		translateObjectKeys(json, ["Title", "Subtitle", "LangName"]);
		g_PanelData.push({
			"label": json.Title || category,
			"content": parseHelper(json.Content)
		});
	}

	placeTabButtons(
		g_PanelData,
		false,
		g_TabButtonHeight,
		g_TabButtonDist,
		selectPanel,
		category => {
			Engine.GetGUIObjectByName("creditsText").caption = g_PanelData[category].content;
		});

	return new Promise(closePageCallback => {
		Engine.GetGUIObjectByName("closeButton").onPress = closePageCallback;
	});
}

// Run through a "Content" list and parse elements for formatting and translation
function parseHelper(list)
{
	let result = "";

	for (const object of list)
	{
		if (object.LangName)
			result += setStringTags(object.LangName + "\n", { "font": "sans-bold-stroke-14" });

		if (object.Title)
			result += setStringTags(object.Title + "\n", { "font": "sans-bold-stroke-14" });

		if (object.Subtitle)
			result += setStringTags(object.Subtitle + "\n", { "font": "sans-bold-14" });

		if (object.List)
		{
			for (const element of object.List)
			{
				let credit;
				if (element.nick && element.name)
					credit = sprintf(translate("%(nick)s — %(name)s"), { "nick": element.nick, "name": element.name });
				else if (element.nick)
					credit = element.nick;
				else if (element.name)
					credit = element.name;

				if (credit)
					result += setStringTags(credit + "\n", { "font": "sans-14" });
			}

			result += "\n";
		}

		if (object.Content)
			result += "\n" + parseHelper(object.Content) + "\n";
	}

	return result;
}
