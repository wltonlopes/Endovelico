class GrandStrategyPage
{
	constructor(initData, closePageCallback)
	{
		this.closePageCallback = closePageCallback;

		try
		{
			const filename =
				initData?.filename ||
				CampaignRun.getCurrentRunFilename();

			const run = new CampaignRun(filename).load();

			// Campanha nova (ainda sem dados): abre a tela de escolha da civ.
			if (!run.data.gameData)
			{
				closePageCallback({
					[Engine.openRequest]:
					{
						page: "campaigns/grand_strategy/init/page.xml"
					}
				});
				return;
			}

			this.menu = new CampaignMenu(
				run,
				closePageCallback
			);

			this.menu.initialise();
		}
		catch (err)
		{
			error("Grand Strategy: " + err.message + "\n" + err.stack);

			closePageCallback({
				[Engine.openRequest]:
				{
					page: "page_pregame.xml"
				}
			});
		}
	}
}
