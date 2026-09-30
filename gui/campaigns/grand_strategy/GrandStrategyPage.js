class GrandStrategyPage
{
    constructor(initData, closePageCallback)
    {
        warn("INIT DATA:");
        warn(uneval(initData));
		this.closePageCallback = closePageCallback;

		try
		{
            let filename =
                initData?.filename ||
                CampaignRun.getCurrentRunFilename();

            let run = new CampaignRun(filename).load();

            warn("RUN LOADED");

            warn("run exists = " + (run !== undefined));

            warn("run.data keys = " + Object.keys(run.data).join(","));

            if ("gameData" in run.data)
                warn("gameData exists");
            else
                warn("gameData missing");

			if (!run.data.gameData)
			{
                warn("ABRINDO INIT");
				closePageCallback({
					[Engine.openRequest]:
					{
						page: "campaigns/grand_strategy/init/page.xml"
					}
				});
				return;
			}

			// this.menu =
			// 	new CampaignMenu(
			// 		run,
			// 		closePageCallback
			// 	);

			// this.menu.initialise();
            warn("CampaignMenu = " + typeof CampaignMenu);

            this.menu = new CampaignMenu(
                run,
                closePageCallback
            );

            warn("Menu criado");

            this.menu.initialise();

            warn("Inicializado");
		}
		catch (err)
		{
			error("ERR = " + uneval(err));
            error("NAME = " + err.name);
            error("MSG = " + err.message);
            error("STACK = " + err.stack);
			error(err.stack);

			closePageCallback({
				[Engine.openRequest]:
				{
					page: "page_pregame.xml"
				}
			});
		}
	}
}