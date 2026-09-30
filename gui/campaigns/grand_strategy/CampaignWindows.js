class CampaignWindows
{
    constructor(menu)
    {
        this.Context = new ContextMenu(menu);
        this.Province = new ProvinceDetailsWindow(menu);
        this.Tribe = new TribeDetailsWindow(menu);
        this.Hero = new HeroDetailsWindow(menu);
        this.Diplomacy = typeof DiplomacyWindow !== "undefined" ? new DiplomacyWindow(menu) : null;
        this.Event = typeof EventWindow !== "undefined" ? new EventWindow(menu) : null;
        this.GameOver = typeof GameOverWindow !== "undefined" ? new GameOverWindow(menu) : null;
    }

    render()
    {
        if (this.Hero?.render)
            this.Hero.render();

        if (this.Province?.render)
            this.Province.render();
        else if (this.Province?.display)
            this.Province.display();

        if (this.Tribe?.render)
            this.Tribe.render();
        else if (this.Tribe?.display)
            this.Tribe.display();
    }
}