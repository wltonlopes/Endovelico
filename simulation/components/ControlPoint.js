function ControlPoint() {}

ControlPoint.prototype.Schema =
    "<a:help>Marks this entity as a Control Point.</a:help>" +
    "<a:example>" +
        "<Weight>1</Weight>" +
        "<Region>Central</Region>" +
        "<DisplayName>Central Outpost</DisplayName>" +
    "</a:example>" +

    "<element name='Weight' a:help='Victory score weight'>" +
        "<data type='positiveInteger'/>" +
    "</element>" +

    "<optional>" +
        "<element name='Region'>" +
            "<text/>" +
        "</element>" +
    "</optional>" +

    "<optional>" +
        "<element name='DisplayName'>" +
            "<text/>" +
        "</element>" +
    "</optional>";

ControlPoint.prototype.Init = function()
{
    this.weight = +this.template.Weight;

    this.region = this.template.Region || "";

    this.displayName = this.template.DisplayName || "";
};

ControlPoint.prototype.GetWeight = function()
{
    return this.weight;
};

ControlPoint.prototype.GetRegion = function()
{
    return this.region;
};

ControlPoint.prototype.GetDisplayName = function()
{
    return this.displayName;
};

Engine.RegisterComponentType(
    IID_ControlPoint,
    "ControlPoint",
    ControlPoint
);