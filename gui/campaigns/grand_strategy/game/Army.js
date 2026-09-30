class Army
{
    constructor(id, owner)
    {
        this.id = id;
        this.owner = owner;

        this.general = null;
        this.province = null;

        this.units = [];

        this.movement = 2;
        this.remainingMovement = 2;
    }

    Serialize()
    {
        return {
            id: this.id,
            owner: this.owner,
            general: this.general,
            province: this.province,
            units: this.units,
            movement: this.movement,
            remainingMovement:
                this.remainingMovement
        };
    }

    static Deserialize(data)
    {
        let army =
            new Army(
                data.id,
                data.owner
            );

        Object.assign(
            army,
            data
        );

        return army;
    }
}