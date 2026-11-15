/**
 * Compatibilidade entre Alpha 26-28 e Alpha 29.
 * Substitui SwitchGuiPage().
 */
function SwitchGuiPage(page, data = {})
{
	// Se estivermos dentro de uma página que pode ser fechada,
	// utiliza o novo sistema de navegação.
	if (typeof closePageCallback == "function")
	{
		closePageCallback({
			[Engine.openRequest]: {
				"page": page,
				"data": data
			}
		});
		return;
	}

	// Caso contrário, apenas devolve a requisição.
	return {
		[Engine.openRequest]: {
			"page": page,
			"data": data
		}
	};
}