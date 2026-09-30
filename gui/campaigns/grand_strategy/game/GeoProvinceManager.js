class GeoProvinceManager
{
	constructor()
	{
		this.data =
			Engine.ReadJSONFile(
				"campaigns/grand_strategy/data/provinces.geojson"
			);
		this.neighbourCache = {};
		this.boundsCache = {};

	}

	getProvince(code)
	{
		return this.data.features.find(
			x =>
			x.properties.code == code
		);
	}
	getCenter(code)
	{
		let province = this.getProvince(code);

		if (!province)
			return null;

		let coords = province.geometry.coordinates[0];

		let x = 0;
		let y = 0;

		for (let point of coords)
		{
			x += point[0];
			y += point[1];
		}

		return {
			"x": x / coords.length,
			"y": y / coords.length
		};
	}
	buildBoundsCache()
	{
		let worldBounds =
			this.getBounds();

		for (let feature of this.data.features)
		{
			let code =
				feature.properties.code;

			let polygon =
				feature.geometry.coordinates[0];

			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;

			for (let point of polygon)
			{
				minX = Math.min(minX, point[0]);
				minY = Math.min(minY, point[1]);

				maxX = Math.max(maxX, point[0]);
				maxY = Math.max(maxY, point[1]);
			}

			let px0 =
				(minX - worldBounds.minX) /
				(worldBounds.maxX - worldBounds.minX) *
				4096;

			let px1 =
				(maxX - worldBounds.minX) /
				(worldBounds.maxX - worldBounds.minX) *
				4096;

			let py0 =
				2048 -
				(
					(minY - worldBounds.minY) /
					(worldBounds.maxY - worldBounds.minY)
					* 2048
				);

			let py1 =
				2048 -
				(
					(maxY - worldBounds.minY) /
					(worldBounds.maxY - worldBounds.minY)
					* 2048
				);
			// let py1 =
			// 	2048 -
			// 	(
			// 		(maxY - worldBounds.minY) /
			// 		(worldBounds.maxY - worldBounds.minY)
			// 		* 2048
			// 	);

			this.boundsCache[code] = [
				Math.round(px0),
				Math.round(py1),
				Math.round(px1),
				Math.round(py0)
			];
		}
	}

	getBounds()
	{
		return {
			minX: 0,
			maxX: 4096,
			minY: -2048,
			maxY: 0
		};
	}
	pointInPolygon(x, y, polygon)
	{
		let inside = false;

		for (
			let i = 0, j = polygon.length - 1;
			i < polygon.length;
			j = i++
		)
		{
			let xi = polygon[i][0];
			let yi = polygon[i][1];

			let xj = polygon[j][0];
			let yj = polygon[j][1];

			let intersect =
				((yi > y) != (yj > y)) &&
				(
					x <
					(xj - xi) *
					(y - yi) /
					(yj - yi) +
					xi
				);

			if (intersect)
				inside = !inside;
		}

		return inside;
	}
	//
	getProvinceAtPoint(x, y)
	{
		for (let feature of this.data.features)
		{
			let polygon =
				feature.geometry.coordinates[0];

			if (
				this.pointInPolygon(
					x,
					y,
					polygon
				)
			)
			{
				return feature;
			}
		}

		return null;
	}
	polygonsTouch(polyA, polyB)
	{
		for (let pointA of polyA)
		{
			for (let pointB of polyB)
			{
				let dx =
					Math.abs(
						pointA[0] - pointB[0]
					);

				let dy =
					Math.abs(
						pointA[1] - pointB[1]
					);

				if (
					dx < 1 &&
					dy < 1
				)
				{
					return true;
				}
			}
		}

		return false;
	}
	getNeighbours(code)
	{
		if (this.neighbourCache[code])
			return this.neighbourCache[code];

		let province =
			this.getProvince(code);

		if (!province)
			return [];

		// Vizinhos já calculados pelas fronteiras reais (províncias de Marte).
		if (province.properties.links)
		{
			this.neighbourCache[code] = province.properties.links;
			return this.neighbourCache[code];
		}

		let polygonA =
			province.geometry.coordinates[0];

		let neighbours = [];

		for (let feature of this.data.features)
		{
			if (
				feature.properties.code ==
				code
			)
				continue;

			let polygonB =
				feature.geometry.coordinates[0];

			if (
				this.polygonsTouch(
					polygonA,
					polygonB
				)
			)
			{
				neighbours.push(
					feature.properties.code
				);
			}
		}

		this.neighbourCache[code] =
			neighbours;

		return neighbours;
	}
	buildNeighbourCache()
	{
		for (let feature of this.data.features)
		{
			let code =
				feature.properties.code;

			this.neighbourCache[code] = [];
		}

		for (let featureA of this.data.features)
		{
			let codeA =
				featureA.properties.code;

			let polygonA =
				featureA.geometry.coordinates[0];

			for (let featureB of this.data.features)
			{
				let codeB =
					featureB.properties.code;

				if (codeA == codeB)
					continue;

				let polygonB =
					featureB.geometry.coordinates[0];

				if (
					this.polygonsTouch(
						polygonA,
						polygonB
					)
				)
				{
					this.neighbourCache[codeA]
						.push(codeB);
				}
			}
		}
	}
	getCenterPercent(code)
	{
		let center =
			this.getCenter(code);

		if (!center)
			return null;

		let bounds =
			this.getBounds();

		return {
			x:
				(center.x - bounds.minX) /
				(bounds.maxX - bounds.minX),

			y:
				(center.y - bounds.minY) /
				(bounds.maxY - bounds.minY)
		};
	}
	getPixelCenter(code)
	{
		let province =
			this.getProvince(code);

		if (!province)
			return null;

		let polygon =
			province.geometry.coordinates[0];

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (let point of polygon)
		{
			minX = Math.min(minX, point[0]);
			minY = Math.min(minY, point[1]);

			maxX = Math.max(maxX, point[0]);
			maxY = Math.max(maxY, point[1]);
		}

		return {
			x: Math.round(
				(minX + maxX) / 2
			),

			y: Math.round(
				-(minY + maxY) / 2
			)
		};
	}
	
	getPixelBounds(code)
	{
		let province = this.getProvince(code);

		let polygon =
			province.geometry.coordinates[0];

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (let p of polygon)
		{
			minX = Math.min(minX, p[0]);
			minY = Math.min(minY, p[1]);

			maxX = Math.max(maxX, p[0]);
			maxY = Math.max(maxY, p[1]);
		}

		return [
			Math.round(minX),
			Math.round(-maxY),
			Math.round(maxX),
			Math.round(-minY)
		];
	}
	// getPixelBounds(code)
	// {
	// 	let center =
	// 		this.getPixelCenter(code);

	// 	if (!center)
	// 		return null;

	// 	return [
	// 		center.x - 256,
	// 		center.y - 256,
	// 		center.x + 256,
	// 		center.y + 256
	// 	];
	// }
	getMaskSize()
	{
		return 512;
	}
}