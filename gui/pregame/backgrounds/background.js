export const backgrounds = {
	"bkg_01": [
		{
	 		"offset": () => -0.1,
			"sprite": "background-bkg_01-1",
			"tiling": true,
		},
		{
			"offset": (time, width) => 0.04 * width * Math.cos(0.1 * time) + 0.01 * width * Math.cos(0.04 * time),
			"sprite": "background-kush1-3",
			"tiling": true
		},

	],
	"bkg_02": [
		{
	 		"offset": () => -0.1,
			"sprite": "background-bkg_02-1",
			"tiling": true,
		},
		{
			"offset": (time, width) => 0.04 * width * Math.cos(0.1 * time) + 0.01 * width * Math.cos(0.04 * time),
			"sprite": "background-kush1-3",
			"tiling": true
		},

	],
		"bkg_03": [
		{
	 		"offset": () => -0.1,
			"sprite": "background-bkg_03-1",
			"tiling": true,
		},
		{
			"offset": (time, width) => 0.04 * width * Math.cos(0.1 * time) + 0.01 * width * Math.cos(0.04 * time),
			"sprite": "background-kush1-3",
			"tiling": true
		},

	],

};
