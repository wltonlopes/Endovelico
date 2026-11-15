/**
 * Soldado de batalhão (Total Warfield). Quem manda é o líder
 * (BattalionLeader); aqui só fica o vínculo e o repasse dos golpes
 * recebidos para o moral do batalhão.
 */
function BattalionMember() {}

BattalionMember.prototype.Schema = "<empty/>";

BattalionMember.prototype.Init = function()
{
	this.leader = INVALID_ENTITY;
};

BattalionMember.prototype.SetLeader = function(ent)
{
	this.leader = ent;
};

BattalionMember.prototype.GetLeader = function()
{
	return this.leader;
};

BattalionMember.prototype.OnAttacked = function(msg)
{
	const cmpTactics = this.leader != INVALID_ENTITY && Engine.QueryInterface(this.leader, IID_BattalionTactics);
	if (cmpTactics)
		cmpTactics.SoldierAttacked(msg, this.entity);
};

Engine.RegisterComponentType(IID_BattalionMember, "BattalionMember", BattalionMember);
