class DiplomacyController
{
    constructor(menu, tribeCode)
    {
        this.menu = menu;

        this.game = g_GameData;

        this.player =
            this.game.tribes[
                this.game.playerTribe
            ];

        if (tribeCode === this.game.playerTribe)
        {
            warn("Cannot open diplomacy with ourselves");
            return;
        }

        this.target =
            this.game.tribes[
                tribeCode
            ];

        if (!this.target)
        {
            warn("Cannot open diplomacy: unknown tribe " + tribeCode);
            return;
        }

        this.info =
            this.target.getDiplomacyInfo();

        this.diplomacy =
            this.player.getDiplomacy(
                tribeCode
            );

        this.loadModules();
    }

    loadModules()
    {
        this.refresh();
    }

    refresh()
    {
        if (!this.target)
            return;

        this.diplomacy =
            this.player.getDiplomacy(this.target.code);

        loadNation(this);
        loadRelations(this);
        loadMilitary(this);
        loadTreaties(this);
        loadHistory(this);

        setupButtons(this);
    }
}