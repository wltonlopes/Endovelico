/**
 * Mapa de campanha animado (Total Warfield).
 *
 * - Generais marcham de província em província (g_TWMapMoves), inclusive
 *   os da IA ao fim do turno, com mini-exércitos animados (sprites gerados
 *   por tools/art/gen_army_sprites.py) e a bandeira da tribo tremulando.
 * - Prévia da rota ao passar o mouse: verde neste turno, amarelo nos
 *   próximos, vermelho quando termina em batalha.
 * - Batalhas (g_TWMapEvents) deixam espadas cruzadas e fumaça; cercos
 *   montam tendas e, com fome, a cidade pega fogo; conquistas trocam a cor
 *   da província aos poucos com um anel de luz.
 * - Estações do ano (neve no inverno), nuvens e caravanas nas rotas de
 *   comércio do jogador.
 *
 * Os objetos da GUI vêm de "pools" (CampaignMenu.xml) usados a cada quadro;
 * o que sobra fica escondido.
 */
class TWMapAnimator
{
	constructor(menu)
	{
		this.menu = menu;
		this.tracks = {};
		this.ownerSeen = {};
		this.lastColor = {};
		this.colorFades = {};
		this.flashes = [];
		this.hoverProvince = undefined;
		this.used = {};
		this.counts = {};
		this.planCache = {};
		this.pathCache = {};
		this.now = Date.now();
		this.lastFrame = this.now;

		this.sprites = Engine.ReadJSONFile("campaigns/grand_strategy/data/army_sprites.json") || { "civs": {} };
		this.civFallback = Engine.ReadJSONFile("campaigns/grand_strategy/data/civ_fallback.json") || {};

		// Nuvens em coordenadas do mapa (4096 x 2048).
		this.clouds = [];
		for (let i = 0; i < 7; ++i)
			this.clouds.push({
				"x": (i * 0.143 + Math.random() * 0.1) * this.menu.MAP_WIDTH,
				"y": (0.08 + Math.random() * 0.84) * this.menu.MAP_HEIGHT,
				"w": 380 + Math.random() * 320,
				"speed": 0.004 + Math.random() * 0.004
			});
		g_TWMapMoves.length = 0;
	}

	// ------------------------------------------------------------ pools

	take(pool)
	{
		const index = this.counts[pool] || 0;
		const object = Engine.TryGetGUIObjectByName(`${pool}[${index}]`);
		if (!object)
			return undefined;
		this.counts[pool] = index + 1;
		object.hidden = false;
		return object;
	}

	hideUnused()
	{
		for (const pool in this.used)
			for (let i = this.counts[pool] || 0; i < this.used[pool]; ++i)
			{
				const object = Engine.TryGetGUIObjectByName(`${pool}[${i}]`);
				if (object)
					object.hidden = true;
			}
		this.used = this.counts;
		this.counts = {};
	}

	place(object, x, y, halfW, halfH)
	{
		object.size = this.menu.toGUISize(x - halfW, y - halfH, x + halfW, y + halfH);
	}

	/** Meio-tamanho em unidades do mapa de algo com `px` pixels de tela. */
	screen(px)
	{
		return px / this.menu.zoom;
	}

	// ------------------------------------------------------------ quadro

	beginFrame()
	{
		this.lastFrame = this.now;
		this.now = Date.now();
		this.consumeMoves();
	}

	endFrame(visible)
	{
		this.visible = visible;
		this.renderRoute();
		this.renderBattles();
		this.renderSieges();
		this.renderFlashes();
		this.renderCaravans();
		this.renderClouds();
		this.renderSeason();
		this.hideUnused();

		for (const id in this.tracks)
			if (this.tracks[id].seen < this.now - 5000)
				delete this.tracks[id];
	}

	// ------------------------------------------------------------ marcha

	anchor(code)
	{
		return g_GameData.provinces[code]?.getHeroPos() || [0, 0];
	}

	consumeMoves()
	{
		for (const move of g_TWMapMoves)
		{
			const track = this.tracks[move.id];
			if (!track)
				continue;
			const from = g_GameData.provinces[move.from];
			// Passo entre vizinhas anda; salto (general recriado, etc.) teletransporta.
			track.queue.push({ "to": move.to, "teleport": !from || !from.canTravel(move.to) });
		}
		g_TWMapMoves.length = 0;
	}

	direction(dx, dy)
	{
		const angle = Math.atan2(-dy, dx);
		return (Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8;
	}

	/**
	 * Posição animada do general (alvo = lugar dele no mapa, já com o
	 * deslocamento de quem divide a província).
	 */
	placeHero(hero, target)
	{
		const now = this.now;
		let track = this.tracks[hero.id];
		if (!track)
			track = this.tracks[hero.id] = { "pos": target.slice(), "queue": [], "seg": null, "dir": 6, "born": now };
		track.seen = now;

		if (track.seg && now >= track.seg.end)
		{
			track.pos = track.seg.to;
			track.seg = null;
		}
		while (!track.seg && track.queue.length)
		{
			const step = track.queue.shift();
			const to = track.queue.length ? this.anchor(step.to) : target.slice();
			if (step.teleport)
			{
				track.pos = to;
				track.born = now;
				continue;
			}
			const dx = to[0] - track.pos[0];
			const dy = to[1] - track.pos[1];
			const distance = Math.sqrt(dx * dx + dy * dy);
			const duration = Math.max(this.MOVE_MIN_MS, Math.min(this.MOVE_MAX_MS, distance / this.MOVE_SPEED));
			track.seg = { "from": track.pos.slice(), "to": to, "start": now, "end": now + duration };
			if (distance > 1)
				track.dir = this.direction(dx, dy);
		}

		let pos;
		if (track.seg)
		{
			const k = (now - track.seg.start) / (track.seg.end - track.seg.start);
			const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
			pos = [
				track.seg.from[0] + (track.seg.to[0] - track.seg.from[0]) * e,
				track.seg.from[1] + (track.seg.to[1] - track.seg.from[1]) * e
			];
		}
		else
		{
			// Ajuste suave quando outro general chega ou sai da província.
			const k = Math.min(1, (now - this.lastFrame) / 120);
			track.pos = [track.pos[0] + (target[0] - track.pos[0]) * k, track.pos[1] + (target[1] - track.pos[1]) * k];
			pos = track.pos;
		}
		return {
			"pos": pos,
			"moving": !!track.seg,
			"dir": track.dir,
			// Surge crescendo (general novo ou teletransportado).
			"grow": Math.min(1, (now - track.born) / 450)
		};
	}

	/** Composição do exército em até 5 figuras: inf, rng e cav. */
	armyFigures(hero, revealed)
	{
		const total = Math.max(1, Math.min(5, Math.ceil(hero.battalions.length / 2.4)));
		if (!revealed || !hero.battalions.length)
			return new Array(total).fill("inf");
		const count = { "inf": 0, "rng": 0, "cav": 0 };
		for (const battalion of hero.battalions)
		{
			const category = twUnit(battalion.civ, battalion.key)?.category || "";
			if (category.indexOf("cavalry") != -1 || category == "chariot" || category == "elephant")
				++count.cav;
			else if (category == "infantry_ranged")
				++count.rng;
			else
				++count.inf;
		}
		const classes = Object.keys(count).filter(c => count[c]);
		const figures = classes.slice(0, total);
		while (figures.length < total)
		{
			// Próxima figura para a classe mais sub-representada.
			let best = classes[0];
			let bestGap = -Infinity;
			for (const c of classes)
			{
				const gap = count[c] / hero.battalions.length - figures.filter(f => f == c).length / total;
				if (gap > bestGap)
				{
					bestGap = gap;
					best = c;
				}
			}
			figures.push(best);
		}
		// Cavalaria nas pontas, atiradores à frente, infantaria no centro.
		const order = { "cav": 0, "inf": 1, "rng": 2 };
		return figures.sort((a, b) => order[a] - order[b]);
	}

	spriteCiv(civ)
	{
		if (this.sprites.civs[civ])
			return civ;
		const fallback = this.civFallback[civ];
		if (fallback && this.sprites.civs[fallback])
			return fallback;
		return undefined;
	}

	/**
	 * Mini-exército animado sob o estandarte.
	 * @return true se desenhou (o retrato então sai do mapa; o clique fica nas tropas).
	 */
	drawArmy(hero, placement, half, revealed, selected)
	{
		const tribe = g_GameData.tribes[hero.tribe];
		const province = g_GameData.provinces[hero.location];
		const [x, y] = placement.pos;
		const now = this.now;
		const seed = Math.floor(hero.id * 1000) % 997;
		const civ = this.spriteCiv(tribe?.civ);
		if (!civ && !province?.isSea())
			return false;

		// General selecionado: anel dourado no chão, pulsando.
		if (selected)
		{
			const ring = this.take("mapRing");
			if (ring)
			{
				const pulse = 1 + 0.05 * Math.sin(now / 250);
				ring.sprite = "color:255 215 90 210:textureAsMask:campaigns/grand_strategy/fx/ring.png";
				this.place(ring, x, y - half * 0.05, half * 1.75 * pulse, half * 0.7 * pulse);
			}
		}

		// No mar (e sem andar em terra), o exército vai de navio.
		if (province?.isSea() && !placement.moving && (this.sprites.civs.extra || []).indexOf("ship") != -1)
		{
			const ship = this.take("armyFigure");
			if (!ship)
				return false;
			// Metade do tamanho original (era half * 3.0).
			const box = half * 1.5;
			const bob = Math.sin(now / 700 + seed) * half * 0.05;
			ship.sprite = `twArmy_extra_ship_${placement.dir}_${this.sprites.idleFrame}`;
			this.place(ship, x, y + bob - box * 0.38, box, box);
			return true;
		}

		if (!civ)
			return false;
		const available = this.sprites.civs[civ];
		const figures = this.armyFigures(hero, revealed).map(c => available.indexOf(c) != -1 ? c : available[0]);
		const scale = this.sprites.scale || {};
		const spacing = half * 0.62;
		// Fileira em V aberto, de trás para a frente (ordem de desenho).
		const slots = [[-1.25, -0.25], [1.25, -0.25], [-0.62, 0.05], [0.62, 0.05], [0, 0.32]];
		const layout = figures.map((c, i) => ({ "cls": c, "slot": slots[figures.length == 1 ? 4 : i] }));
		layout.sort((a, b) => a.slot[1] - b.slot[1]);

		// Bandeira da tribo atrás do grupo, tremulando.
		const color = (tribe?.color || "200 200 200").split(/\s+/).slice(0, 3).join(" ");
		const flagFrame = Math.floor(now / 150 + seed) % 4;
		const fx = x - spacing * 1.9;
		const fy = y - spacing * 0.35;
		const fw = half * 0.55;
		const fh = half * 0.75;
		const pole = this.take("armyFlagPole");
		const cloth = this.take("armyFlagCloth");
		const shade = this.take("armyFlagShade");
		if (pole && cloth && shade)
		{
			pole.sprite = "stretched:campaigns/grand_strategy/fx/flag_pole.png";
			cloth.sprite = `color:${color} 255:textureAsMask:campaigns/grand_strategy/fx/flag_cloth_${flagFrame}.png`;
			shade.sprite = `stretched:campaigns/grand_strategy/fx/flag_shade_${flagFrame}.png`;
			for (const part of [pole, cloth, shade])
				this.place(part, fx + fw * 0.6, fy - fh, fw, fh);
		}

		layout.forEach((figure, i) => {
			const object = this.take("armyFigure");
			if (!object)
				return;
			const box = half * 0.82 * (12 / (scale[figure.cls] || 12));
			const frame = placement.moving ? (Math.floor(now / 95) + i * 3) % this.sprites.walkFrames :
				this.idleFrame(now, seed + i);
			object.sprite = `twArmy_${civ}_${figure.cls}_${placement.dir}_${frame}`;
			const fx2 = x + figure.slot[0] * spacing;
			const fy2 = y + figure.slot[1] * spacing;
			// Os pés ficam a 88% da altura do quadro.
			this.place(object, fx2, fy2 - box * 0.76, box, box);
		});
		return true;
	}

	/** Parados, de vez em quando um soldado dá uns passos no lugar. */
	idleFrame(now, seed)
	{
		const cycle = (now / 95 + seed * 37) % 160;
		return cycle < 16 ? Math.floor(cycle) % this.sprites.walkFrames : this.sprites.idleFrame;
	}

	// ------------------------------------------------------------ rota

	setHover(code)
	{
		this.hoverProvince = code;
	}

	clearHover(code)
	{
		if (this.hoverProvince == code)
			this.hoverProvince = undefined;
	}

	getPlan(hero, target)
	{
		const key = [hero.id, hero.location, hero.actionsLeft, target, g_GameData.turn].join("|");
		if (!(key in this.planCache))
		{
			if (Object.keys(this.planCache).length > 200)
				this.planCache = {};
			this.planCache[key] = twPlanRoute(hero, target);
		}
		return this.planCache[key];
	}

	renderRoute()
	{
		const hero = g_GameData.playerHero;
		if (!hero || this.menu.windows?.TechTree?.isOpen())
			return;
		const hover = this.hoverProvince;
		let plan;
		let preview = false;
		if (hover !== undefined && hover != hero.location)
		{
			plan = this.getPlan(hero, hover);
			preview = true;
			if (!plan)
			{
				this.drawEnd(this.anchor(hover), "200 70 60", "No route");
				return;
			}
		}
		else if (hero.route?.length)
			plan = { "path": hero.route, "turns": twRouteTurns(hero, hero.route) || hero.route.map(() => 1), "battle": false };
		if (!plan)
			return;

		const start = this.tracks[hero.id]?.pos || this.anchor(hero.location);
		const points = [start].concat(plan.path.map(code => this.anchor(code)));
		const spacing = this.screen(15);
		const phase = (this.now / 900) % 1 * spacing;
		const alpha = preview ? 255 : 170;
		for (let i = 0; i + 1 < points.length; ++i)
		{
			const [x0, y0] = points[i];
			const [x1, y1] = points[i + 1];
			const length = Math.hypot(x1 - x0, y1 - y0);
			const last = i == points.length - 2;
			const color = last && plan.battle ? "235 80 60" : plan.turns[i] == 0 ? "120 230 100" : "245 205 80";
			for (let d = phase; d < length; d += spacing)
			{
				const k = d / length;
				const shadow = this.take("routeDotShadow");
				const dot = this.take("routeDot");
				if (!shadow || !dot)
					break;
				const px = x0 + (x1 - x0) * k;
				const py = y0 + (y1 - y0) * k;
				shadow.sprite = `color:0 0 0 ${Math.round(alpha * 0.6)}:textureAsMask:campaigns/grand_strategy/fx/dot.png`;
				dot.sprite = `color:${color} ${alpha}:textureAsMask:campaigns/grand_strategy/fx/dot.png`;
				this.place(shadow, px, py, this.screen(5), this.screen(5));
				this.place(dot, px, py, this.screen(3.4), this.screen(3.4));
			}
			// Fim de cada turno de marcha: anel com o número do turno.
			if (!last && plan.turns[i + 1] != plan.turns[i])
			{
				const ring = this.take("routeTurn");
				const text = this.take("routeTurnText");
				if (ring && text)
				{
					ring.sprite = `color:${color} 230:textureAsMask:campaigns/grand_strategy/fx/ring.png`;
					this.place(ring, x1, y1, this.screen(11), this.screen(11));
					this.place(text, x1, y1, this.screen(11), this.screen(11));
					text.caption = String(plan.turns[i] + 1);
				}
			}
		}
		const turns = plan.turns[plan.turns.length - 1] + 1;
		const label = !preview ? "Marching" : plan.battle ? "Attack!" :
			turns == 1 ? "This turn" : turns + " turns";
		const endColor = plan.battle ? "235 80 60" : turns == 1 ? "120 230 100" : "245 205 80";
		this.drawEnd(points[points.length - 1], endColor, label);
	}

	drawEnd(pos, color, label)
	{
		const ring = this.take("routeEnd");
		const text = this.take("routeEndText");
		if (!ring || !text)
			return;
		const pulse = 1 + 0.12 * Math.sin(this.now / 180);
		ring.sprite = `color:${color} 255:textureAsMask:campaigns/grand_strategy/fx/ring.png`;
		this.place(ring, pos[0], pos[1], this.screen(15 * pulse), this.screen(15 * pulse));
		text.caption = label;
		text.textcolor = color;
		this.place(text, pos[0], pos[1] - this.screen(26), this.screen(60), this.screen(10));
	}

	// ------------------------------------------------------------ batalhas e cercos

	isShown(code, tribes)
	{
		return this.visible?.has(code) || tribes.indexOf(g_GameData.playerTribe) != -1 ||
			g_GameData.provinces[code]?.ownerTribe == g_GameData.playerTribe;
	}

	smoke(x, y, size, phase, period, alpha = 150)
	{
		const object = this.take("mapSmoke");
		if (!object)
			return;
		const k = ((this.now / period) + phase) % 1;
		const s = size * (0.6 + k * 0.9);
		object.sprite = `color:120 118 115 ${Math.round(alpha * (1 - k) * Math.min(1, k * 5))}:textureAsMask:campaigns/grand_strategy/fx/smoke.png`;
		this.place(object, x + Math.sin(k * 3 + phase * 7) * size * 0.25, y - k * size * 2.2, s, s);
	}

	renderBattles()
	{
		const turn = g_GameData.turn;
		for (const event of g_TWMapEvents)
		{
			if (event.type != "battle" || event.turn < turn - 1)
				continue;
			if (!this.isShown(event.province, [event.attacker, event.defender]))
				continue;
			const marker = this.take("battleMarker");
			if (!marker)
				break;
			const [x, y] = this.anchor(event.province);
			const age = this.now - event.time;
			const pop = age < 700 ? this.easeOutBack(age / 700) : 1 + 0.05 * Math.sin(this.now / 260);
			const half = this.menu.iconSize(11)[0] * pop;
			const seed = event.time % 13;
			for (let k = 0; k < 3; ++k)
				this.smoke(x + (k - 1) * half * 0.6, y - half * 0.4, half * 0.8, k / 3 + seed, 2600);
			marker.sprite = "stretched:campaigns/grand_strategy/fx/swords.png";
			this.place(marker, x, y - half * 1.1, half, half);
			const tribes = [event.attacker, event.defender].map(c => g_GameData.tribes[c]?.getName() || "Natives");
			marker.tooltip = coloredText(event.title, "235 200 120") + "\n" + tribes[0] + " attacked " + tribes[1] +
				" (" + (event.attackerWon ? "attacker" : "defender") + " won).\n" +
				"Losses: " + event.losses[0] + " / " + event.losses[1] + " soldiers.";
			// Batalha recém-travada: anel de impacto.
			if (age < 1500)
				this.ring(x, y, half * (1 + age / 300), Math.round(220 * (1 - age / 1500)), "255 200 120");
		}
	}

	renderSieges()
	{
		for (const code in g_GameData.provinces)
		{
			const province = g_GameData.provinces[code];
			const siege = province.siege;
			if (!siege || !this.isShown(code, [siege.tribe, province.ownerTribe]))
				continue;
			const [x, y] = this.anchor(code);
			const [fx, fy] = this.anchor(siege.from);
			const base = Math.atan2(fy - y, fx - x);
			const radius = this.menu.iconSize(19)[0];
			const tents = 2 + Math.min(2, siege.rams || 0);
			const half = this.menu.iconSize(6)[0];
			for (let i = 0; i < tents; ++i)
			{
				const tent = this.take("siegeTent");
				if (!tent)
					break;
				const angle = base + (i - (tents - 1) / 2) * 0.55;
				tent.sprite = "stretched:campaigns/grand_strategy/fx/tent.png";
				this.place(tent, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.8, half, half);
				tent.tooltip = coloredText("Siege of " + province.getName(), "235 200 120") + "\n" +
					(g_GameData.tribes[siege.tribe]?.getName() || siege.tribe) + ", turn " + siege.turns + ", " +
					(siege.rams || 0) + " rams built" + (siege.turns >= 3 ? "\nThe city is starving." : "");
			}
			// Fome: a cidade queima.
			if (siege.turns >= 3)
			{
				const fire = this.take("siegeFire");
				if (fire)
				{
					const flicker = 1 + 0.12 * Math.sin(this.now / 70 + x) + 0.08 * Math.sin(this.now / 43);
					fire.sprite = "stretched:campaigns/grand_strategy/fx/fire.png";
					this.place(fire, x, y - half * 0.6 * flicker, half * flicker, half * flicker);
				}
				for (let k = 0; k < 2; ++k)
					this.smoke(x, y - half * 1.2, half, k / 2 + x % 1, 3200, 170);
			}
		}
	}

	ring(x, y, size, alpha, color)
	{
		const object = this.take("mapRing");
		if (!object)
			return;
		object.sprite = `color:${color} ${Math.max(0, alpha)}:textureAsMask:campaigns/grand_strategy/fx/ring.png`;
		this.place(object, x, y, size, size);
	}

	easeOutBack(k)
	{
		const c = 1.7;
		return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
	}

	// ------------------------------------------------------------ províncias

	/**
	 * Cor final da província: neve no inverno, transição ao trocar de dono
	 * e realce sob o mouse. `color` = [r, g, b, a].
	 */
	provinceColor(province, color, inLos)
	{
		const code = province.code;
		const now = this.now;
		const owner = province.ownerTribe;
		if (code in this.ownerSeen && this.ownerSeen[code] !== owner && this.lastColor[code])
		{
			this.colorFades[code] = { "from": this.lastColor[code], "start": now };
			if (inLos)
				this.flashes.push({ "code": code, "start": now, "color": color.slice(0, 3).join(" ") });
		}
		this.ownerSeen[code] = owner;

		let result = color.map(Number);
		const snow = this.snowAmount(province);
		if (snow)
		{
			for (let i = 0; i < 3; ++i)
				result[i] = result[i] + (246 - result[i]) * snow;
			result[3] = Math.min(255, result[3] + 90 * snow);
		}
		const fade = this.colorFades[code];
		if (fade)
		{
			const k = (now - fade.start) / 1600;
			if (k >= 1)
				delete this.colorFades[code];
			else
				for (let i = 0; i < 4; ++i)
					result[i] = fade.from[i] + (result[i] - fade.from[i]) * k + (i < 3 ? 120 * Math.sin(k * Math.PI) * (1 - k) : 0);
		}
		if (code == this.hoverProvince && province.data.provinceType != "sea")
			result[3] = Math.min(255, result[3] + 30 + 25 * Math.sin(now / 220));
		result = result.map(v => Math.round(Math.max(0, Math.min(255, v))));
		this.lastColor[code] = result;
		return result;
	}

	renderFlashes()
	{
		this.flashes = this.flashes.filter(flash => this.now - flash.start < 1800);
		for (const flash of this.flashes)
		{
			const k = (this.now - flash.start) / 1800;
			const [x, y] = this.anchor(flash.code);
			this.ring(x, y, this.menu.iconSize(10)[0] * (1 + 4 * k), Math.round(255 * (1 - k)), flash.color);
		}
	}

	// ------------------------------------------------------------ estações, nuvens, comércio

	getSeason()
	{
		return ((g_GameData.turn || 1) - 1) % 4;
	}

	getSeasonName()
	{
		return this.SEASONS[this.getSeason()];
	}

	snowAmount(province)
	{
		if (this.getSeason() != 3 || province.data.provinceType == "sea")
			return 0;
		const types = province.data.mapTypes || [];
		if (types.indexOf("arctic") != -1 || types.indexOf("cold") != -1)
			return 0.6;
		if (types.indexOf("temp") != -1 || types.indexOf("steppe") != -1)
			return 0.3;
		return 0;
	}

	renderSeason()
	{
		const tint = this.take("seasonTint");
		if (tint)
		{
			tint.sprite = "color:" + this.SEASON_TINTS[this.getSeason()];
			tint.size = this.menu.toGUISize(0, 0, this.menu.MAP_WIDTH, this.menu.MAP_HEIGHT);
		}
		const label = Engine.TryGetGUIObjectByName("seasonText");
		if (label)
		{
			label.caption = this.getSeasonName() + ", turn " + g_GameData.turn;
			label.tooltip = this.SEASON_TOOLTIPS[this.getSeason()];
		}
	}

	renderClouds()
	{
		const dt = Math.min(100, this.now - this.lastFrame);
		for (const cloud of this.clouds)
		{
			cloud.x += cloud.speed * dt;
			if (cloud.x - cloud.w > this.menu.MAP_WIDTH)
				cloud.x = -cloud.w;
			const object = this.take("mapCloud");
			if (!object)
				break;
			object.sprite = `color:255 255 255 ${this.getSeason() == 3 ? 110 : 80}:textureAsMask:campaigns/grand_strategy/fx/cloud.png`;
			this.place(object, cloud.x, cloud.y, cloud.w, cloud.w / 2);
		}
	}

	/** Caminho por terra entre duas províncias (cache por turno). */
	landPath(from, to)
	{
		const key = from + "|" + to + "|" + g_GameData.turn;
		if (key in this.pathCache)
			return this.pathCache[key];
		const previous = { [from]: null };
		const queue = [from];
		while (queue.length && !(to in previous))
		{
			const code = queue.shift();
			for (const next of g_GameData.provinces[code]?.getLinks() || [])
				if (!(next in previous) && g_GameData.provinces[next])
				{
					previous[next] = code;
					queue.push(next);
				}
		}
		let path = null;
		if (to in previous)
		{
			path = [];
			for (let code = to; code !== null; code = previous[code])
				path.unshift(code);
			if (path.length > 30)
				path = null;
		}
		this.pathCache[key] = path;
		return path;
	}

	renderCaravans()
	{
		if (this.menu.zoom < this.CARAVAN_MIN_ZOOM || (this.sprites.civs.extra || []).indexOf("trader") == -1)
			return;
		const player = g_GameData.tribes[g_GameData.playerTribe];
		const home = player?.getCapital();
		if (!home)
			return;
		let index = 0;
		for (const other in player.diplo || {})
		{
			if (!player.diplo[other]?.treaties?.trade)
				continue;
			const away = g_GameData.tribes[other]?.getCapital();
			const path = away && this.landPath(home, away);
			if (!path || path.length < 2)
				continue;
			const points = path.map(code => this.anchor(code));
			const lengths = [];
			let total = 0;
			for (let i = 0; i + 1 < points.length; ++i)
			{
				lengths.push(Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]));
				total += lengths[i];
			}
			// Vai e volta: ~0,02 px/ms.
			const period = total / 0.02;
			let k = ((this.now + index * 7919) % (2 * period)) / period;
			if (k > 1)
				k = 2 - k;
			let d = k * total;
			let i = 0;
			while (i < lengths.length - 1 && d > lengths[i])
				d -= lengths[i++];
			const t = lengths[i] ? d / lengths[i] : 0;
			const [x0, y0] = points[i];
			const [x1, y1] = points[i + 1];
			const forward = ((this.now + index * 7919) % (2 * period)) < period;
			const dir = this.direction((x1 - x0) * (forward ? 1 : -1), (y1 - y0) * (forward ? 1 : -1));
			const object = this.take("caravan");
			if (!object)
				break;
			const half = this.menu.iconSize(12)[0] * (12 / (this.sprites.scale?.trader || 12));
			object.sprite = `twArmy_extra_trader_${dir}_${Math.floor(this.now / 110) % this.sprites.walkFrames}`;
			this.place(object, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - half * 0.76, half, half);
			++index;
		}
	}
}

/** Velocidade da marcha no mapa (pixels do mapa por ms) e limites por passo. */
TWMapAnimator.prototype.MOVE_SPEED = 0.14;
TWMapAnimator.prototype.MOVE_MIN_MS = 380;
TWMapAnimator.prototype.MOVE_MAX_MS = 1100;
/** Abaixo deste zoom as caravanas somem (os exércitos aparecem sempre). */
TWMapAnimator.prototype.CARAVAN_MIN_ZOOM = 0.7;
TWMapAnimator.prototype.SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
TWMapAnimator.prototype.SEASON_TINTS = ["120 255 120 6", "255 220 120 14", "255 150 50 20", "190 215 255 34"];
TWMapAnimator.prototype.SEASON_TOOLTIPS = [
	"Spring: four turns make a year.",
	"Summer: four turns make a year.",
	"Autumn: winter is coming.",
	"Winter: snow covers the cold and temperate lands."
];
