class EventPanel
{
	constructor()
	{
		this.panel = Engine.GetGUIObjectByName("eventPanel");
		this.desc = Engine.GetGUIObjectByName("eventPanelDesc");
		this.buttons = [0, 1].map(i => Engine.GetGUIObjectByName(`eventPanelButton[${i}]`)).filter(Boolean);
	}

	/**
	 * @return whether an event was rendered.
	 */
	renderEvents(turnEvents)
	{
		for (const ev of turnEvents)
		{
			if (ev.processed)
				continue;
			if (!ev.needUserInput())
				continue;
			return this.render(ev);
		}
		return this.render();
	}

	render(event)
	{
		if (!event)
		{
			this.panel.hidden = true;
			return false;
		}
		this.panel.hidden = false;
		const buttonData = event.setupPanel(this.desc, this.buttons) || [];
		if (!Array.isArray(buttonData) || !buttonData.length)
		{
			// Sane default.
			this.desc.caption = event.getTickerText() ?? "";
			this.buttons.forEach((button, idx) => {
				if (!button)
					return;
				button.hidden = idx !== 0;
				button.caption = idx === 0 ? "OK" : "";
				button.size = idx === 0 ? "100%-300 0 100% 100%" : "0 0 0 0";
				button.enabled = idx === 0;
				button.onPress = () => {
					g_GameData.markEventProcessed(event.id);
				};
			});
			return true;
		}
		const nb = buttonData.length;
		for (let i = 0; i < this.buttons.length; ++i)
		{
			const button = this.buttons[i];
			if (!button)
				continue;
			button.hidden = i >= nb;
			if (i >= nb)
				continue;
			const data = buttonData[i];
			button.caption = data.caption || "";
			button.tooltip = data.tooltip || "";
			button.onPress = () => {
				g_GameData.markEventProcessed(event.id);
				data.action?.();
			};
			button.size = `${Math.round(i * (100.0 / nb))}%+4 0 ${Math.round((i + 1) * (100.0 / nb))}%-4 100%`;
			button.hidden = false;
			button.enabled = true;
		}
		return true;
	}
}
