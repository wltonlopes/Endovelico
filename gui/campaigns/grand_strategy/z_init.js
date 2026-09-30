var g_GrandStrategyPage;

function init(initData)
{
    return new Promise(closePageCallback =>
    {
        g_GrandStrategyPage =
            new GrandStrategyPage(
                initData,
                closePageCallback
            );
    });
}
