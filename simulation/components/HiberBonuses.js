/**
 * Bonuses of the Hibernian civ (hiber) that need game logic (the others are auras and technologies):
 *
 * - Curadmír, "the hero's portion" (civ bonus): every enemy unit a Hibernian hero kills gives him +0.5%
 *   attack, up to 40 kills (+20%).
 * - Crech, cattle raids (civ bonus): every head of cattle a Hibernian player owns yields 1 metal per
 *   minute, up to 50 heads.
 * - Fer comrac, single combat (team bonus): champions of the Hibernians and their allies take 10% less
 *   damage from enemy champions.
 * - Bórana tax (technology hiber/borana_tax): units cost 0.5% less per head of cattle, up to 50 heads.
 * - Cattle rent (technology hiber/cattle_rent): buildings cost 0.5% less per head of cattle, up to 50 heads.
 */
const HIBER_CIV = "hiber";
const HIBER_TICK = 5000;               // ms
const HIBER_METAL_TICKS = 12;          // 12 x 5 s = one minute
const HIBER_MAX_CATTLE = 50;
const HIBER_MAX_KILLS = 40;
const HIBER_ATTACK_VALUES = [
	"Attack/Melee/Damage/Hack", "Attack/Melee/Damage/Pierce", "Attack/Melee/Damage/Crush",
	"Attack/Ranged/Damage/Hack", "Attack/Ranged/Damage/Pierce", "Attack/Ranged/Damage/Crush"
];
const HIBER_RESOURCES = ["food", "wood", "stone", "metal"];

function HiberBonuses() {}

HiberBonuses.prototype.Schema = "<a:component type='system'/><empty/>";

HiberBonuses.prototype.Init = function()
{
	this.heroKills = {};
	this.cattle = {};         // player -> heads of cattle at the last count
	this.ticks = 0;
};

HiberBonuses.prototype.OnGlobalInitGame = function()
{
	if (!this.HiberPlayers().length)
		return;
	Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).SetInterval(SYSTEM_ENTITY, IID_HiberBonuses, "Tick", HIBER_TICK, HIBER_TICK, null);
};

HiberBonuses.prototype.HiberPlayers = function()
{
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const players = [];
	for (let i = 1; i < cmpPlayerManager.GetNumPlayers(); ++i)
	{
		const cmpIdentity = QueryPlayerIDInterface(i, IID_Identity);
		if (cmpIdentity && cmpIdentity.GetCiv() == HIBER_CIV)
			players.push(i);
	}
	return players;
};

HiberBonuses.prototype.CountCattle = function(player)
{
	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	const cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	let count = 0;
	for (const ent of cmpRangeManager.GetEntitiesByPlayer(player))
	{
		const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
		if (!cmpIdentity || !cmpIdentity.HasClass("Domestic"))
			continue;
		const name = cmpTemplateManager.GetCurrentTemplateName(ent);
		if (name && name.indexOf("cattle") != -1 && name.indexOf("foundation|") == -1)
			++count;
	}
	return Math.min(count, HIBER_MAX_CATTLE);
};

HiberBonuses.prototype.Tick = function()
{
	++this.ticks;
	const cmpModifiersManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ModifiersManager);
	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	for (const player of this.HiberPlayers())
	{
		const cmpPlayer = QueryPlayerIDInterface(player);
		if (!cmpPlayer || cmpPlayer.GetState() != "active")
			continue;
		const heads = this.CountCattle(player);
		if (this.ticks % HIBER_METAL_TICKS == 0 && heads)
			cmpPlayer.AddResource("metal", heads);
		if (this.cattle[player] === heads)
			continue;
		this.cattle[player] = heads;
		const playerEnt = cmpPlayerManager.GetPlayerByID(player);
		const cmpTechnologyManager = QueryPlayerIDInterface(player, IID_TechnologyManager);
		for (const [tech, affects] of [["hiber/borana_tax", "Unit"], ["hiber/cattle_rent", "Structure"]])
		{
			cmpModifiersManager.RemoveAllModifiers(tech + "/cattle", playerEnt);
			if (!heads || !cmpTechnologyManager || !cmpTechnologyManager.IsTechnologyResearched(tech))
				continue;
			const multiply = 1 - 0.005 * heads;
			cmpModifiersManager.AddModifiers(tech + "/cattle", DeriveModificationsFromTech({
				"modifications": HIBER_RESOURCES.map(res => ({ "value": "Cost/Resources/" + res, "multiply": multiply, "affects": affects }))
			}), playerEnt);
		}
	}
};

/**
 * The cattle techs only change the costs on the next count: count again when one of them is researched.
 */
HiberBonuses.prototype.OnGlobalResearchFinished = function(msg)
{
	if (msg.tech == "hiber/borana_tax" || msg.tech == "hiber/cattle_rent")
		delete this.cattle[msg.player];
};

HiberBonuses.prototype.HeroKilled = function(hero, victim)
{
	const cmpIdentity = Engine.QueryInterface(hero, IID_Identity);
	if (!cmpIdentity || !cmpIdentity.HasClass("Hero") || cmpIdentity.GetCiv() != HIBER_CIV)
		return;
	const cmpVictim = Engine.QueryInterface(victim, IID_Identity);
	if (!cmpVictim || !cmpVictim.HasClass("Unit") || cmpVictim.HasClass("Animal"))
		return;
	const kills = Math.min((this.heroKills[hero] || 0) + 1, HIBER_MAX_KILLS);
	if (kills == this.heroKills[hero])
		return;
	this.heroKills[hero] = kills;
	const cmpModifiersManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ModifiersManager);
	cmpModifiersManager.RemoveAllModifiers("hiber/curadmir", hero);
	cmpModifiersManager.AddModifiers("hiber/curadmir", DeriveModificationsFromTech({
		"modifications": HIBER_ATTACK_VALUES.map(value => ({ "value": value, "multiply": 1 + 0.005 * kills }))
	}), hero);
};

HiberBonuses.prototype.GetHeroKills = function(hero)
{
	return this.heroKills[hero] || 0;
};

HiberBonuses.prototype.OnGlobalEntityRenamed = function(msg)
{
	if (this.heroKills[msg.entity] === undefined)
		return;
	this.heroKills[msg.newentity] = this.heroKills[msg.entity];
	delete this.heroKills[msg.entity];
};

/**
 * Fer comrac: a champion of a Hibernian or of one of their allies hit by an enemy champion.
 */
HiberBonuses.prototype.ChampionDuelMultiplier = function(target, attacker)
{
	const cmpTarget = Engine.QueryInterface(target, IID_Identity);
	const cmpAttacker = Engine.QueryInterface(attacker, IID_Identity);
	if (!cmpTarget || !cmpAttacker || !cmpTarget.HasClass("Champion") || !cmpAttacker.HasClass("Champion"))
		return 1;
	const cmpOwnership = Engine.QueryInterface(target, IID_Ownership);
	if (!cmpOwnership)
		return 1;
	const owner = cmpOwnership.GetOwner();
	for (const player of this.HiberPlayers())
	{
		const cmpPlayer = QueryPlayerIDInterface(player);
		if (player == owner || cmpPlayer && cmpPlayer.IsMutualAlly(owner))
			return 0.9;
	}
	return 1;
};

Engine.RegisterSystemComponentType(IID_HiberBonuses, "HiberBonuses", HiberBonuses);

{
	const hiberKilledBy = Health.prototype.KilledBy;
	Health.prototype.KilledBy = function(attacker, attackerOwner)
	{
		hiberKilledBy.call(this, attacker, attackerOwner);
		const cmpHiber = Engine.QueryInterface(SYSTEM_ENTITY, IID_HiberBonuses);
		if (cmpHiber && attacker != INVALID_ENTITY)
			cmpHiber.HeroKilled(attacker, this.entity);
	};

	const hiberTakeDamage = Health.prototype.TakeDamage;
	Health.prototype.TakeDamage = function(amount, attacker, attackerOwner)
	{
		const cmpHiber = Engine.QueryInterface(SYSTEM_ENTITY, IID_HiberBonuses);
		if (cmpHiber && amount > 0 && attacker && attacker != INVALID_ENTITY)
			amount *= cmpHiber.ChampionDuelMultiplier(this.entity, attacker);
		return hiberTakeDamage.call(this, amount, attacker, attackerOwner);
	};
}
