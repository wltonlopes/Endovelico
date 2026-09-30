/**
 * Página transitória aberta pela sessão (CampaignSession.onFinish) quando a
 * partida termina. Guarda o resultado na run; o mapa da campanha aplica o
 * resultado (troca de dono da província) ao ser carregado.
 *
 * Precisa devolver uma Promise resolvida: é isso que fecha a página filha.
 * Sem isso ela fica aberta, invisível, por cima da sessão, e ao sair da
 * partida o motor não consegue fechar a sessão e voltar ao mapa.
 */
function init(endGameData)
{
	try
	{
		const run = CampaignRun.getCurrentRun();
		if (run.data.processEndedGame)
			warn("processEndedGame already exists, overwriting with the latest result");
		run.data.processEndedGame = endGameData;
		run.save();
	}
	catch (err)
	{
		error("Grand Strategy endgame: " + err + "\n" + err.stack);
	}

	return Promise.resolve();
}
