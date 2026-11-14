/**
 * Evento do registro: uma tecnologia foi concluída pelo jogador.
 */
class GSTechResearched extends GSEvent
{
	constructor(data)
	{
		super("techResearched");
		this.data = data;
	}

	getTickerText()
	{
		const tech = getTechData().byId[this.data?.tech];
		return tech ? sprintf("Technology researched: %s", tech.name) : undefined;
	}
}
