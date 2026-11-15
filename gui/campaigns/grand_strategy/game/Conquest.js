/**
 * Destino de uma província conquistada (Total Warfield).
 *
 * Quando o jogador vence e toma um assentamento, escolhe:
 *  - Ocupar (anexar): fica com a província; saque pequeno.
 *  - Saquear: fica com ela, mas leva muito ouro; a cidade perde parte da
 *    população e das construções e fica à beira da revolta; as outras
 *    nações passam a gostar menos de você.
 *  - Vassalo: ao tomar a capital de uma nação, devolve a capital e a nação
 *    inteira vira vassala. Em qualquer outra província (ou nas terras de
 *    nativos), instala ali um governante local: um Estado cliente novo,
 *    vassalo seu. Vassalos são aliados, ficam em paz para sempre com você e
 *    pagam tributo (30% da renda) por turno. Um vassalo muito mais forte
 *    que o senhor pode se rebelar.
 * As três opções aparecem sempre que o jogador toma uma província (também
 * já na batalha, quando o exército inimigo debanda).
 * A IA escolhe sozinha. A escolha pendente do jogador fica em
 * g_GameData.pendingCapture (salva com a campanha).
 */
var TW_VASSAL_TRIBUTE = 0.3;
var TW_SACK_POPULATION_LOSS = 0.4;

class TWConquest
{
	/**
	 * Chamado logo depois da troca de dono (vitória ou rendição).
	 * @param previousOwner - tribo que perdeu (undefined = nativos).
	 */
	static record(provinceCode, previousOwner, conqueror, wasCapital)
	{
		const capture = { "province": provinceCode, "previousOwner": previousOwner, "conqueror": conqueror, "wasCapital": !!wasCapital };
		if (conqueror == g_GameData.playerTribe)
		{
			g_GameData.pendingCapture = capture;
			return;
		}
		this.aiChoose(capture);
	}

	static getLoot(capture)
	{
		const province = g_GameData.provinces[capture.province];
		const buildings = province.buildings.reduce((sum, id) => sum + (g_GameData.getProvinceBuildingData(id)?.cost || 0), 0);
		return {
			"occupy": Math.round(50 + province.population / 20),
			"sack": Math.round(150 + province.population / 4 + buildings * 0.4)
		};
	}

	/**
	 * Como a vassalagem acontece: "nation" (a nação dona da capital vira
	 * vassala) ou "client" (um Estado cliente novo na província).
	 */
	static vassalMode(capture)
	{
		const province = g_GameData.provinces[capture.province];
		if (!province || province.isSea())
			return undefined;
		const previous = g_GameData.tribes[capture.previousOwner];
		if (previous && capture.wasCapital && capture.previousOwner != capture.conqueror &&
			!previous.vassalOf && capture.previousOwner != g_GameData.playerTribe)
			return "nation";
		return "client";
	}

	static canVassalize(capture)
	{
		return !!this.vassalMode(capture);
	}

	/** Código, nome e civ do Estado cliente que seria criado. */
	static clientInfo(capture)
	{
		const province = g_GameData.provinces[capture.province];
		const previous = g_GameData.tribes[capture.previousOwner];
		return {
			"code": "client_" + capture.province,
			"name": "Principality of " + province.getName(),
			"civ": previous?.civ || province.getNativeCivs()[0]
		};
	}

	static occupy(capture)
	{
		const loot = this.getLoot(capture).occupy;
		const tribe = g_GameData.tribes[capture.conqueror];
		tribe.money += loot;
		const province = g_GameData.provinces[capture.province];
		return province.getName() + " has been annexed. The treasury receives " + loot + " gold.";
	}

	static sack(capture)
	{
		const loot = this.getLoot(capture).sack;
		const tribe = g_GameData.tribes[capture.conqueror];
		const province = g_GameData.provinces[capture.province];
		tribe.money += loot;
		province.population = Math.round(province.population * (1 - TW_SACK_POPULATION_LOSS));
		// Metade das construções vira ruína.
		const ruined = province.buildings.filter(() => randBool(0.5));
		province.buildings = province.buildings.filter(id => ruined.indexOf(id) == -1);
		province.buildQueue = [];
		province.garrison = 0;
		province.setHappiness(15);
		// A notícia corre: as outras nações confiam menos em quem saqueia.
		for (const code in g_GameData.tribes)
			if (code != capture.conqueror)
			{
				const diplo = g_GameData.tribes[code].getDiplomacy(capture.conqueror);
				diplo.opinion = (diplo.opinion || 0) - 5;
			}
		g_GameData.statistics?.AddGold?.(loot);
		return province.getName() + " has been sacked: " + loot + " gold plundered" +
			(ruined.length ? ", " + ruined.length + " buildings destroyed" : "") + ". The survivors are on the verge of revolt.";
	}

	static vassalize(capture)
	{
		if (this.vassalMode(capture) == "client")
			return this.installClient(capture);
		const province = g_GameData.provinces[capture.province];
		const overlord = g_GameData.tribes[capture.conqueror];
		const vassal = g_GameData.tribes[capture.previousOwner];
		province.setOwner(capture.previousOwner);
		province.garrison = Math.max(1, province.garrison);
		vassal.vassalOf = capture.conqueror;
		// Tributo de submissão: metade do tesouro.
		const tribute = Math.max(0, Math.round(vassal.money * 0.5));
		vassal.money -= tribute;
		overlord.money += tribute;
		this.enforceVassalPeace(vassal);
		// Generais do senhor que estavam ali continuam (território aliado).
		return vassal.getName() + " swears fealty to " + overlord.getName() + " and keeps " + province.getName() +
			" as a vassal: an ally that pays " + Math.round(TW_VASSAL_TRIBUTE * 100) + "% of its income every turn" +
			(tribute ? " (and " + tribute + " gold now)." : ".");
	}

	/**
	 * Estado cliente: um governante local fica com a província, vassalo de
	 * quem a tomou. Ele herda a guerra contra o antigo dono.
	 */
	static installClient(capture)
	{
		const province = g_GameData.provinces[capture.province];
		const overlord = g_GameData.tribes[capture.conqueror];
		const info = this.clientInfo(capture);
		let client = g_GameData.tribes[info.code];
		if (!client)
		{
			// Cor do senhor clareada: o mapa mostra a esfera de influência.
			const rgb = (overlord.color || "200 200 200").split(" ").map(Number);
			client = new Tribe({
				"code": info.code,
				"name": info.name,
				"civ": info.civ,
				"color": rgb.map(c => Math.round(c + (255 - c) * 0.45)).join(" "),
				"difficulty": 3,
				"isClient": true,
				"originProvince": capture.province
			}, true);
			client.civ = info.civ;
			g_GameData.tribes[info.code] = client;
		}
		client.money = Math.max(client.money || 0, 60);
		province.setOwner(info.code);
		province.garrison = Math.max(1, province.garrison);
		province.setHappiness?.(Math.max(province.happiness || 0, 55));
		client.vassalOf = capture.conqueror;
		this.enforceVassalPeace(client);
		const previous = g_GameData.tribes[capture.previousOwner];
		if (previous && previous !== client)
			for (const diplo of [client.getDiplomacy(previous.code), previous.getDiplomacy(client.code)])
			{
				diplo.status = GSDiplomacy.prototype.WAR;
				diplo.opinion = -100;
			}
		return "A local ruler takes " + province.getName() + " as the " + info.name + ", a client state sworn to " + overlord.getName() +
			": an ally that pays " + Math.round(TW_VASSAL_TRIBUTE * 100) + "% of its income every turn and guards the province for you.";
	}

	/** Uma das tribos é vassala da outra? */
	static isVassalPair(a, b)
	{
		return g_GameData.tribes[a]?.vassalOf == b || g_GameData.tribes[b]?.vassalOf == a;
	}

	/** Vassalo e senhor: paz, aliança e pacto de não agressão, dos dois lados. */
	static enforceVassalPeace(vassal)
	{
		const overlord = g_GameData.tribes[vassal.vassalOf];
		if (!overlord)
			return;
		for (const diplo of [vassal.getDiplomacy(vassal.vassalOf), overlord.getDiplomacy(vassal.code)])
		{
			diplo.status = GSDiplomacy.prototype.NEUTRAL;
			diplo.treaties.alliance = true;
			diplo.treaties.nonAggression = true;
			diplo.opinion = Math.max(diplo.opinion || 0, 20);
		}
	}

	/** Executa a escolha ("occupy", "sack" ou "vassal") e devolve o relatório. */
	static resolve(capture, choice)
	{
		let text;
		if (choice == "vassal" && this.canVassalize(capture))
			text = this.vassalize(capture);
		else if (choice == "sack")
			text = this.sack(capture);
		else
			text = this.occupy(capture);
		g_GameData.statistics?.RegisterEvent?.(text);
		if (g_GameData.pendingCapture === capture)
			g_GameData.pendingCapture = undefined;
		return text;
	}

	/** IA: capital de quem ainda tem terras pode virar vassala; às vezes saqueia. */
	static aiChoose(capture)
	{
		const previous = g_GameData.tribes[capture.previousOwner];
		if (this.vassalMode(capture) == "nation" && previous.controlledProvinces.length >= 1 && randBool(0.4))
			return this.resolve(capture, "vassal");
		return this.resolve(capture, randBool(0.25) ? "sack" : "occupy");
	}

	/**
	 * Fim de turno: vassalos pagam tributo e ficam em paz com o senhor.
	 * Um vassalo bem mais forte que o senhor pode se rebelar (declara
	 * independência e guerra).
	 */
	static processVassals()
	{
		const reports = [];
		for (const code in g_GameData.tribes)
		{
			const vassal = g_GameData.tribes[code];
			const overlord = vassal.vassalOf && g_GameData.tribes[vassal.vassalOf];
			if (!vassal.vassalOf)
				continue;
			if (!overlord || !overlord.controlledProvinces.length || !vassal.controlledProvinces.length)
			{
				vassal.vassalOf = undefined;
				continue;
			}
			const power = tribe => tribe.controlledProvinces.length * 40 +
				tribe.generals.reduce((sum, hero) => sum + twArmySoldiers(hero.battalions), 0);
			if (power(vassal) > power(overlord) * 1.3 && randBool(0.1))
			{
				vassal.vassalOf = undefined;
				const diplo = vassal.getDiplomacy(overlord.code);
				diplo.treaties.alliance = false;
				diplo.treaties.nonAggression = false;
				g_GameData.pushTurnEvent(diplo.declareWar());
				reports.push(vassal.getName() + " has risen against " + overlord.getName() + " and declared independence!");
				continue;
			}
			this.enforceVassalPeace(vassal);
			const tribute = Math.max(0, Math.round((vassal.lastBalance || 0) * TW_VASSAL_TRIBUTE));
			vassal.money -= tribute;
			overlord.money += tribute;
			vassal.lastTribute = tribute;
		}
		return reports;
	}
}
