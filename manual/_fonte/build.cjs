/**
 * Gera o Manual do Sistema (HTML -> PDF) a partir do conteúdo estruturado abaixo.
 * NUNCA editar o HTML/PDF gerado — alterar aqui e rodar: node build.cjs
 *
 * Arquitetura de página (aprendida no Manual Pons e refinada aqui):
 * - pdf() com margem 0 e SEM header/footer nativos;
 * - cada página impressa é um <div class="page"> de altura fixa 296.5mm
 *   (nunca 297mm exato — arredondamento mm->pt do Chromium vaza) com
 *   overflow:hidden e page-break-after;
 * - a paginação do conteúdo é calculada AQUI (estimativa de altura por bloco,
 *   com folga conservadora) — nada de margin negativo nem conteúdo fluido
 *   cruzando páginas (isso dispara o bug de fragmentação do Chromium);
 * - rodapé com numeração é desenhado dentro de cada página de conteúdo
 *   (capa e aberturas ficam limpas).
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const JPG = path.join(__dirname, 'jpg');
const OUT_HTML = path.join(__dirname, 'manual.html');
const OUT_PDF = path.join(__dirname, '..', 'Manual-Sistema-Marcio-Binsely-Digital.pdf');

// ---------------------------------------------------------------- identidade
const C = {
  azul: '#003E9D', navy: '#0A326B', verde: '#2BB153', amarelo: '#FEC330',
  vermelho: '#F3083E', ink: '#13233F', muted: '#5A6B85', border: '#DDE4EF',
  soft: '#F2F6FC',
};

// Ícones de traço (SVG simples, sem emoji — padrão VAI)
const ic = {
  dica: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
  atencao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17.5v.5"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
};

// ---------------------------------------------------------------- helpers de bloco
const fig = (file, caption) => ({ tipo: 'fig', file, caption });
const p = (html) => ({ tipo: 'p', html });
const passos = (titulo, itens) => ({ tipo: 'passos', titulo, itens });
const dica = (html) => ({ tipo: 'dica', html });
const atencao = (html) => ({ tipo: 'atencao', html });
const tabela = (head, rows) => ({ tipo: 'tabela', head, rows });

// Prints de tela de autenticação: cartão pequeno no centro -> exibir menor.
const FIG_PEQUENA = new Set(['01-login', '02-esqueci-senha', '03-redefinir-senha']);

// ---------------------------------------------------------------- CONTEÚDO
const CAPITULOS = [
  {
    num: '01',
    titulo: 'Acesso ao sistema',
    resumo: 'Como receber o acesso, entrar na plataforma, recuperar a senha e entender a tela principal.',
    secoes: [
      {
        titulo: 'Como o acesso chega até você',
        blocos: [
          p('O acesso ao sistema é criado pela coordenação da campanha. Você recebe no seu WhatsApp uma mensagem oficial com o seu usuário (e-mail) e um botão para <b>criar a sua própria senha</b>. Basta tocar no botão, definir a senha e entrar. Se preferir, a coordenação também pode enviar manualmente um acesso com senha temporária — nesse caso, recomendamos trocá-la no primeiro uso.'),
          dica('Guarde o endereço do sistema nos favoritos do navegador: <b>app.marciobinsely.site</b>. No celular, o navegador vai oferecer "Adicionar à tela inicial" — aceite e o sistema vira um aplicativo, com ícone próprio.'),
        ],
      },
      {
        titulo: 'Entrar no sistema',
        blocos: [
          fig('01-login', 'Tela de entrada — e-mail e senha.'),
          passos('Para entrar', [
            'Acesse <b>app.marciobinsely.site</b>.',
            'Informe o seu e-mail e a sua senha.',
            'Toque em <b>Entrar</b>. Você chega direto no Dashboard.',
          ]),
        ],
      },
      {
        titulo: 'Esqueci a senha',
        blocos: [
          fig('02-esqueci-senha', 'Recuperação de senha pelo e-mail cadastrado.'),
          passos('Para recuperar', [
            'Na tela de entrada, toque em <b>Esqueci minha senha</b>.',
            'Informe o e-mail da sua conta e envie.',
            'Você recebe um link de redefinição por <b>e-mail</b> e também pelo <b>WhatsApp</b> (se o seu telefone estiver cadastrado). O link vale por 1 hora.',
          ]),
          fig('03-redefinir-senha', 'Tela de criação da nova senha, aberta pelo link recebido.'),
        ],
      },
      {
        titulo: 'A tela principal',
        blocos: [
          p('O <b>Dashboard</b> é a primeira tela: voluntários, apoiadores, pedidos de material, demandas, conversas abertas e o ritmo de cadastros por dia. O menu lateral esquerdo organiza o sistema em blocos (Visão geral, Base, Mobilização, Materiais, Comunicação e Administração) — cada perfil de acesso enxerga apenas o que lhe cabe.'),
          fig('10-dashboard', 'Dashboard — os números da campanha em tempo real.'),
          p('No canto superior direito ficam o <b>modo escuro</b> e o botão de <b>sair</b>. No canto inferior direito, o botão azul abre o <b>assistente de IA</b>, que responde perguntas sobre os dados da campanha.'),
        ],
      },
    ],
  },
  {
    num: '02',
    titulo: 'Base de apoiadores',
    resumo: 'Cadastro e organização de apoiadores e voluntários, formulário público, suspeitos e blacklist.',
    secoes: [
      {
        titulo: 'Apoiadores',
        blocos: [
          fig('13-apoiadores', 'Lista de apoiadores — busca, filtros por grupo e ações rápidas.'),
          p('É a base geral de contatos da campanha. Dá para buscar por nome ou telefone, filtrar por <b>grupo</b> (as etiquetas herdadas das bases importadas — indicações, pré-campanha, bairros) e por região. Em cada linha há ações rápidas: abrir o WhatsApp da pessoa e enviar para a blacklist.'),
        ],
      },
      {
        titulo: 'Novo cadastro',
        blocos: [
          fig('13b-apoiadores-novo', 'Novo cadastro — dados pessoais e endereço.'),
          passos('Para cadastrar alguém', [
            'Toque em <b>Novo cadastro</b>.',
            'Preencha ao menos o nome completo. O CEP preenche o endereço automaticamente.',
            'Se a pessoa quiser participar mais, marque o <b>Tipo de apoio</b> (ver a seguir).',
            'Toque em <b>Salvar</b>.',
          ]),
        ],
      },
      {
        titulo: 'Tipo de apoio — o coração do fluxo',
        blocos: [
          fig('13c-apoiadores-tipo-apoio', 'As três formas de apoio. Pode marcar mais de uma.'),
          p('Ao marcar qualquer opção de <b>Tipo de apoio</b> e salvar, o sistema faz o encaminhamento sozinho:'),
          tabela(['Opção marcada', 'O que acontece'], [
            ['<b>Quero ser voluntário</b>', 'A pessoa sai de Apoiadores e passa a aparecer em <b>Voluntários</b>.'],
            ['<b>Faixa na minha casa</b>', 'Além de virar voluntária, entra na lista de <b>Faixas</b> com o endereço para instalação.'],
            ['<b>Kit de material</b>', 'Além de virar voluntária, gera um pedido em <b>Pedidos de material</b>.'],
          ]),
          dica('Não existe risco de duplicar: se marcar de novo o mesmo tipo em uma edição, o sistema reaproveita o registro existente em vez de criar outro.'),
        ],
      },
      {
        titulo: 'Voluntários',
        blocos: [
          fig('14-voluntarios', 'Voluntários — quem topou participar ativamente.'),
          p('Aqui ficam só as pessoas que aceitaram ajudar. A lista mostra a forma de apoio preferida e a situação da confirmação. Em cada linha é possível <b>editar</b> o cadastro (inclusive os tipos de apoio) e <b>excluir</b> quando necessário.'),
        ],
      },
      {
        titulo: 'Cadastro público (link para divulgar)',
        blocos: [
          fig('04-landing', 'Página pública da campanha — lp.marciobinsely.site.'),
          p('A campanha tem uma página pública com um formulário simples de cadastro. Quem se inscreve por ali <b>entra direto em Voluntários</b>, já com a origem registrada. O link pode ser divulgado em redes sociais, grupos e materiais impressos (QR code).'),
          fig('05-cadastro-publico', 'Formulário público — só nome e WhatsApp são obrigatórios; o CEP preenche o endereço.'),
        ],
      },
      {
        titulo: 'Suspeitos e Blacklist',
        blocos: [
          fig('15-suspeitos', 'Cadastros retidos pelo antifraude para revisão manual.'),
          p('O formulário público tem proteção antifraude. Cadastros com sinais de robô ou repetição caem em <b>Suspeitos</b>, onde a coordenação decide aprovar ou descartar.'),
          fig('16-blacklist', 'Blacklist — números que não devem ser contatados.'),
          p('A <b>Blacklist</b> guarda quem pediu para não receber mensagens (ou números problemáticos). O sistema respeita essa lista nos disparos.'),
        ],
      },
    ],
  },
  {
    num: '03',
    titulo: 'Comunicação',
    resumo: 'Atendimento pelo WhatsApp oficial, campanhas de disparo, automações e mural interno.',
    secoes: [
      {
        titulo: 'Conversas (atendimento)',
        blocos: [
          fig('24-conversas', 'Central de Comunicação — atendimento externo e chat interno da equipe.'),
          p('Todas as mensagens recebidas no <b>WhatsApp oficial da campanha</b> caem aqui. Cada conversa tem situação (Aguardando, Em atendimento, Fechada), painel do contato com <b>classificação</b> (Voluntário, Apoiador, Liderança, Indeciso, Imprensa, Faixa, Material, Prioritário) e <b>anotações internas</b> que só a equipe vê. As <b>respostas rápidas</b> agilizam o atendimento. A aba <b>Chat Interno</b> é a comunicação privada entre membros da equipe.'),
          atencao('Regra do WhatsApp oficial: quando a pessoa manda mensagem, a campanha tem <b>24 horas</b> para responder em texto livre. Passado esse prazo, só é possível iniciar contato por <b>template aprovado</b> (ver Disparos).'),
        ],
      },
      {
        titulo: 'Disparos (campanhas em massa)',
        blocos: [
          fig('26-disparos', 'Campanhas de disparo — criação, importação de contatos e acompanhamento.'),
          p('O módulo de Disparos envia mensagens em escala pelo WhatsApp oficial. O fluxo: criar a campanha, importar os contatos (colar lista ou CSV) e disparar. O painel acompanha enviados, falhas e pendentes em tempo real — e cada falha guarda o motivo devolvido pelo WhatsApp.'),
          fig('26b-disparos-nova', 'Nova campanha — escolha entre template aprovado ou mensagem livre.'),
          tabela(['Tipo de envio', 'Quando usar'], [
            ['<b>Template aprovado</b>', 'Para alcançar qualquer número, mesmo quem nunca falou com a campanha. O texto é pré-aprovado pelo WhatsApp e pode levar imagem no topo.'],
            ['<b>Mensagem livre</b>', 'Só chega para quem interagiu nas últimas 24 horas. Aceita variáveis como {{nome}} e {{cidade}}.'],
          ]),
          atencao('A conta oficial tem limite diário de conversas de marketing (hoje, <b>250 por dia</b>; o limite sobe conforme a qualidade e a verificação da empresa). O envio é feito em lotes justamente para respeitar esse teto.'),
          dica('Antes de um disparo grande, faça um teste com o seu próprio número em uma campanha pequena. Confira o texto, a imagem e só então importe a lista completa.'),
        ],
      },
      {
        titulo: 'Automações',
        blocos: [
          fig('27-automacoes', 'Regras automáticas de mensagem.'),
          p('As automações cuidam das respostas padrão — como a mensagem de boas-vindas e a confirmação de participação do voluntário — sem depender de alguém estar on-line.'),
        ],
      },
      {
        titulo: 'Mural de avisos',
        blocos: [
          fig('17-mural', 'Mural — comunicados internos da coordenação para a equipe.'),
          p('O mural centraliza os avisos oficiais da campanha. Todos os perfis enxergam; a publicação é da coordenação.'),
        ],
      },
    ],
  },
  {
    num: '04',
    titulo: 'Mobilização e campo',
    resumo: 'Agenda, ações de rua, pedidos de material, faixas, mídia kit e engajamento da militância.',
    secoes: [
      {
        titulo: 'Agenda',
        blocos: [
          fig('21-agenda', 'Agenda de eventos — ordenada por data e horário.'),
          p('Compromissos e eventos da campanha, sempre ordenados por data e horário. Cada evento tem responsável, local e situação. Todos os perfis enxergam a agenda.'),
        ],
      },
      {
        titulo: 'Ações de rua',
        blocos: [
          fig('20-acoes-rua', 'Ações de rua — caminhadas, panfletagens e corpo a corpo.'),
          p('Registra as atividades de campo: tipo de ação, data, local, coordenador e equipe participante. As ações aparecem também no Mapa político.'),
        ],
      },
      {
        titulo: 'Pedidos de material',
        blocos: [
          fig('22-materiais', 'Pedidos de material — nome, endereço e telefone para entrega.'),
          p('Cada pedido mostra <b>quem pediu, endereço completo e telefone</b>, com ação rápida de WhatsApp para combinar a entrega. O botão <b>Exportar</b> gera a planilha pronta para imprimir etiquetas de envio dos kits. A situação (Solicitado, Aprovado, Entregue) organiza a fila.'),
        ],
      },
      {
        titulo: 'Faixas',
        blocos: [
          fig('23-faixas', 'Faixas — endereços autorizados e situação de instalação.'),
          p('Lista dos locais onde apoiadores autorizaram faixa: endereço, contato e situação (Autorizada, Instalada, Removida). Quem marca "Faixa na minha casa" no cadastro entra aqui automaticamente.'),
        ],
      },
      {
        titulo: 'Mídia Kit',
        blocos: [
          fig('18-midia-kit', 'Mídia Kit — artes e materiais oficiais para baixar e compartilhar.'),
          p('Repositório das artes oficiais (posts, santinhos digitais, vídeos). A militância baixa por aqui e compartilha — todo mundo usando a versão certa, sempre.'),
        ],
      },
      {
        titulo: 'Engajamento',
        blocos: [
          fig('19-engajamento', 'Engajamento — tarefas com pontos e ranking da militância.'),
          p('Tarefas de mobilização valem pontos (compartilhar arte, participar de ação, indicar apoiador). O ranking reconhece quem mais contribui — um jeito saudável de manter a militância ativa.'),
        ],
      },
    ],
  },
  {
    num: '05',
    titulo: 'Gestão e análise',
    resumo: 'Mapa político, relatórios, demandas dos cidadãos e o painel de TV do comitê.',
    secoes: [
      {
        titulo: 'Mapa político',
        blocos: [
          fig('11-mapa', 'Mapa político — apoiadores, faixas e ações georreferenciados, ao vivo.'),
          p('Todos os cadastros com endereço aparecem no mapa, agrupados por bairro. As camadas ligam e desligam apoiadores, faixas e ações de rua — uma leitura imediata de onde a campanha está forte e onde precisa crescer.'),
        ],
      },
      {
        titulo: 'Relatórios',
        blocos: [
          fig('12-relatorios', 'Relatórios — evolução, origem dos cadastros e distribuição por região.'),
          p('Os gráficos mostram a evolução da base, origem dos cadastros e distribuição geográfica. Use para orientar as decisões da semana: onde fazer ação de rua, onde reforçar divulgação.'),
        ],
      },
      {
        titulo: 'Demandas',
        blocos: [
          fig('25-demandas', 'Demandas — o quadro kanban dos pedidos dos cidadãos.'),
          p('Cada pedido de cidadão vira um cartão no quadro: Nova, Em análise, Encaminhada, Resolvida. Os cartões têm prioridade (com destaque visual), categoria e responsável; dá para filtrar por categoria e arrastar entre colunas.'),
          fig('25b-demanda-editar', 'Editar demanda — com o histórico de tudo o que aconteceu.'),
          p('Ao abrir uma demanda, o <b>histórico</b> mostra cada mudança de situação com data e autor — transparência total sobre o andamento do pedido do cidadão.'),
        ],
      },
      {
        titulo: 'Painel TV',
        blocos: [
          fig('30-painel-tv', 'Painel TV — números da campanha em tela cheia para o comitê.'),
          p('Feito para ficar aberto na televisão do comitê: os números principais da campanha em tela cheia, com atualização automática.'),
        ],
      },
    ],
  },
  {
    num: '06',
    titulo: 'Administração',
    resumo: 'Usuários e perfis de acesso, envio de acesso pelo WhatsApp oficial e configurações.',
    secoes: [
      {
        titulo: 'Usuários',
        blocos: [
          fig('28-usuarios', 'Usuários — equipe da campanha e seus perfis.'),
          p('Cadastro da equipe que usa o sistema. Cada usuário tem um perfil (Líder, Membro ou Parceiro) que define o que enxerga. O botão de chave em cada linha abre o envio de acesso.'),
        ],
      },
      {
        titulo: 'Enviar acesso',
        blocos: [
          fig('28b-usuarios-acesso', 'Enviar acesso — automático pelo WhatsApp oficial ou manual.'),
          passos('Para dar acesso a alguém', [
            'Cadastre o usuário em <b>Novo usuário</b> (nome, e-mail, telefone e perfil).',
            'Toque no botão de chave na linha da pessoa.',
            'Prefira <b>Enviar acesso pelo WhatsApp oficial</b>: a pessoa recebe o login e um link seguro para criar a própria senha.',
            'Alternativa manual: gerar uma senha temporária e enviar pelo seu próprio WhatsApp (o texto sai pronto).',
          ]),
          dica('O envio automático é o mais seguro: a senha não circula em texto — a própria pessoa cria a dela pelo link (válido por 3 dias).'),
        ],
      },
      {
        titulo: 'Perfis de acesso',
        blocos: [
          tabela(['Módulo', 'Líder', 'Membro', 'Parceiro'], [
            ['Dashboard, Mural, Mídia Kit, Engajamento, Agenda, Pedidos de material', 'Sim', 'Sim', 'Sim'],
            ['Mapa, Relatórios, Apoiadores, Voluntários, Faixas, Ações de rua', 'Sim', 'Sim', '—'],
            ['Conversas, Demandas, Disparos, Painel TV', 'Sim', 'Sim', '—'],
            ['Suspeitos, Blacklist, Automações, Usuários, Configurações', 'Sim', '—', '—'],
          ]),
          p('<b>Líder</b> é a coordenação (acesso total). <b>Membro</b> é a equipe interna do dia a dia. <b>Parceiro</b> é o apoiador externo com painel próprio: mural, materiais, tarefas, agenda e pedidos.'),
        ],
      },
      {
        titulo: 'Configurações',
        blocos: [
          fig('29-configuracoes', 'Configurações — regiões, coordenadores e catálogos do sistema.'),
          p('Cadastros de apoio que alimentam o resto do sistema, como as <b>regiões</b> (com coordenador responsável, preenchido automaticamente nos formulários). Restrito à coordenação.'),
        ],
      },
    ],
  },
];

const FAQ = [
  ['Não recebi o link para criar a senha. E agora?', 'Peça à coordenação para reenviar pelo botão de chave em Usuários. Confira também se o seu telefone está correto no cadastro.'],
  ['O link de redefinição diz que expirou.', 'O link de recuperação vale 1 hora (o de primeiro acesso, 3 dias). Basta pedir um novo em "Esqueci minha senha".'],
  ['Marquei "Kit de material" e não achei o pedido.', 'Os pedidos ficam no módulo Pedidos de material. O sistema cria automaticamente ao salvar o cadastro — confira pelo nome da pessoa.'],
  ['Por que uma mensagem de disparo aparece como FALHA?', 'O WhatsApp recusou o envio e o sistema guarda o motivo (número inexistente, limite diário, template indisponível). Corrija e dispare de novo — só os pendentes e falhos são reenviados.'],
  ['Posso mandar mensagem livre para qualquer número?', 'Não. Mensagem livre só chega a quem falou com a campanha nas últimas 24 horas. Fora disso, use uma campanha com template aprovado.'],
  ['O sistema parece desatualizado no meu celular.', 'Feche e abra o aplicativo, ou atualize a página com força (no computador: Cmd/Ctrl + Shift + R). O sistema é um app instalável e às vezes guarda a versão anterior.'],
];

// ---------------------------------------------------------------- validação de cobertura
const usadas = new Set();
for (const cap of CAPITULOS) for (const s of cap.secoes) for (const b of s.blocos) if (b.tipo === 'fig') usadas.add(b.file);
const disponiveis = new Set(fs.readdirSync(JPG).filter((f) => f.endsWith('.jpg')).map((f) => f.replace('.jpg', '')));
const faltando = [...usadas].filter((f) => !disponiveis.has(f));
const sobrando = [...disponiveis].filter((f) => !usadas.has(f));
if (faltando.length) { console.error('IMAGENS FALTANDO:', faltando.join(', ')); process.exit(1); }
console.log(`Cobertura: ${usadas.size}/${disponiveis.size} imagens usadas${sobrando.length ? ` · fora do manual: ${sobrando.join(', ')}` : ' · zero órfãs'}`);

// ---------------------------------------------------------------- dimensões reais das imagens
const dim = {};
for (const f of disponiveis) {
  const out = execSync(`sips -g pixelWidth -g pixelHeight "${path.join(JPG, f + '.jpg')}"`).toString();
  const w = +out.match(/pixelWidth: (\d+)/)[1];
  const h = +out.match(/pixelHeight: (\d+)/)[1];
  dim[f] = { w, h };
}

// ---------------------------------------------------------------- estimativa de altura (mm)
const LARG = 176; // largura útil da página de conteúdo (210 - 2*17)
function alturaBloco(b) {
  if (b.tipo === 'fig') {
    const d = dim[b.file];
    const larg = FIG_PEQUENA.has(b.file) ? 128 : LARG;
    let h = larg * (d.h / d.w);
    if (h > 208) h = 208; // imagens muito altas são limitadas via CSS (max-height)
    return h + 12; // legenda + respiro
  }
  if (b.tipo === 'p') return Math.ceil(stripTags(b.html).length / 92) * 5.9 + 4;
  if (b.tipo === 'passos') return 16 + b.itens.reduce((a, i) => a + Math.ceil(stripTags(i).length / 84) * 5.9 + 1.8, 0);
  if (b.tipo === 'dica' || b.tipo === 'atencao') return 15 + Math.ceil(stripTags(b.html).length / 78) * 5.2;
  if (b.tipo === 'tabela') return 12 + b.rows.reduce((a, r) => a + Math.max(...r.map((c) => Math.ceil(stripTags(c).length / 52))) * 5.2 + 6.5, 0);
  return 10;
}
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ''); }

// ---------------------------------------------------------------- paginação
// Cada página de conteúdo comporta ~BUDGET mm de blocos empilhados.
const BUDGET = 238;
const TIT_SECAO = 14;

function paginarCapitulo(cap) {
  const pages = []; // cada page = array de {tituloSecao?, blocos:[]}
  let atual = []; let usado = 0;
  const fecha = () => { if (atual.length) { pages.push(atual); atual = []; usado = 0; } };
  for (const sec of cap.secoes) {
    const primeiro = alturaBloco(sec.blocos[0]) + TIT_SECAO;
    if (usado + primeiro > BUDGET) fecha();
    let entry = { titulo: sec.titulo, blocos: [] };
    atual.push(entry); usado += TIT_SECAO;
    for (const b of sec.blocos) {
      const h = alturaBloco(b);
      if (usado + h > BUDGET) {
        fecha();
        entry = { titulo: null, blocos: [] }; // continuação da mesma seção
        atual.push(entry);
      }
      entry.blocos.push(b); usado += h;
    }
  }
  fecha();
  return pages;
}

// ---------------------------------------------------------------- render de blocos
function blocoHtml(b) {
  if (b.tipo === 'p') return `<p class="txt">${b.html}</p>`;
  if (b.tipo === 'fig') {
    const cls = FIG_PEQUENA.has(b.file) ? 'fig fig-mini' : 'fig';
    return `<figure class="${cls}"><img src="jpg/${b.file}.jpg" alt=""><figcaption>${b.caption}</figcaption></figure>`;
  }
  if (b.tipo === 'dica') return `<div class="box box-dica"><div class="box-ic">${ic.dica}</div><div><strong>Dica</strong><span>${b.html}</span></div></div>`;
  if (b.tipo === 'atencao') return `<div class="box box-atencao"><div class="box-ic">${ic.atencao}</div><div><strong>Atenção</strong><span>${b.html}</span></div></div>`;
  if (b.tipo === 'passos')
    return `<div class="passos"><div class="passos-t">${b.titulo}</div><ol>${b.itens.map((i) => `<li>${i}</li>`).join('')}</ol></div>`;
  if (b.tipo === 'tabela')
    return `<table class="tb"><thead><tr>${b.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${b.rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return '';
}

// ---------------------------------------------------------------- montagem das páginas
const paginas = []; // {classe, html, comRodape, capitulo}

// capa
const dataBR = new Date(2026, 7, 12).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
paginas.push({
  classe: 'pg-capa', comRodape: false, html: `
  <div class="capa-tri"><span></span><span></span><span></span></div>
  <div class="capa-corpo">
    <img class="capa-foto" src="assets/foto.png" alt="">
    <div class="capa-kicker">Márcio Binsely Digital</div>
    <h1>Manual do<br>Sistema</h1>
    <div class="sub">Guia completo da plataforma de gestão da campanha — do primeiro acesso ao disparo de mensagens, com todas as telas explicadas passo a passo.</div>
  </div>
  <div class="capa-rodape">
    <div><b>app.marciobinsely.site</b><br>Versão 1.0 · ${dataBR}</div>
    <div>Uso interno da equipe</div>
  </div>`,
});

// sumário
paginas.push({
  classe: 'pg-conteudo', comRodape: true, rotulo: 'Sumário', html: `
  <h2 class="sum-titulo">O que você encontra neste manual</h2>
  ${CAPITULOS.map((c) => `<div class="sum-item"><div class="n">${c.num}</div><div><h3>${c.titulo}</h3><p>${c.resumo}</p></div></div>`).join('')}
  <div class="sum-item"><div class="n">+</div><div><h3>Perguntas frequentes</h3><p>Respostas rápidas para as dúvidas mais comuns do dia a dia.</p></div></div>`,
});

// capítulos
for (const cap of CAPITULOS) {
  paginas.push({
    classe: 'pg-abre', comRodape: false, html: `
    <div class="num">${cap.num}</div>
    <h2>${cap.titulo}</h2>
    <div class="resumo">${cap.resumo}</div>
    <div class="lista">${cap.secoes.map((s) => `<div>${ic.seta}<span>${s.titulo}</span></div>`).join('')}</div>`,
  });
  for (const pg of paginarCapitulo(cap)) {
    paginas.push({
      classe: 'pg-conteudo', comRodape: true, rotulo: `${cap.num} · ${cap.titulo}`, html: pg
        .map((sec) => `${sec.titulo ? `<div class="secao-t"><div class="bar"></div><h3>${sec.titulo}</h3></div>` : ''}${sec.blocos.map(blocoHtml).join('')}`)
        .join(''),
    });
  }
}

// FAQ
paginas.push({
  classe: 'pg-conteudo', comRodape: true, rotulo: 'Perguntas frequentes', html: `
  <div class="secao-t"><div class="bar"></div><h3>Perguntas frequentes</h3></div>
  ${FAQ.map(([q, a]) => `<div class="faq-item"><h4>${q}</h4><p>${a}</p></div>`).join('')}`,
});

// encerramento
paginas.push({
  classe: 'pg-fim', comRodape: false, html: `
  <h2>Bom trabalho!</h2>
  <p>Este manual acompanha a evolução do sistema — novas versões serão distribuídas conforme a plataforma ganhar recursos. Dúvidas e sugestões: fale com a coordenação da campanha.</p>
  <div class="tri"><span style="background:${C.verde}"></span><span style="background:${C.amarelo}"></span><span style="background:${C.vermelho}"></span></div>`,
});

const TOTAL = paginas.length;
console.log(`Páginas montadas: ${TOTAL}`);

// ---------------------------------------------------------------- HTML final
const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { font-family:'Poppins',sans-serif; color:${C.ink}; background:#fff; font-size:10.2pt; }
  b, strong { font-weight:600; }

  /* Toda página é um bloco de altura fixa (296.5mm, nunca 297 exato). */
  .page { width:210mm; height:296.5mm; overflow:hidden; page-break-after:always; position:relative; }
  .page:last-child { page-break-after:auto; }

  .pg-conteudo { padding:15mm 17mm 16mm; }
  .rodape { position:absolute; left:17mm; right:17mm; bottom:6.5mm; display:flex; justify-content:space-between; font-size:7.6pt; color:#8A98B3; border-top:1px solid ${C.border}; padding-top:2.4mm; }

  /* ---------------- capa ---------------- */
  .pg-capa { background:linear-gradient(160deg, ${C.navy} 0%, ${C.azul} 62%, #0B4FBF 100%); display:flex; flex-direction:column; color:#fff; }
  .capa-tri { display:flex; height:7mm; }
  .capa-tri span:nth-child(1){ flex:1; background:${C.verde}; }
  .capa-tri span:nth-child(2){ flex:1; background:${C.amarelo}; }
  .capa-tri span:nth-child(3){ flex:1; background:${C.vermelho}; }
  .capa-corpo { flex:1; display:flex; flex-direction:column; justify-content:center; padding:0 22mm; }
  .capa-foto { width:46mm; height:46mm; border-radius:50%; border:2.2mm solid rgba(255,255,255,.25); object-fit:cover; object-position:top; background:#fff; }
  .capa-kicker { margin-top:12mm; font-size:11pt; letter-spacing:.32em; text-transform:uppercase; color:${C.amarelo}; font-weight:600; }
  .pg-capa h1 { font-size:34pt; font-weight:800; line-height:1.12; margin-top:4mm; }
  .pg-capa .sub { margin-top:5mm; font-size:12.5pt; color:#CFE0FA; max-width:130mm; line-height:1.55; }
  .capa-rodape { padding:0 22mm 14mm; display:flex; justify-content:space-between; align-items:flex-end; font-size:9.5pt; color:#9FBCE8; }
  .capa-rodape b { color:#fff; font-weight:600; }

  /* ---------------- abertura de capítulo ---------------- */
  .pg-abre { background:linear-gradient(150deg, ${C.navy}, ${C.azul}); display:flex; flex-direction:column; justify-content:center; padding:0 22mm; color:#fff; }
  .pg-abre .num { font-size:64pt; font-weight:800; color:${C.amarelo}; line-height:1; }
  .pg-abre h2 { font-size:27pt; font-weight:700; margin-top:5mm; }
  .pg-abre .resumo { margin-top:5mm; font-size:12pt; color:#CFE0FA; max-width:132mm; line-height:1.6; }
  .pg-abre .lista { margin-top:11mm; border-top:1px solid rgba(255,255,255,.22); padding-top:7mm; display:grid; gap:3.2mm; max-width:132mm; }
  .pg-abre .lista div { display:flex; gap:4mm; align-items:center; font-size:10.5pt; color:#E8F0FD; }
  .pg-abre .lista svg { width:4.2mm; height:4.2mm; color:${C.amarelo}; flex-shrink:0; }

  /* ---------------- sumário ---------------- */
  .sum-titulo { font-size:19pt; font-weight:700; color:${C.navy}; margin-bottom:9mm; }
  .sum-item { display:flex; gap:6mm; padding:5.5mm 0; border-bottom:1px solid ${C.border}; }
  .sum-item .n { font-size:15pt; font-weight:800; color:${C.azul}; min-width:12mm; }
  .sum-item h3 { font-size:12pt; font-weight:600; }
  .sum-item p { font-size:9.5pt; color:${C.muted}; margin-top:1mm; line-height:1.5; }

  /* ---------------- corpo ---------------- */
  .secao-t { display:flex; align-items:center; gap:3.5mm; margin:0 0 4mm; }
  .secao-t + .secao-t, .txt + .secao-t, figure + .secao-t, .box + .secao-t, .passos + .secao-t, .tb + .secao-t { margin-top:7mm; }
  .secao-t .bar { width:2.2mm; height:7.5mm; border-radius:1.2mm; background:${C.azul}; }
  .secao-t h3 { font-size:13.5pt; font-weight:700; color:${C.navy}; }
  .txt { line-height:1.62; margin-bottom:4mm; }
  .fig { margin:2mm 0 5mm; }
  .fig img { display:block; width:100%; max-height:205mm; object-fit:contain; border:1px solid ${C.border}; border-radius:3mm; box-shadow:0 2mm 6mm rgba(10,50,107,.10); }
  .fig-mini img { width:128mm; margin:0 auto; }
  figcaption { font-size:8.6pt; color:${C.muted}; margin-top:2.2mm; text-align:center; }
  .passos { background:${C.soft}; border:1px solid ${C.border}; border-radius:3mm; padding:5mm 6mm; margin:2mm 0 5mm; }
  .passos-t { font-weight:700; color:${C.navy}; font-size:10.5pt; margin-bottom:2.5mm; }
  .passos ol { margin-left:5.5mm; }
  .passos li { line-height:1.6; margin-bottom:1.6mm; }
  .box { display:flex; gap:4.5mm; border-radius:3mm; padding:4.5mm 5.5mm; margin:2mm 0 5mm; font-size:9.6pt; line-height:1.55; }
  .box strong { display:block; margin-bottom:1mm; font-size:9.8pt; }
  .box-ic { width:6mm; flex-shrink:0; padding-top:.6mm; }
  .box-ic svg { width:6mm; height:6mm; }
  .box-dica { background:#FFF9E8; border:1px solid #F3DFA0; color:#6B5618; }
  .box-dica .box-ic { color:#B98A00; }
  .box-atencao { background:#FDEDF0; border:1px solid #F2BCC8; color:#7A1A2E; }
  .box-atencao .box-ic { color:${C.vermelho}; }
  .tb { width:100%; border-collapse:collapse; margin:2mm 0 5mm; font-size:9.6pt; }
  .tb th { background:${C.navy}; color:#fff; text-align:left; padding:3mm 4mm; font-weight:600; }
  .tb td { border:1px solid ${C.border}; padding:3mm 4mm; line-height:1.5; vertical-align:top; }
  .tb tr:nth-child(even) td { background:${C.soft}; }

  .faq-item { padding:4.5mm 0; border-bottom:1px solid ${C.border}; }
  .faq-item h4 { font-size:10.8pt; font-weight:600; color:${C.navy}; margin-bottom:1.8mm; }
  .faq-item p { font-size:9.8pt; line-height:1.6; color:#33415C; }

  .pg-fim { background:linear-gradient(160deg, ${C.navy}, ${C.azul}); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 25mm; color:#fff; }
  .pg-fim h2 { font-size:21pt; font-weight:700; }
  .pg-fim p { margin-top:5mm; color:#CFE0FA; font-size:11pt; line-height:1.6; max-width:120mm; }
  .pg-fim .tri { display:flex; height:2.6mm; width:60mm; margin-top:10mm; border-radius:2mm; overflow:hidden; }
  .pg-fim .tri span { flex:1; }
</style></head><body>
${paginas
  .map((pg, i) => `<div class="page ${pg.classe}">${pg.html}${pg.comRodape ? `<div class="rodape"><span>Márcio Binsely Digital — Manual do Sistema${pg.rotulo ? ` · ${pg.rotulo}` : ''}</span><span>Página ${i + 1} de ${TOTAL}</span></div>` : ''}</div>`)
  .join('\n')}
</body></html>`;

fs.writeFileSync(OUT_HTML, html);
console.log('HTML gerado:', OUT_HTML);

// ---------------------------------------------------------------- PDF
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + OUT_HTML, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // fontes
  await page.pdf({
    path: OUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
  });
  await browser.close();
  const kb = Math.round(fs.statSync(OUT_PDF).size / 1024);
  console.log(`PDF gerado: ${OUT_PDF} (${kb} KB)`);
})();
