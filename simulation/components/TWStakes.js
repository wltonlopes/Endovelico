/**
 * Estacas defensivas (Total Warfield, Medieval II): cravadas por arqueiros e
 * besteiros (BattalionTactics.PlantStakes). Não bloqueiam a passagem (a
 * infantaria passa entre elas), mas a cavalaria e os elefantes inimigos que
 * encostam se ferem a cada tick, perdem o embalo da carga (como numa parede
 * de lanças) e a moral. Cada golpe gasta a estaca; a infantaria pode
 * arrancá-las atacando.
 */
function TWStakes() {}

TWStakes.prototype.Schema =
	"<a:help>Defensive stakes against cavalry.</a:help>" +
	"<element name='Radius' a:help='Reach of the stakes (m).'><ref name='positiveDecimal'/></element>" +
	"<element name='Damage' a:help='Damage per tick to a mounted enemy touching the stakes.'><ref name='positiveDecimal'/></element>" +
	"<element name='SelfDamage' a:help='Health lost by the stake per hit.'><ref name='nonNegativeDecimal'/></element>" +
	"<element name='Interval' a:help='Tick (ms).'><data type='positiveInteger'/></element>";

TWStakes.prototype.VICTIM_CLASSES = ["Cavalry", "Elephant"];
TWStakes.prototype.MORALE_LOSS = 3;

TWStakes.prototype.Init = function()
{
	this.timer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).SetInterval(this.entity, IID_TWStakes, "Tick",
		+this.template.Interval, +this.template.Interval, null);
};

TWStakes.prototype.OnDestroy = function()
{
	if (this.timer)
		Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).CancelTimer(this.timer);
};

TWStakes.prototype.Tick = function()
{
	const cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	const owner = Engine.QueryInterface(this.entity, IID_Ownership)?.GetOwner();
	if (!cmpPosition || !cmpPosition.IsInWorld() || !(owner > 0))
		return;
	const cmpDiplomacy = QueryPlayerIDInterface(owner, IID_Diplomacy);
	const enemies = cmpDiplomacy ? cmpDiplomacy.GetEnemies().filter(p => p > 0) : [];
	if (!enemies.length)
		return;
	const victims = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).ExecuteQueryAroundPos(
		cmpPosition.GetPosition2D(), 0, +this.template.Radius, enemies, IID_Health, false).filter(ent => {
		const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
		return cmpIdentity && this.VICTIM_CLASSES.some(cls => cmpIdentity.HasClass(cls));
	});
	if (!victims.length)
		return;
	const hurtBattalions = new Set();
	for (const ent of victims)
	{
		Engine.QueryInterface(ent, IID_Health)?.TakeDamage(+this.template.Damage, this.entity, owner);
		const leader = typeof GetBattalionLeaderEntity == "function" ? GetBattalionLeaderEntity(ent) : INVALID_ENTITY;
		if (leader != INVALID_ENTITY)
			hurtBattalions.add(leader);
	}
	for (const leader of hurtBattalions)
	{
		const cmpTactics = Engine.QueryInterface(leader, IID_BattalionTactics);
		if (!cmpTactics)
			continue;
		// Bateu nas estacas: a carga para como numa parede de lanças.
		if (cmpTactics.charge && !cmpTactics.charge.impact)
			cmpTactics.ChargeImpact(true);
		cmpTactics.ReduceMorale(this.MORALE_LOSS);
		cmpTactics.Flash("impact");
	}
	const cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
	if (cmpHealth && +this.template.SelfDamage)
		cmpHealth.Reduce(+this.template.SelfDamage * victims.length);
};

Engine.RegisterComponentType(IID_TWStakes, "TWStakes", TWStakes);
