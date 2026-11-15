/**
 * Total Warfield: batalha de campo montada pela campanha.
 * Vai para InitAttributes.settings.TotalWarfield e é lido pelo mapa
 * maps/random/tw_battlefield.js (terreno) e pelo trigger
 * maps/scripts/TWFieldBattle.js (exércitos, IA, assentamento).
 */
GameSettings.prototype.Attributes.TotalWarfield = class TotalWarfield extends GameSetting
{
	init()
	{
		this.value = undefined;
	}

	toInitAttributes(attribs)
	{
		if (this.value)
			attribs.settings.TotalWarfield = this.value;
	}

	fromInitAttributes(attribs)
	{
		this.value = this.getLegacySetting(attribs, "TotalWarfield");
	}

	setValue(value)
	{
		this.value = value;
	}
};
