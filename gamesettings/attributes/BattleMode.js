/**
 * Battle Mode: exércitos escolhidos na tela do modo batalha.
 * Vai para InitAttributes.settings.BattleMode e é lido pelo trigger
 * maps/scripts/BattleMode.js, que cria as unidades no começo da partida.
 *
 * Formato: { "armies": { "<playerID>": [{ "template": "...", "count": n }] } }
 */
GameSettings.prototype.Attributes.BattleMode = class BattleMode extends GameSetting
{
	init()
	{
		this.value = undefined;
	}

	toInitAttributes(attribs)
	{
		if (this.value)
			attribs.settings.BattleMode = this.value;
	}

	fromInitAttributes(attribs)
	{
		this.value = this.getLegacySetting(attribs, "BattleMode");
	}

	setValue(value)
	{
		this.value = value;
	}
};
