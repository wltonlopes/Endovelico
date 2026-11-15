# Total Warfield (0 A.D. 0.29)

Campanha estratégica por turnos no mapa-múndi (províncias, cidades que crescem, construções, tecnologia, diplomacia) com batalhas em tempo real entre exércitos organizados em **batalhões**. Na primeira versão usa só as 15 civilizações do jogo base. O mod funciona sozinho, com `public` apenas: pasta `0ad_total_warfield`, nome interno `total_warfield`.

- **Campanha:** menu principal → Campaigns → *Total Warfield*.
- **Batalha avulsa:** partida comum, mapa aleatório *Field Battle*. Cada lado recebe um exército aleatório da sua civilização, e a IA escolhida é comandada pelo diretor de batalha.

## Como se joga

**Mapa em blocos** (`tools/map/build_campaign_map.py`):
- **Fonte:** a arte original (`tools/map/source/campaign_map.png`, 4096×2048) e os contornos do `provinces.geojson`. Quem tem a arte pintada em resolução maior troca a fonte e roda o script de novo.
- **O que ele gera:** uma visão geral em 4096 para o zoom afastado; 32 blocos de 1024×1024 em 2x (8192×4096), com ampliação Lanczos e nitidez, feita na CPU; e bordas entre províncias como uma linha só e suave, desenhada já na resolução alta (o litoral fica como está na arte).
- **Na página:** a partir do zoom 1,1x aparecem só os blocos que estão na tela, e o zoom máximo vai a 4x.
- **Máscaras das províncias:** refeitas em 2x a partir dos contornos suavizados.
- **Compressão:** as texturas do mapa usam DXT1 com mipmaps (o jogo converte uma vez para o cache). A camada `world_map.png`, que ficava escondida embaixo da outra, foi removida.
- **Desempenho:** a geração leva cerca de 10 minutos num notebook. No jogo, o custo é o de uma textura de 4096 mais os poucos blocos visíveis.

**Mapa de campanha** (herdado do `grand_strategy` do Endovelico, que veio do mod de wraitii):
- **Estandartes dos generais** (só para civs sem os sprites do mapa animado; veja abaixo) (`tools/art/gen_general_tokens.py` gera as texturas):
  - retrato redondo num anel da cor da tribo;
  - halo dourado no general selecionado;
  - selo com o número de soldados (estimativa, para inimigos longe dos seus generais);
  - estrelas pela experiência média do exército;
  - tamanho que cresce com o exército;
  - generais na mesma província lado a lado;
  - tooltip com a ficha do general.
- **Mapa animado** (`gui/campaigns/grand_strategy/MapAnimator.js`):
  - os generais marcham de província em província, inclusive os da IA ao fim do turno, em vez de pular;
  - cada exército aparece no mapa só como um mini-exército animado da civ, sem o retrato do general (o retrato fica no painel do general): até 5 soldados (infantaria, atiradores e cavalaria conforme os batalhões), andando na direção da marcha, e a bandeira da tribo tremulando. Clicar nas tropas seleciona o general (ou mostra o inimigo), e o tooltip traz o resumo do exército. O general selecionado tem um anel dourado no chão. Os inimigos longe dos seus generais mostram só infantaria. No mar, o exército vai de navio. Uma civ sem sprites gerados volta a usar o estandarte com retrato;
  - **rotas de vários turnos:** com o general selecionado, passar o mouse numa província mostra a rota pontilhada (verde neste turno, amarelo nos próximos com o número do turno, vermelho se termina em batalha). No botão direito, *March here (N turns)* dá a ordem, e o general segue sozinho nos turnos seguintes. A mesma ordem no destino cancela a marcha. A marcha para se o caminho fechar (paz, general inimigo no meio, navegação);
  - batalhas deixam espadas cruzadas com fumaça até o fim do turno seguinte (o tooltip mostra o resultado);
  - cercos montam tendas (mais tendas com mais aríetes), e a cidade faminta pega fogo;
  - a província conquistada muda de cor aos poucos, com um anel de luz;
  - estações do ano (4 turnos por ano), com neve no inverno nas terras frias e temperadas;
  - nuvens passando e caravanas nas rotas de comércio do jogador;
  - realce da província sob o mouse.
- **Generais** comandam exércitos de até 12 batalhões. Recrutamento em *Army and Recruitment*, com o general numa província própria. A janela mostra os retratos dos batalhões (soldados, barra de força, estrelas de nível) e das unidades recrutáveis (custo; indisponíveis em cinza, com o motivo no tooltip). Duplo clique ou botão direito recruta direto. Cada batalhão custa ouro e população da província, e cobra manutenção por turno. Em território próprio os batalhões repõem as baixas a cada turno (pagando). Sem dinheiro, há deserção.
- **Cidades** (estilo Civilization): a população cresce conforme felicidade, fazendas e capital, e define o nível do assentamento: *Village → Town (2500) → City (6000)*, os equivalentes das fases do 0 A.D. O nível libera construções e unidades: campeões exigem cidade e as construções da tabela.
- **Construções** (`campaigns/grand_strategy/data/province_buildings.json`): quartel, campo de tiro, estábulo, estábulo de elefantes, mercado (mercenários), oficina de cerco (aríetes, catapultas, balistas, torres) e fortaleza (campeões) liberam batalhões. A paliçada e as muralhas de pedra (que exigem a paliçada) aparecem na batalha. Fazendas aumentam o crescimento, templos a ordem, e muralhas e torres a defesa e a guarnição.
- **Batalha:** atacar uma província vizinha em guerra (ou sem dono, com nativos) ou entrar onde há um general inimigo abre a janela de batalha:
  - *Command the battle* abre a batalha de campo com os mesmos batalhões, cada um com seus soldados e sua experiência;
  - *Auto-resolve* decide na hora, pela força (soldados, ataque, vida, armadura, nível, general, defesas);
  - *Withdraw* cancela.
  
  Sobreviventes, experiência, morte de generais e a conquista voltam para a campanha.
- **Cerco:** contra uma cidade murada, a janela de batalha oferece *Lay siege*. A cada turno o exército constrói um aríete (até 4); a partir do 3º turno a cidade passa fome e perde um batalhão da guarnição por turno; sem guarnição nem general, ela se rende. Atacar de novo assalta com os aríetes já feitos. Sem máquinas de cerco, a muralha de pedra dá +60% ao defensor na resolução automática.
- **Destino da conquista** (`game/Conquest.js`): toda vitória do jogador como atacante entrega a província (os generais inimigos que estavam nela recuam; sem terra para onde ir, o exército deles se dispersa). As três opções aparecem sempre, no mapa da campanha, logo depois do relatório da batalha (nunca dentro da batalha). O turno só avança depois da escolha.
  - *Ocupar*: anexa a província, com um saque pequeno.
  - *Saquear*: fica com ela e leva muito ouro, mas a cidade perde 40% da população e cerca de metade das construções, fica à beira da revolta, e as outras nações passam a gostar menos de você.
  - *Vassalo*:
    - na capital de uma nação, a capital é devolvida e a nação inteira vira vassala; ela entrega metade do tesouro na hora;
    - em qualquer outra província, ou na terra de nativos, um governante local assume como Estado cliente ("Principality of ..."), na cor do senhor clareada e em guerra com o antigo dono.
    
    O vassalo fica aliado e em paz permanente e paga 30% da renda por turno. Um vassalo bem mais forte que o senhor pode se rebelar.

  A IA também escolhe: às vezes saqueia e às vezes vassaliza capitais.
- **IA:**
  - recruta e constrói;
  - sitia cidades muradas quando não tem máquinas, e assalta quando já tem aríetes;
  - leva os generais pela própria terra até a fronteira;
  - ataca vizinhos em guerra e terras sem dono;
  - declara guerra a vizinhos fracos.
  
  Ataques ao jogador viram um evento em que ele escolhe lutar ou resolver.
- **Diplomacia:** além de aliança, comércio, pacto de não agressão, paz e guerra, há o **tratado de acesso militar** (menu de contexto de uma província estrangeira: *Propose Military Access* / *Revoke Military Access*). Com ele, os exércitos dos dois povos atravessam as províncias um do outro sem lutar; aliados e vassalos também dão passagem. Sem guerra nem passagem, terra alheia é fechada. Generais de povos que não estão em guerra podem dividir a província (a batalha é só contra quem está em guerra). A IA propõe e aceita acesso conforme a opinião e a confiança, e marcha pelas terras com passagem até a frente. Romper aliança, comércio, pacto ou acesso desfaz o tratado dos dois lados e baixa a opinião do outro povo; a guerra desfaz todos.
- **Culturas nativas** das províncias que não são civs carregadas usam uma civ do jogo base equivalente (`campaigns/grand_strategy/data/civ_fallback.json`).

**Batalha de campo** (`maps/random/tw_battlefield.js` + `maps/scripts/TWFieldBattle.js`):
- Sem bases nem economia. O jogador é o lado sul. O desdobramento segue a formação clássica: atiradores à frente, linha principal com a cavalaria nas pontas, reserva atrás e o general atrás do centro.
- O terreno vem da província: planície, floresta, colinas, rio com vaus, costa, desfiladeiro ou deserto. O defensor de uma vila ou cidade ganha um assentamento com centro cívico, torres e casas. Se o centro cívico for tomado, o defensor perde.
- **Batalhões** (`simulation/components/Battalion*.js`):
  - seleção, ordens e posturas valem para o batalhão inteiro (normal, linha, coluna, aberta);
  - as fileiras giram com a direção do batalhão; mover vários batalhões juntos os espalha lado a lado em linha;
  - o batalhão luta junto, cada soldado contra um alvo diferente do batalhão inimigo;
  - se o líder morre, outro soldado assume.
- **Muralhas na batalha:** o defensor de uma cidade com paliçada ou muralha fica dentro de um anel de muralha (torres, muros, portão virado para o atacante e outro atrás), montado com o conjunto de muralha da civ. Máquinas de cerco entram como unidades avulsas atrás da linha. O diretor da IA, atacando, manda os aríetes ao portão e as catapultas aos muros, enquanto a infantaria espera a brecha. Defendendo, ele espera dentro dos muros até o inimigo entrar.
- **Carga** (`mixins/tw_charge_*.xml`): cavalaria de choque, elefantes e infantaria pesada de choque (campeões corpo a corpo, espadachins, machadeiros, maceiros) atacando um batalhão a 15–90 m disparam a carga: correm, dão grito de guerra, o primeiro choque bate com dano extra (1,8x cavalaria, 1,45x infantaria) e derruba o moral do alvo (mais pelo flanco e pela retaguarda). Lanceiros e piqueiros (`mixins/tw_brace.xml`) atingidos pela frente seguram a carga: quem carregou perde o bônus e o moral. Recarga de 15 s.
- **Indicação visual** (sombreamento dos modelos do batalhão inteiro): dourado na carga, vermelho piscando ao receber o choque, azul ao segurar a carga com lanças, cinza em fuga. O painel do batalhão mostra "Charging!", se ele faz carga e se segura carga.
- **Soldados resistentes** (`mixins/tw_tough_*.xml`): os soldados de batalhão têm 2,2x (infantaria) ou 2x (montados) a vida normal e +1 de armadura; o moral cai pela fração da vida que cada golpe tira. As batalhas duram cerca de 1,5 a 2x mais.
- **Cidades na batalha:** o defensor de um assentamento ganha uma cidade da própria civ. O centro cívico fica atrás do exército; em anéis em volta dele vão as construções que a província tem na campanha (quartel, mercado, templo, fortaleza, fazendas com campos, oficina de cerco...) e casas, conforme o nível (aldeia, vila ou cidade). Ruas até os portões e a praça do exército ficam livres, e cada prédio só fica onde o jogo aceitaria construí-lo. Sem muralha, torres guardam a frente.
- **Sem construção na batalha:** os soldados dos batalhões não constroem nem coletam (`Builder` e `ResourceGatherer` desligados nos mixins).
- **Punhal:** atiradores a pé com um inimigo a até 5 m sacam a faca. Eles usam o ataque `Slaughter`, que tem animação de faca em todos os atores, com dano fraco (`mixins/tw_dagger.xml`, `components/ZZ_TWDagger.js`), e voltam ao arco quando o inimigo se afasta a mais de 10 m. Atiradores atingidos em corpo a corpo perdem moral 2,5x mais rápido.
- **Moral:**
  - cai com golpes (1,5x pelo flanco, 2,5x pela retaguarda), baixas, carga de cavalaria, morte do líder e aliados fugindo por perto;
  - sobe sem combate, mais rápido perto do general;
  - na primeira fuga o batalhão recua para o acampamento e pode se reagrupar;
  - destroçado (segunda fuga) corre para a borda do seu lado e sai do campo; 60–90% dos soldados que escapam voltam ao exército na campanha;
  - cada fuga baixa o moral máximo.
  
  Os níveis de experiência dão ataque, armadura e firmeza.
- **Vitória:** um lado sem nenhuma tropa viva (batalhões, general, máquinas, soldados soltos) perde na hora. Quando um lado fica alguns segundos sem nenhum batalhão em condição de lutar, o exército dele inteiro (general incluído) foge para a borda. O vencedor pode persegui-lo. Quem sai do campo volta em parte; quem é alcançado morre, e os que continuam no campo após 60 s são pegos (só 25% sobrevivem). Só então a batalha acaba. A campanha joga sem as condições de vitória do jogo: o trigger declara vencedor e vencido.
- **Fim da batalha:** quando todos os batalhões inimigos desistem, aparece a mensagem de vitória com duas opções: **End the battle** (os que fogem escapam e voltam em parte) ou **Pursue** (persegue por mais 60 s; sem resposta, persegue). Quando a batalha acaba, uma caixa só (**Return to Campaign Map**) fecha a partida e volta ao mapa, onde vêm o relatório e o destino da província.
- **Moral dobrado:** `MORALE_RESILIENCE = 2` em `BattalionTactics.js` divide toda perda de moral; as batalhas ficam bem mais longas.
- **Acompanhantes** (`mixins/tw_battalion_attachment.xml`, `units/<civ>/tw/att_<tipo>`): comprados na janela do exército por batalhão, entram na batalha junto dele e mudam o moral:
  - **Priest** (curandeiro/sacerdote da civ, precisa de Templo na província): perde menos moral e se recupera mais rápido;
  - **High Priest** (sacerdote campeão, ex.: a vidente germânica; Templo e Cidade): moral máximo +10, perde bem menos moral e se recupera mais rápido;
  - **Musician** (trompeteiro, tocador): recuperação rápida e carga mais forte;
  - **Standard Bearer** (porta-estandarte, se a civ tiver): moral máximo +15, perde menos moral e carrega um pouco mais forte.
  
  Só existem para as civs que têm essas unidades. Cada um aumenta a força estimada do batalhão (6%) e tem custo de manutenção. Morrem com o batalhão; quem escapa leva o acompanhante.
- **Treino parado:** um general que passa o turno inteiro numa província própria treina o exército (+30 xp por batalhão e por turno, 60 com quartel ou fortaleza, até 450). A janela do exército mostra "Drilling".
- **Formações culturais** (`<BattalionTactics><Formations>` gerado por `cultural_formations` no gerador), somadas às posturas normais:
  - **Wedge** (cunha): toda a cavalaria de choque; carga mais forte, flancos fracos;
  - **Phalanx** (falange): lanceiros e piqueiros gregos, macedônios, helenísticos e cartagineses; armadura frontal e segura carga;
  - **Syntagma**: piqueiros helenísticos (Macedônia, Selêucidas, Ptolomeus, Épiro, Báctria, Bósforo); quadrado de 16 fileiras, muito firme e lento;
  - **Testudo**: espadachins romanos; quase imunes a projéteis, sem carga;
  - **Shield Wall** (muralha de escudos): infantaria germânica, sueva, britânica, gaulesa e dácia; segura carga e protege de flechas;
  - **Crane Wing**, **Fish Scale**, **Volley Ranks**: Han, Goguryeo e Minyue (cavalaria em asa de grou, infantaria em escamas de peixe, besteiros em fileiras de salva).
  
  A IA escolhe a formação da cultura ao desdobrar e passa para a testudo sob projéteis.
- **Furtividade** (`mixins/tw_stealth.xml`, `components/ZZ_TWStealth.js`): atiradores a pé e guerrilheiros (ex.: os lusitanos) parados sob a copa das árvores (3 ou mais árvores a até 14 m) ou num ponto alto (6 m acima do entorno) somem da vista do inimigo. Reaparecem ao atacar, ao se mover, com um inimigo a menos de 30 m ou depois de 90 s escondidos (e só voltam a sumir 45 s depois). Ninguém se esconde com o exército em fuga ou quando só restam tropas furtivas, para a batalha sempre poder acabar. Escondidos, não atacam sozinhos (ficam em "standground"), e a IA não os vê nem mira neles.
- **Fim decisivo:** um lado com 25% dos soldados ou menos, diante de pelo menos o dobro, debanda. Depois de já ter havido luta, 45 s sem nenhum golpe fazem debandar o lado que perdeu 30% e tem 1,5x menos soldados. Assim a batalha não fica parada esperando o último batalhão (atrás dos muros, no acampamento ou longe).
- **IA (diretor):** espera o desdobramento, avança em linha, carrega de perto, mantém os atiradores atrás e flanqueia com a cavalaria. A IA Petra fica sem efeito nos lados do diretor (`simulation/helpers/ZZ_TWCommands.js`), porque sem base ela dá ordens sem sentido.

**Combate naval** (`maps/random/tw_naval.js` + `maps/scripts/TWNavalBattle.js`):
- **Esquadras:** cada civ recruta no **Porto** os seus navios de guerra (flecheiro, aríete, batedor, incendiário; de cerco só em Cidade) e o mercante, que serve de transporte. Cada esquadra tem 3 navios de guerra ou 2 transportes, e entra no exército como um batalhão (força = navios). Os navios têm 3x a vida normal (`mixins/tw_ship.xml`). Em terra as esquadras não lutam.
- **Encontros no mar:** quando generais em guerra se encontram numa província de mar, a batalha é naval:
  - só as esquadras lutam;
  - as tropas embarcadas ajudam um pouco na abordagem e afogam com os navios afundados (até 50% da proporção perdida para o vencedor e 80% para o vencido);
  - quem vai ao mar sem navios de guerra viaja em mercantes (um para cada 4 batalhões); os povos sem porto alugam os de outra civ.
- **Batalha jogada:** mar aberto com ilhotas e rochedos. As esquadras desdobram em fileiras, com os transportes atrás. A IA ataca com cada navio o inimigo mais próximo.
  - Um lado sem navios perde.
  - Uma frota reduzida a 35% diante de 1,5x mais navios debanda e foge para a borda do seu lado. Também debanda, depois de 50 s sem dano, a frota que perdeu 30% e tem menos navios.
  - O vencedor escolhe encerrar ou perseguir, como em terra. Os navios que escapam pela borda voltam à campanha.

## Estrutura

| Pasta / arquivo | O quê |
|---|---|
| `tools/gen_battalions.py` | Gera, para cada civ, os templates de batalhão (`simulation/templates/units/<civ>/tw/`) e a lista da campanha (`simulation/data/total_warfield/rosters/<civ>.json`) a partir das unidades que as construções da civ treinam. Não sobrescreve arquivos editados à mão (`tools/generated_manifest.json`; `--force` sobrescreve). |
| `tools/tw_templates.py` | Leitor de templates do 0 A.D. (herança `a\|b\|c`, mixins, `disable`, `replace`, `tokens`, `op`). |
| `simulation/templates/mixins/tw_battalion_*.xml` | Líder, soldado, moral de infantaria e de montados. |
| `simulation/components/` | `BattalionLeader`, `BattalionMember`, `BattalionTactics`, patches `ZZ_TW*` (GUI e experiência). |
| `simulation/helpers/ZZ_TWCommands.js` | Comandos com batalhões, sem substituir o `Commands.js` do jogo. |
| `gui/session/tw_*.js` | Seleção por batalhão, posturas, detalhes (soldados, moral, nível) e placar da batalha. |
| `gamesettings/attributes/TotalWarfield.js` | Leva a configuração da batalha para `InitAttributes.settings.TotalWarfield`. |
| `tools/art/gen_army_sprites.py` | Renderiza os mini-exércitos do mapa direto da arte do `public.zip`. O zip só traz os arquivos compilados: `actor_render.py` resolve o ator (variantes, props, texturas, cor do jogador) e `zeroad_formats.py` lê malhas `.pmd`, animações `.psa` e texturas `.dds`. Gera atlas de 8 direções x 9 quadros por civ e classe em `art/textures/ui/campaigns/grand_strategy/army/`, além de `gui/campaigns/grand_strategy/army_sprites.xml` e `campaigns/grand_strategy/data/army_sprites.json`. Use `--extras` para o navio e a caravana. Leva uns 2 minutos por civ. |
| `tools/art/gen_map_fx.py` | Arte dos efeitos do mapa (trilha, espadas, fumaça, fogo, tenda, bandeira, nuvem) em `.../fx/`. |
| `gui/campaigns/grand_strategy/` | Campanha. Regras novas em `game/Warfield.js` (exércitos), `game/Battle.js` (batalhas) e `game/Routes.js` (marcha de vários turnos e registro de movimentos e batalhas para o mapa); janelas `windows/ArmyWindow.js` e `windows/BattleWindow.js`. |
| `campaigns/grand_strategy/` | Dados: províncias (geojson), tribos das 15 civs, tipos de mapa, heróis, tecnologias, construções, civs substitutas. |

Todos os caminhos da campanha usam `total_warfield` (e não `grand_strategy`), para não colidir com o Endovelico ou o Mars Wars quando estiverem carregados juntos.

## Testes (sem abrir o jogo)

- `sh tools/test/battletest.sh [segundos]`: batalha de campo headless entre duas IAs, com censo a cada 15 s e o resultado devolvido à campanha. Variáveis:
  - `TW_CIV1` e `TW_CIV2` escolhem as civs;
  - `TW_SETTINGS=<json>` usa uma configuração de batalha montada pela campanha.
  
  O censo mostra fugas, quem escapou, quantos estão de faca, cargas (feitas, choques, seguradas), peças de muralha de pé e máquinas de cerco. Para cercos e cargas, monte um `TW_SETTINGS` à mão (exércitos, `settlement` com `walls`). Nunca rode dois testes ao mesmo tempo (o log é o mesmo).
- Batalha de um save de verdade: `gjs tools/test/campaign_pending.js tools/test/campaign_sim.js "$PWD" <public extraído> <save>.0adcampaign saida.json` monta a batalha pendente do save; depois `TW_SETTINGS=` (só a chave `settings`) no `battletest.sh`. Outras variáveis do `battletest.sh`:
  - `TW_VISUAL=1` abre a janela (a interface da sessão roda);
  - `TW_CHOICE=human` deixa a escolha de fim para a interface;
  - `TW_CRUSH=1` mata 85% do lado 2 aos 40 s;
  - `TW_CAMPAIGN_RUN=<save>` joga como partida de campanha (a página endgame grava o resultado; o save atual é guardado e devolvido, e o que foi gravado fica em `/tmp/tw_endgame_result.0adcampaign`).
- Batalha naval: `TW_MAP=tw_naval TW_SIZE=256 sh tools/test/battletest.sh` (frotas de demonstração ou `TW_SETTINGS` com `"naval": true`).
- Sprites de mods com arte própria (COLLADA): `gen_army_sprites.py --check <civs>` lista o que falta. `--warm-cache SEGUNDOS <civs>` abre o jogo um instante para ele converter os `.dae` no cache. Depois disso, gere normalmente. O leitor (`ModArchive`) procura nos arquivos soltos do mod, no cache do jogo e no `public.zip`.
- `sh tools/test/campaign_sim.sh [turnos] [civ] [província] [gui]`: simula a campanha no `gjs` com os scripts reais (regras, IA, batalhas automáticas, salvar e recarregar). Com `gui`, abre também as janelas com objetos falsos e monta o lançamento da batalha. `TW_SAVE_BATTLE=<arquivo>` grava essa configuração, para usar em `TW_SETTINGS`.
- Templates: `cd /tmp && snap run 0ad -mod=public -mod=0ad_total_warfield -autostart="random/tw_battlefield" -autostart-nonvisual -autostart-biome=generic/temperate -autostart-size=192 -autostart-players=2 -autostart-civ=1:rome -autostart-civ=2:mace`. O log fica em `~/snap/0ad/751/.local/state/0ad/log/interestinglog.html`.

O modo sem janela não carrega atores nem a GUI da sessão. Seleção, posturas e placar só se veem jogando de verdade.

## Próximos passos

- **Endovelico:** rodar `python3 tools/gen_battalions.py --mod ../Endovelico` gera os batalhões e as listas das civs dele. Com os dois mods ativos, as culturas nativas passam a usar as próprias civs (`twResolveCiv`), em vez das substitutas. Falta ler as tribos de `campaigns/grand_strategy/tribes/` quando o Endovelico estiver carregado.
- **Warhammer 40k estilo Gladius:** as regras de exército (`Warfield.js`), as batalhas (`Battle.js`) e os batalhões não dependem das civs antigas. Um mod 40k pode reaproveitá-los com outras listas de unidades (geradas do `warhr`), outro mapa (planeta em hexágonos ou regiões), recursos próprios (requisição e energia em vez de ouro) e unidades de herói com habilidades.
- **Batalha:** defensores sobre as muralhas (torretas), escadas e torres de cerco encostando no muro, reforços chegando de províncias vizinhas, batalhas com aliados (3–4 jogadores), clima e hora do dia.

## Licença

GPL 2 (`LICENSE`), como o 0 A.D. e o mod *Grand Strategy* de wraitii, de onde vem a base do mapa de campanha (via Endovelico).
