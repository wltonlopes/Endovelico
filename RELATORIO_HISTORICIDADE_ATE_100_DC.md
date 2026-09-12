# Relatório de historicidade — teto de 100 d.C.

Data da auditoria: 11 de setembro de 2026. Escopo: civilizações jogáveis, nomes de unidades, estruturas e tecnologias efetivamente definidos em `simulation/`. O critério é estrito: algo só é compatível se sua existência, nome e associação cultural puderem ser situados até 100 d.C. Não trato a abstração mecânica (por exemplo, bônus de ataque) como erro por si; trato como erro um nome, pessoa, instituição, espécie domesticada ou técnica que seja posterior, estrangeira ou sem evidência para a facção.

## Resultado executivo

Há problemas de quatro ordens:

1. **Conteúdo posterior inequívoco:** Dihya (fim do século VII), Endubis (295–310), Sharih Yahdhib II (século IV), Soumaoro (século XIII), a formação histórico-arquitetônica Shona/Grande Zimbábue (a partir do século XI), cavalaria indígena americana e “murderholes” medievais.
2. **Facções cuja forma política/cultural é posterior ou demasiado indeterminada para representar 100 d.C.:** Shona, Sonin/soninquês, Mapuche como rótulo etnopolítico, Tupi/Guarani como lista militar com cavalaria, e alguns agrupamentos modernos amplos (“Bantu”, “Damara”, “Khoi”). Estes últimos não são necessariamente populações inexistentes, mas não são uma civilização delimitada como o jogo as apresenta.
3. **Mistura de culturas por cópia de templates:** nomes gregos, egípcios, japoneses, maias, kushitas, iorubás e indianos aparecem em facções sem conexão demonstrada. Isto é o maior problema de qualidade do texto, mesmo onde a data poderia caber.
4. **Metadados sem valor historiográfico:** diversos arquivos de civilização põem o primeiro `Name` num bônus ou deixam `Name` vazio/`wiki`; isso impede saber qual entidade se pretende representar e dificulta qualquer validação futura.

## Problemas críticos — devem sair ou ser substituídos

| Item no mod | Problema e datação | Localização |
|---|---|---|
| Dihya, “Prophetess of Garamantes” | Dihya/al-Kahina é personagem berbere associada à resistência aos omíadas, no fim do século VII; não pertence aos Garamantes de 100 d.C. | `simulation/templates/units/gara/hero_01.xml` |
| Endubis | O próprio acervo do Met data moeda de Endubis em **295–310**. O rei não pode ser herói de Aksum, Azânia ou Kwa no teto adotado. | `simulation/data/civs/aksum.json`, `azan.json`, `kwa.json` |
| Sharih Yahdhib II | Rei himiarita do século IV, muito posterior ao limite. | `simulation/templates/units/himya/hero_03.xml` |
| Soumaoro | Soumaoro Kanté é ligado à tradição do império de Sosso e à ascensão de Mali, século XIII. | `simulation/templates/units/sonin/hero_01.xml` |
| “Great Zimbabwe”/Shona monumental | A arquitetura e o estado associados a Grande Zimbábue começam no século XI, não em 100 d.C. O pacote Shona usa fortaleza, muralhas de pedra e identidade que evocam esse horizonte. | `simulation/data/civs/shona.json`, `simulation/templates/structures/shona/` |
| Cavalaria Mapuche, Tupi e Guarani | Cavalos não existiam nas Américas antes da invasão europeia; portanto quaisquer unidades classificadas como `cavalry_*`, especialmente o **Ox scout** shona, são impossíveis nessas facções pré-colombianas. | `simulation/templates/units/{mapu,tupi,guara}/cavalry_*.xml`; `simulation/templates/units/shona/jav_saga.xml` |
| “Murderholes” | Ameias com mata-cães/murder holes são elemento de fortificação medieval, não de 100 d.C. | `simulation/data/technologies/nomads/range_defensive_murderholes.json`, referido por fortalezas xion e yuez |

## Problemas graves de facção e cronologia

- **Aksum (`aksum`)**: pode ser mantida somente com cautela — há ocupação e comércio na virada da era, mas os marcos monumentais e o império bem documentado são sobretudo dos séculos III–IV. Endubis deve ser removido; “Aksumite assimilation” e guarda/monumentos devem ser reavaliados para uma versão pré-100, ou a facção deve ser deslocada para c. 300.
- **Azânia (`azan`) e Kwa (`kwa`)**: “Azania” é, em fontes antigas, sobretudo um topônimo/trecho da costa, não uma civilização unitária estabelecida. Ambos reutilizam a lista axumita (Zoskales, Sembrouthes e Endubis), e Zoskales é normalmente colocado no século II, Sembrouthes no III. Não são defensáveis como estados de 100 d.C. sem uma redefinição arqueológica local.
- **Himyar (`himya`)**: o reino começa antes de 100 d.C., logo a facção é potencialmente válida; porém Sharih Yahdhib II deve sair. Também há vocabulário indiano (`Vaishya`, `Dhanurdhar`, `Kauntika`, `Khadagdhari`, `Ashwarohi`) aplicado como se fosse himiarita, o que é associação cultural indevida.
- **Sonin (`sonin`)**: a listagem inclui Soumaoro e termos ligados à África Ocidental medieval; não deve representar o povo soninquê/Império de Gana em 100. Substituir por uma comunidade arqueológica explicitamente datada ou retirar do recorte.
- **Shona (`shona`)**: além da cronologia estatal tardia, os arquivos chamam aldeão de “Kushite”, batedor de “Urewe” e curandeiro de `Babalawo` (iorubá). É uma facção montada por cópia, não uma reconstrução Shona do período.
- **Mapuche (`mapu`)**: populações ancestrais existem antes do corte, mas os cargos e a etnogênese “Mapuche” precisam de fundamentação específica. A facção contém cavalaria e léxico japonês; não pode ser aprovada como está.
- **Tupi/Guarani (`tupi`, `guara`)**: ocupações e línguas Tupi-Guarani são pré-coloniais, mas a lista de cavalaria é eliminatória. Também há `Ajaw` (título maia) em catafalcos e termos misturados entre Tupi/Guarani.
- **Moche (`moch`)**: é caso limítrofe, pois o desenvolvimento Moche costuma começar por volta de 100 d.C. Não é “erro” se o marco inicial for exatamente 100, mas não cabe se o jogo quiser retratar todo o período anterior. Deve ser rotulada “c. 100–700 d.C.” e não usada em cenários anteriores.
- **Swift Creek (`swcr`)**: também é limítrofe; a tradição inicia aproximadamente em 100 d.C. Deve entrar apenas no limite final, não como civilização anterior.
- **Malaio, Pyu, Viet, Yawadwipa, Suvarnabhumi/Mon e Vyadhapura**: exigem dossier individual antes de aprovação. Seus nomes frequentemente designam etnias modernas, regiões, reinos de data posterior ou tradições cuja datação inicial é discutida; não devem receber castelos, palácios, heróis nomeados ou tecnologias posteriores por padrão.

## Misturas culturais verificadas nos nomes

| Facção | Evidência no repositório | Por que é problema |
|---|---|---|
| Garamantes | `Gýnē Athēnaía`, `Iatrós`, `Ékdromos Skirítēs`, `Asklēpieîon`, `Empórios`, `Oîkos` | Grego ateniense/espartano em população berbere saariana; comércio mediterrânico não torna esses nomes garamantes. |
| Mapuche | `Miya`, `Yagura`, `Kado`, `Takumiya`, `Ituki nö Miya`, `Yōng`, `Lepun` | A maioria é japonesa; `lepun` é plausível mapuche, mas a arquitetura inteira é nomeada como japonesa. |
| Puka/Pucará | `Asklēpieîon`, `Empórios`, `Sitobólion`, `Apothḗkē`, `Pyrgíon`, `Pýlai`, além de `Pr-ỉwn n ms` egípcio | Grego e egípcio não são nomenclatura pucará. |
| Ural | `Oîkos`, `Agrós`, `Khalkeṓn` | Grego aplicado a povoamentos urálicos. |
| Aksum/Azânia | egípcio (`Pdty Nhsyw`, `iry-rdwy Nhsyw`, `wʿb nsw`), índico (`Vachii Gaja`) e “Egyptian War Boat” | Cópia de Kush/Egito/Índia; cada empréstimo exigiria evidência e rótulo de mercenário, não identidade básica. |
| Shona | “Kushite Villager”, `Pdty Nhsyw`, `iry-rdwy Nhsyw`, `Babalawo`, “Urewe Scout” | Egito/Kush, iorubá e África Oriental foram misturados sem relação. |
| Maya, Tupi e Guarani | `Ajaw` aparece nos catafalcos Tupi/Guarani; Tupi/Guarani usam nomes e navios que atravessam as três facções | `Ajaw` é título maia; deve permanecer somente onde comprovado para a língua maia. |
| Himyar | `Vaishya`, `Dhanurdhar`, `Kauntika`, `Khadagdhari`, `Ashwarohi` | Termos indo-arianos não devem nomear soldados himiaritas nativos. |

## Estruturas, unidades e tecnologias a rever sistematicamente

- **Cavalaria e estábulos nas Américas**: varrer todos os diretórios americanos por `cavalry_`, `stable`, `corral` e montarias. Cavalaria pode ser uma classe mecânica só se o ator deixar explícito que é infantaria; atualmente os nomes e modelos sugerem cavalo/boi.
- **Arquitetura universal “fortress/palace/arsenal”**: não é automaticamente errada, mas para sociedades sem evidência de tais instituições em 100 d.C. deve receber nome neutro (`recinto`, `casa comunal`, `depósito`) ou ser removida. Prioridade: Shona, Tupi, Guarani, Mapuche, Paiute, Adena e grupos de caçadores-coletores.
- **Cerco pesado**: aríete, torre de cerco, balistas e “advanced siege” distribuídos a civilizações americanas, saarianas e de caçadores-coletores requerem prova independente. Não basta herdar o template de 0 A.D.
- **Longbowman himiarita**: o nome inglês descreve um tipo associado à Europa medieval; trocar por “arqueiro” até haver evidência de arco longo específico na Arábia do Sul.
- **Tecnologias com nomes impróprios**: `Korean Mercenary Company` não deve ser opção genérica; `Water Walls_prov`, `Military Slaves_prov`, `Parthian Shot_prov` e nomes com `_prov` são rascunhos que precisam ser renomeados ou retirados da UI. `antropagia_ritual.json` se chama “Beekeeping”, evidência de cópia errada, não de conteúdo histórico confiável.
- **“Periplus Maris Erythraei”**: a obra é normalmente datada do século I d.C.; é admissível no limite, mas apenas para uma facção costeira/red-maritima e sem usar dados posteriores do texto como se já fossem do ano 100.

## Itens que podem permanecer, com a data correta

- Estados mediterrânicos e próximos (Roma republicana/alto-imperial, cartagineses, helenísticos, númidas, nabateus, judeus hasmoneus até 37 a.C., partas/arsácidas, xiongnu, Han, Yayoi e Gojoseon até 108 a.C.) são, em princípio, compatíveis — é preciso validar cada herói e tecnologia, não excluí-los pelo nome da civ.
- Garamantes, Urewe, Nok, Pucará, Adena, Anuradhapura, Meroítas/Kush e diversas sociedades americanas pré-colombianas têm presença anterior a 100 d.C. A validade da **população** não valida os ativos copiados de outras regiões.
- Aksum e Himyar exigem versionamento cronológico, não exclusão automática: o primeiro deve ser pré-imperial sem Endubis; o segundo deve perder o rei do século IV.

## Prioridade de correção

1. Remover/substituir as seis ocorrências inequívocas: Dihya, Endubis, Sharih Yahdhib II, Soumaoro, cavalaria americana/boi e murderholes.
2. Bloquear temporariamente Shona, Sonin, Azan e Kwa nos cenários “até 100” até haver definição histórica e lista própria.
3. Corrigir os nomes transplantados listados acima, começando por Mapuche, Pucará, Garamantes, Aksum/Azânia e Shona.
4. Definir para cada civ um intervalo de datas, área, endônimo/exônimo e três fontes; só depois desenhar heróis, edifícios e tecnologias.
5. Separar “mecânica genérica de 0 A.D.” de conteúdo histórico: um template herdado deve ter nome e descrição locais ou ficar oculto da UI.

## Referências de controle

- Metropolitan Museum of Art, [*Africa & Byzantium*](https://www.metmuseum.org/it/exhibitions/africa-byzantium/exhibition-objects): moeda de Endybis/Endubis datada em 295–310.
- Metropolitan Museum of Art, [*Monumental Architecture of the Aksumite Empire*](https://www.metmuseum.org/fr/essays/monumental-architecture-and-stelae-of-the-aksumite-empire): florescimento e monumentalidade axumita documentados sobretudo a partir do século III.
- Metropolitan Museum of Art, [*Great Zimbabwe (11th–15th Century)*](https://www.metmuseum.org/pt/essays/great-zimbabwe-11th-15th-century): início no século XI por ancestrais Bantu dos Shona.
- Universidade do Colorado, [*Hoof Beats: Horses in the North American West*](https://www.colorado.edu/cumuseum/horses-north-american-west): cavalos foram reintroduzidos nas Américas por colonizadores espanhóis no século XVI; portanto não há cavalaria indígena em 100 d.C.
- UNESCO, [*General History of Africa IV*](https://unesdoc.unesco.org/in/rest/annotationSVC/DownloadWatermarkedAttachment/attach_import_393a67e4-60c1-4324-9a70-b2682fe54680?_=184287engo.pdf): situa Sumaguru/Soumaoro Kanté no horizonte dos séculos XII–XIII.
- A informação de Dihya, Sharih Yahdhib II, Soumaoro, Zoskales e Sembrouthes deve ser conferida contra fontes acadêmicas antes da substituição nominal; o diagnóstico cronológico aqui é suficiente para removê-los provisoriamente do corte de 100 d.C.

## Limites desta auditoria

Este relatório aponta todos os problemas encontrados por inspeção de nomes e definições acessíveis no repositório, mas **não afirma que todo template não citado seja historicamente correto**. Modelos `.dae`, texturas e referências externas não foram datados visualmente um a um; uma segunda etapa deve comparar vestuário, armas, animais e arquitetura a catálogos arqueológicos por facção.
