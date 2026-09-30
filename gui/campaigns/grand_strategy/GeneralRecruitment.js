function recruitGeneral()
{
    const tribe = g_GameData.currentTribe;

    if (g_GameData.recruitGeneral(tribe))
        Engine.PlayUISound("audio/interface/alarm/alarm_upgradearmory.xml");
}