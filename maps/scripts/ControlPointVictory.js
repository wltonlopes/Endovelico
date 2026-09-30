/**********************************************************************
 * ControlPointVictory.js
 **********************************************************************/

/**********************************************************************
 * CONSTANTES
 **********************************************************************/

const CONTROL_POINT_REQUIRED_PERCENT = 60;
const CONTROL_POINT_DEFAULT_DURATION = 5 * 60 * 1000;
const CONTROL_POINT_DEFAULT_COUNT = 5;
const CONTROL_POINT_TEMPLATE = "structures/control_point";
const CONTROL_POINT_CLEAR_RADIUS = 5;
const CONTROL_POINT_SPAWN_ATTEMPTS = 300;
const CONTROL_POINT_SEARCH_STEP = 5;


/**********************************************************************
 * INICIALIZAÇÃO
 **********************************************************************/

Trigger.prototype.ResetControlPointData = function()
{
    this.controlPoints = [];
    this.controlPointData = {};
    this.playerControlPointCounts = new Array(TriggerHelper.GetNumberOfPlayers()).fill(0);
    this.totalControlPoints = 0;
    this.controlPointVictoryTimer = undefined;
    this.ownControlPointVictoryMessage = undefined;
    this.othersControlPointVictoryMessage = undefined;
    this.controlPointVictoryCountdownPlayers = [];
};

Trigger.prototype.InitControlPointGame = function()
{
    this.ResetControlPointData();

    this.FindControlPoints();

    const settings =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_EndGameManager
        ).GetGameSettings();

    if (!this.controlPoints.length && settings.mapType !== "skirmish")
        this.SpawnDefaultControlPoints();

    log(
        "Found "
        + this.controlPoints.length +
        " Control Points."
    );

    this.CheckControlPointVictoryCountdown();
};


/**********************************************************************
 * SPAWN
 **********************************************************************/

Trigger.prototype.FindControlPoints = function()
{
    const cmpRangeManager =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_RangeManager
        );

    let entities = [];
    for (let playerID = 0; playerID < TriggerHelper.GetNumberOfPlayers(); ++playerID)
        entities = entities.concat(cmpRangeManager.GetEntitiesByPlayer(playerID));

    for (const ent of entities)
    {
        const cmpControlPoint =
            Engine.QueryInterface(
                ent,
                IID_ControlPoint
            );

        if (!cmpControlPoint)
            continue;

        this.RegisterControlPoint(ent);
    }
};

Trigger.prototype.SpawnDefaultControlPoints = function()
{
    let spawned = 0;

    for (const target of this.GetFairControlPointSpawnTargets())
    {
        if (spawned >= CONTROL_POINT_DEFAULT_COUNT)
            break;

        const pos = this.FindNearestValidControlPointSpawnPosition(target.x, target.z);
        if (!pos)
            continue;

        if (this.SpawnControlPointAtPosition(pos.x, pos.z))
            ++spawned;
    }

    for (let attempt = 0; attempt < CONTROL_POINT_SPAWN_ATTEMPTS && spawned < CONTROL_POINT_DEFAULT_COUNT; ++attempt)
    {
        const pos = this.GetRandomControlPointSpawnPosition();
        if (!pos || !this.IsValidControlPointSpawnPosition(pos.x, pos.z))
            continue;

        if (this.SpawnControlPointAtPosition(pos.x, pos.z))
            ++spawned;
    }

    if (spawned < CONTROL_POINT_DEFAULT_COUNT)
        warn(
            "Only spawned "
            + spawned
            + " clear Control Points out of "
            + CONTROL_POINT_DEFAULT_COUNT
            + "."
        );
};

Trigger.prototype.SpawnControlPointAtPosition = function(x, z)
{
    const ent = Engine.AddEntity(CONTROL_POINT_TEMPLATE);

    const cmpPosition =
        Engine.QueryInterface(
            ent,
            IID_Position
        );

    if (!cmpPosition)
    {
        Engine.DestroyEntity(ent);
        error("Tried to create Control Point without position.");
        return false;
    }

    const cmpOwnership =
        Engine.QueryInterface(
            ent,
            IID_Ownership
        );

    if (cmpOwnership)
        cmpOwnership.SetOwner(0);

    cmpPosition.JumpTo(x, z);
    cmpPosition.SetYRotation(randomAngle());

    this.RegisterControlPoint(ent);
    return true;
};

Trigger.prototype.GetFairControlPointSpawnTargets = function()
{
    const mapSize = TriggerHelper.GetMapSizeTerrain();
    const margin = CONTROL_POINT_CLEAR_RADIUS * 2;
    const playerPositions = this.GetPlayerReferencePositions();
    const center = this.GetControlPointCenter(playerPositions, mapSize);
    const ringCount = Math.max(0, CONTROL_POINT_DEFAULT_COUNT - 1);
    const ringRadius = this.GetControlPointRingRadius(playerPositions, center, mapSize);
    const targets = [this.ClampControlPointPosition(center.x, center.z, margin, mapSize)];

    if (!ringCount)
        return targets;

    const angleOffset = this.GetControlPointAngleOffset(playerPositions, center, ringCount);
    for (let i = 0; i < ringCount; ++i)
    {
        const angle = angleOffset + i * 2 * Math.PI / ringCount;
        targets.push(
            this.ClampControlPointPosition(
                center.x + ringRadius * Math.cos(angle),
                center.z + ringRadius * Math.sin(angle),
                margin,
                mapSize
            )
        );
    }

    return targets;
};

Trigger.prototype.GetPlayerReferencePositions = function()
{
    const activePlayers =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_PlayerManager
        ).GetActivePlayers();

    const positions = [];
    for (const playerID of activePlayers)
    {
        const pos = this.GetPlayerReferencePosition(playerID);
        if (pos)
            positions.push(pos);
    }

    return positions;
};

Trigger.prototype.GetPlayerReferencePosition = function(playerID)
{
    const cmpRangeManager =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_RangeManager
        );

    const fallback = {
        "x": 0,
        "z": 0,
        "count": 0
    };

    for (const ent of cmpRangeManager.GetEntitiesByPlayer(playerID))
    {
        const cmpPosition =
            Engine.QueryInterface(
                ent,
                IID_Position
            );

        if (!cmpPosition || !cmpPosition.IsInWorld())
            continue;

        const pos = cmpPosition.GetPosition();
        const cmpIdentity =
            Engine.QueryInterface(
                ent,
                IID_Identity
            );

        if (cmpIdentity && cmpIdentity.HasClass("CivCentre"))
            return {
                "x": pos.x,
                "z": pos.z
            };

        fallback.x += pos.x;
        fallback.z += pos.z;
        ++fallback.count;
    }

    if (!fallback.count)
        return undefined;

    return {
        "x": fallback.x / fallback.count,
        "z": fallback.z / fallback.count
    };
};

Trigger.prototype.GetControlPointCenter = function(playerPositions, mapSize)
{
    if (!playerPositions.length)
        return {
            "x": mapSize / 2,
            "z": mapSize / 2
        };

    const center = {
        "x": 0,
        "z": 0
    };

    for (const pos of playerPositions)
    {
        center.x += pos.x;
        center.z += pos.z;
    }

    center.x /= playerPositions.length;
    center.z /= playerPositions.length;
    return center;
};

Trigger.prototype.GetControlPointRingRadius = function(playerPositions, center, mapSize)
{
    if (!playerPositions.length)
        return mapSize * 0.18;

    let distance = 0;
    for (const pos of playerPositions)
    {
        const dx = pos.x - center.x;
        const dz = pos.z - center.z;
        distance += Math.sqrt(dx * dx + dz * dz);
    }

    const averageDistance = distance / playerPositions.length;
    return Math.min(
        Math.max(averageDistance * 0.35, CONTROL_POINT_CLEAR_RADIUS * 4),
        mapSize * 0.22
    );
};

Trigger.prototype.GetControlPointAngleOffset = function(playerPositions, center, ringCount)
{
    if (!playerPositions.length || !ringCount)
        return 0;

    let nearestAngle = 0;
    let nearestDistance = Infinity;

    for (const pos of playerPositions)
    {
        const dx = pos.x - center.x;
        const dz = pos.z - center.z;
        const distance = dx * dx + dz * dz;
        if (distance >= nearestDistance)
            continue;

        nearestDistance = distance;
        nearestAngle = Math.atan2(dz, dx);
    }

    return nearestAngle + Math.PI / ringCount;
};

Trigger.prototype.ClampControlPointPosition = function(x, z, margin, mapSize)
{
    return {
        "x": Math.min(Math.max(x, margin), mapSize - margin),
        "z": Math.min(Math.max(z, margin), mapSize - margin)
    };
};

Trigger.prototype.FindNearestValidControlPointSpawnPosition = function(x, z)
{
    const mapSize = TriggerHelper.GetMapSizeTerrain();
    const margin = CONTROL_POINT_CLEAR_RADIUS * 2;
    const maxSearchRadius = Math.max(mapSize * 0.25, CONTROL_POINT_CLEAR_RADIUS * 6);
    const clamped = this.ClampControlPointPosition(x, z, margin, mapSize);

    if (this.IsValidControlPointSpawnPosition(clamped.x, clamped.z))
        return clamped;

    for (let radius = CONTROL_POINT_SEARCH_STEP; radius <= maxSearchRadius; radius += CONTROL_POINT_SEARCH_STEP)
    {
        const samples = Math.max(8, Math.ceil(2 * Math.PI * radius / CONTROL_POINT_SEARCH_STEP));
        for (let i = 0; i < samples; ++i)
        {
            const angle = i * 2 * Math.PI / samples;
            const pos = this.ClampControlPointPosition(
                x + radius * Math.cos(angle),
                z + radius * Math.sin(angle),
                margin,
                mapSize
            );

            if (this.IsValidControlPointSpawnPosition(pos.x, pos.z))
                return pos;
        }
    }

    return undefined;
};

Trigger.prototype.GetRandomControlPointSpawnPosition = function()
{
    const mapSize = TriggerHelper.GetMapSizeTerrain();
    const margin = CONTROL_POINT_CLEAR_RADIUS * 2;

    if (mapSize <= margin * 2)
        return undefined;

    return {
        "x": randFloat(margin, mapSize - margin),
        "z": randFloat(margin, mapSize - margin)
    };
};

Trigger.prototype.IsValidControlPointSpawnPosition = function(x, z)
{
    const cmpTerrain =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_Terrain
        );

    const cmpWaterManager =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_WaterManager
        );

    if (cmpTerrain.GetGroundLevel &&
        cmpWaterManager.GetWaterLevel &&
        cmpTerrain.GetGroundLevel(x, z) <= cmpWaterManager.GetWaterLevel(x, z))
        return false;

    const cmpRangeManager =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_RangeManager
        );

    for (let playerID = 0; playerID < TriggerHelper.GetNumberOfPlayers(); ++playerID)
    {
        for (const ent of cmpRangeManager.GetEntitiesByPlayer(playerID))
        {
            if (!this.IsControlPointBlockingEntity(ent))
                continue;

            const cmpPosition =
                Engine.QueryInterface(
                    ent,
                    IID_Position
                );

            if (!cmpPosition || !cmpPosition.IsInWorld())
                continue;

            const pos = cmpPosition.GetPosition();
            const dx = x - pos.x;
            const dz = z - pos.z;

            if (dx * dx + dz * dz < CONTROL_POINT_CLEAR_RADIUS * CONTROL_POINT_CLEAR_RADIUS)
                return false;
        }
    }

    return true;
};

Trigger.prototype.IsControlPointBlockingEntity = function(ent)
{
    if (Engine.QueryInterface(ent, IID_ResourceSupply))
        return true;

    const cmpIdentity =
        Engine.QueryInterface(
            ent,
            IID_Identity
        );

    return cmpIdentity && cmpIdentity.HasClass("Structure");
};

Trigger.prototype.RegisterControlPoint = function(ent)
{
    const cmpOwnership =
        Engine.QueryInterface(
            ent,
            IID_Ownership
        );

    const cmpControlPoint =
        Engine.QueryInterface(
            ent,
            IID_ControlPoint
        );

    const owner =
        cmpOwnership ?
            cmpOwnership.GetOwner() :
            0;

    this.controlPoints.push(ent);

    this.controlPointData[ent] =
    {
        "owner": owner,
        "weight": cmpControlPoint.GetWeight()
    };

    ++this.totalControlPoints;
    if (owner > 0)
        ++this.playerControlPointCounts[owner];
};


/**********************************************************************
 * EVENTOS
 **********************************************************************/

Trigger.prototype.ControlPointOwnershipChanged =
function(data)
{
    if (!this.controlPointData || !this.controlPointData[data.entity])
        return;

    const oldOwner = this.controlPointData[data.entity].owner;
    if (oldOwner > 0)
        --this.playerControlPointCounts[oldOwner];

    if (data.to > 0)
        ++this.playerControlPointCounts[data.to];

    this.controlPointData[data.entity].owner = data.to;

    log(
        "Player "
        + data.to +
        " captured "
        + data.entity
    );

    this.CheckControlPointVictoryCountdown();
};


/**********************************************************************
 * VITÓRIA
 **********************************************************************/

Trigger.prototype.GetControlPointVictoryDuration = function()
{
    const settings =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_EndGameManager
        ).GetGameSettings();

    const battle = this.GetBattleModeControlPointSettings();
    if (battle && battle.holdTime)
        return battle.holdTime * 1000;

    return settings.controlPointDuration || CONTROL_POINT_DEFAULT_DURATION;
};

/**
 * Configuração do modo batalha (gui/battle_mode), se a partida for dele.
 */
Trigger.prototype.GetBattleModeControlPointSettings = function()
{
    const battleMode = InitAttributes.settings.BattleMode;
    return battleMode && battleMode.controlPoints;
};

Trigger.prototype.GetControlPointRequiredCount = function()
{
    // Modo batalha: basta a maioria (mais da metade dos pontos).
    if (this.GetBattleModeControlPointSettings())
        return Math.floor(this.totalControlPoints / 2) + 1;

    return Math.ceil(
        this.totalControlPoints *
        CONTROL_POINT_REQUIRED_PERCENT /
        100
    );
};

/**
 * Texto da parcela exigida, para as mensagens de contagem regressiva.
 */
Trigger.prototype.GetControlPointRequiredShareText = function()
{
    return this.GetBattleModeControlPointSettings() ?
        markForTranslation("more than half") :
        CONTROL_POINT_REQUIRED_PERCENT + "%";
};

Trigger.prototype.GetControlPointAlliedPlayers = function(playerID, activePlayers)
{
    const cmpEndGameManager =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_EndGameManager
        );

    if (!cmpEndGameManager.GetAlliedVictory())
        return [playerID];

    return activePlayers.filter(
        otherPlayer =>
            otherPlayer == playerID ||
            QueryPlayerIDInterface(
                playerID,
                IID_Diplomacy
            ).IsMutualAlly(otherPlayer)
    );
};

Trigger.prototype.GetControlPointCountForPlayers = function(players)
{
    let count = 0;
    for (const playerID of players)
        count += this.playerControlPointCounts[playerID] || 0;

    return count;
};

Trigger.prototype.SameControlPointVictoryPlayers = function(players)
{
    return players.length == this.controlPointVictoryCountdownPlayers.length &&
        players.every(
            playerID =>
                this.controlPointVictoryCountdownPlayers.indexOf(playerID) != -1
        );
};

Trigger.prototype.CheckControlPointVictoryCountdown = function()
{
    if (!this.totalControlPoints)
    {
        this.DeleteControlPointVictoryMessages();
        return;
    }

    const requiredCount = this.GetControlPointRequiredCount();
    const activePlayers =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_PlayerManager
        ).GetActivePlayers();

    for (const playerID of activePlayers)
    {
        const winningPlayers =
            this.GetControlPointAlliedPlayers(
                playerID,
                activePlayers
            );

        if (this.GetControlPointCountForPlayers(winningPlayers) < requiredCount)
            continue;

        if (!this.SameControlPointVictoryPlayers(winningPlayers))
            this.StartControlPointVictoryCountdown(winningPlayers);

        return;
    }

    this.DeleteControlPointVictoryMessages();
};

Trigger.prototype.DeleteControlPointVictoryMessages = function()
{
    if (!this.controlPointVictoryTimer)
        return;

    Engine.QueryInterface(
        SYSTEM_ENTITY,
        IID_Timer
    ).CancelTimer(this.controlPointVictoryTimer);

    this.controlPointVictoryTimer = undefined;

    const cmpGuiInterface =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_GuiInterface
        );

    cmpGuiInterface.DeleteTimeNotification(this.ownControlPointVictoryMessage);
    cmpGuiInterface.DeleteTimeNotification(this.othersControlPointVictoryMessage);
    this.controlPointVictoryCountdownPlayers = [];
};

Trigger.prototype.StartControlPointVictoryCountdown = function(winningPlayers)
{
    this.DeleteControlPointVictoryMessages();

    const others = [-1];
    for (let playerID = 1; playerID < TriggerHelper.GetNumberOfPlayers(); ++playerID)
    {
        const cmpPlayer = QueryPlayerIDInterface(playerID);
        if (cmpPlayer.GetState() == "won")
            return;

        if (winningPlayers.indexOf(playerID) == -1)
            others.push(playerID);
    }

    this.controlPointVictoryCountdownPlayers = winningPlayers;

    const cmpTimer =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_Timer
        );

    const cmpGuiInterface =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_GuiInterface
        );

    const duration = this.GetControlPointVictoryDuration();
    const isTeam = winningPlayers.length > 1;
    const playerID = winningPlayers[0];

    const share = this.GetControlPointRequiredShareText();

    this.othersControlPointVictoryMessage =
        cmpGuiInterface.AddTimeNotification(
            {
                "message": isTeam ?
                    markForTranslation("%(_player_)s and their allies control %(share)s of the Control Points and will win in %(time)s.") :
                    markForTranslation("%(_player_)s controls %(share)s of the Control Points and will win in %(time)s."),
                "players": others,
                "parameters": {
                    "_player_": playerID,
                    "share": share
                },
                "translateMessage": true,
                "translateParameters": ["share"]
            },
            duration
        );

    this.ownControlPointVictoryMessage =
        cmpGuiInterface.AddTimeNotification(
            {
                "message": isTeam ?
                    markForTranslation("You and your allies control %(share)s of the Control Points and will win in %(time)s.") :
                    markForTranslation("You control %(share)s of the Control Points and will win in %(time)s."),
                "players": winningPlayers,
                "parameters": {
                    "share": share
                },
                "translateMessage": true,
                "translateParameters": ["share"]
            },
            duration
        );

    this.controlPointVictoryTimer =
        cmpTimer.SetTimeout(
            SYSTEM_ENTITY,
            IID_Trigger,
            "ControlPointVictorySetWinner",
            duration,
            winningPlayers
        );
};

Trigger.prototype.ControlPointVictorySetWinner = function(winningPlayers)
{
    Engine.QueryInterface(
        SYSTEM_ENTITY,
        IID_EndGameManager
    ).MarkPlayersAsWon(
        winningPlayers,
        n => markForPluralTranslation(
            "%(lastPlayer)s has won (Control Points).",
            "%(players)s and %(lastPlayer)s have won (Control Points).",
            n
        ),
        n => markForPluralTranslation(
            "%(lastPlayer)s has been defeated (Control Points).",
            "%(players)s and %(lastPlayer)s have been defeated (Control Points).",
            n
        )
    );
};


/**********************************************************************
 * REGISTRO
 **********************************************************************/

{
    const cmpTrigger =
        Engine.QueryInterface(
            SYSTEM_ENTITY,
            IID_Trigger
        );

    cmpTrigger.ResetControlPointData();

    cmpTrigger.DoAfterDelay(
        0,
        "InitControlPointGame",
        {}
    );

    cmpTrigger.RegisterTrigger(
        "OnOwnershipChanged",
        "ControlPointOwnershipChanged",
        {
            enabled:true
        }
    );

    cmpTrigger.RegisterTrigger(
        "OnDiplomacyChanged",
        "CheckControlPointVictoryCountdown",
        {
            enabled:true
        }
    );

    cmpTrigger.RegisterTrigger(
        "OnPlayerWon",
        "DeleteControlPointVictoryMessages",
        {
            enabled:true
        }
    );

    cmpTrigger.RegisterTrigger(
        "OnPlayerDefeated",
        "CheckControlPointVictoryCountdown",
        {
            enabled:true
        }
    );
}
