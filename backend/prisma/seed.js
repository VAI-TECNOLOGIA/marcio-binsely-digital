import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const POA = { lat: -30.0346, lng: -51.2177 };
const rand = (min, max) => Math.random() * (max - min) + min;
const jitter = (base, range = 0.07) => base + rand(-range, range);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const phone = () => '5551' + String(Math.floor(90000000 + Math.random() * 9999999));

const NEIGHBORHOODS = [
  'Centro Histórico', 'Cidade Baixa', 'Menino Deus', 'Petrópolis', 'Moinhos de Vento',
  'Bom Fim', 'Partenon', 'Restinga', 'Sarandi', 'Rubem Berta', 'Lomba do Pinheiro',
  'Cavalhada', 'Tristeza', 'Ipanema', 'Azenha', 'Santana', 'Bela Vista', 'Higienópolis',
];
const FIRST = ['Ana', 'Carlos', 'Mariana', 'João', 'Patrícia', 'Rafael', 'Juliana', 'Bruno', 'Fernanda', 'Lucas', 'Camila', 'Diego', 'Aline', 'Marcelo', 'Bianca', 'Rodrigo', 'Letícia', 'Felipe', 'Gabriela', 'Thiago'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Costa', 'Martins', 'Rocha', 'Almeida', 'Nunes', 'Gomes', 'Ribeiro', 'Carvalho'];
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;

const SUPPORT_TYPES = ['VOLUNTARIO', 'FAIXA_CASA', 'ADESIVO_CARRO', 'MATERIAL_DIGITAL', 'CAMINHADA', 'EVENTOS', 'INDICAR', 'NOTICIAS'];
const STATUSES = ['NOVO', 'CONFIRMADO', 'ATIVO', 'PENDENTE', 'INATIVO'];

async function clean() {
  console.log('🧹 Limpando base...');
  const order = [
    'auditLog', 'automationLog', 'automation', 'score', 'engagement', 'volunteerStatusHistory',
    'mediaDownload', 'mediaPublicationProof', 'message', 'conversation', 'broadcastContact',
    'broadcastCampaign', 'bannerLocation', 'materialRequest', 'streetAction', 'event', 'demand',
    'notice', 'mediaKit', 'task', 'material', 'volunteer', 'supporter', 'blacklist', 'city',
    'region', 'setting', 'role', 'user',
  ];
  for (const model of order) {
    await prisma[model].deleteMany();
  }
}

async function main() {
  await clean();

  console.log('👥 Perfis...');
  const roleData = [
    { key: 'LIDER', name: 'Líder de Campanha', description: 'Acesso total à plataforma: estratégia, usuários, configurações e disparos.', permissions: ['*'] },
    { key: 'MEMBRO', name: 'Membro da Equipe', description: 'Equipe interna: base de apoiadores/voluntários, comunicação, mobilização e materiais.', permissions: ['supporters', 'volunteers', 'notices', 'actions', 'events', 'media-kit', 'conversations', 'demands', 'materials'] },
    { key: 'PARCEIRO', name: 'Parceiro', description: 'Apoiador externo: painel próprio, mídia kit, tarefas, agenda e pedidos de material.', permissions: ['media-kit:read', 'tasks:self', 'materials:request', 'agenda:read'] },
  ];
  for (const r of roleData) await prisma.role.create({ data: r });

  console.log('🗺️  Regiões e cidades...');
  const regionsSpec = [
    { name: 'Centro', color: '#F3083E' },
    { name: 'Zona Norte', color: '#2DBE60' },
    { name: 'Zona Sul', color: '#F7A810' },
    { name: 'Zona Leste', color: '#B45309' },
    { name: 'Região Metropolitana', color: '#6D28D9' },
  ];
  const regions = {};
  for (const r of regionsSpec) {
    regions[r.name] = await prisma.region.create({ data: { name: r.name, uf: 'RS', color: r.color } });
  }

  const poaCity = await prisma.city.create({ data: { name: 'Porto Alegre', uf: 'RS', regionId: regions['Centro'].id } });
  await prisma.city.createMany({
    data: [
      { name: 'Canoas', uf: 'RS', regionId: regions['Região Metropolitana'].id },
      { name: 'Gravataí', uf: 'RS', regionId: regions['Região Metropolitana'].id },
      { name: 'Viamão', uf: 'RS', regionId: regions['Região Metropolitana'].id },
      { name: 'Alvorada', uf: 'RS', regionId: regions['Região Metropolitana'].id },
    ],
  });

  console.log('🔐 Usuários...');
  const hash = (p) => bcrypt.hashSync(p, 10);
  const admin = await prisma.user.create({
    data: { name: 'Líder de Campanha', email: 'admin@marciobinsely.com', password: hash('Admin@123'), role: 'LIDER', phone: '5551999999999' },
  });
  const coordNorte = await prisma.user.create({
    data: { name: 'Membro — Zona Norte', email: 'norte@marciobinsely.com', password: hash('Admin@123'), role: 'MEMBRO', regionId: regions['Zona Norte'].id, managerId: admin.id },
  });
  const coordSul = await prisma.user.create({
    data: { name: 'Membro — Zona Sul', email: 'sul@marciobinsely.com', password: hash('Admin@123'), role: 'MEMBRO', regionId: regions['Zona Sul'].id, managerId: admin.id },
  });
  const supervisor = await prisma.user.create({
    data: { name: 'Membro — Equipe A', email: 'supervisor@marciobinsely.com', password: hash('Admin@123'), role: 'MEMBRO', regionId: regions['Zona Norte'].id, managerId: coordNorte.id },
  });
  await prisma.user.create({ data: { name: 'Parceiro Demo', email: 'parceiro@marciobinsely.com', password: hash('Admin@123'), role: 'PARCEIRO' } });
  await prisma.user.create({ data: { name: 'Membro — Marketing', email: 'marketing@marciobinsely.com', password: hash('Admin@123'), role: 'MEMBRO' } });
  await prisma.user.create({ data: { name: 'Membro — Materiais', email: 'materiais@marciobinsely.com', password: hash('Admin@123'), role: 'MEMBRO' } });
  await prisma.user.create({ data: { name: 'Membro — Atendimento', email: 'atendimento@marciobinsely.com', password: hash('Admin@123'), role: 'MEMBRO' } });
  const coordinators = [coordNorte, coordSul];

  console.log('✅ Tarefas de engajamento...');
  const taskSpec = [
    { type: 'POST_INSTAGRAM', title: 'Publiquei no Instagram', points: 15 },
    { type: 'POST_FACEBOOK', title: 'Publiquei no Facebook', points: 15 },
    { type: 'SHARE_WHATSAPP', title: 'Compartilhei no WhatsApp', points: 10 },
    { type: 'CAMINHADA', title: 'Participei da caminhada', points: 30 },
    { type: 'FAIXA', title: 'Coloquei faixa', points: 25 },
    { type: 'ADESIVOS', title: 'Entreguei adesivos', points: 20 },
    { type: 'CONVIDAR', title: 'Convidei pessoas', points: 10 },
    { type: 'EVENTO', title: 'Compareci ao evento', points: 25 },
  ];
  const tasks = {};
  for (const t of taskSpec) tasks[t.type] = await prisma.task.create({ data: t });

  console.log('📦 Materiais...');
  const materialSpec = [
    { name: 'Faixa 3x1m', category: 'Faixa', unit: 'un', stock: 200 },
    { name: 'Bandeira', category: 'Bandeira', unit: 'un', stock: 300 },
    { name: 'Adesivo de Carro', category: 'Adesivo', unit: 'un', stock: 5000 },
    { name: 'Santinho', category: 'Santinho', unit: 'pacote', stock: 10000 },
    { name: 'Camiseta', category: 'Camiseta', unit: 'un', stock: 500 },
    { name: 'Boné', category: 'Boné', unit: 'un', stock: 400 },
  ];
  for (const m of materialSpec) await prisma.material.create({ data: m });

  console.log('🙋 Apoiadores e voluntários...');
  const regionNames = Object.keys(regions);
  const volunteers = [];
  for (let i = 0; i < 48; i++) {
    const regionName = pick(regionNames);
    const supportType = pick(SUPPORT_TYPES);
    const status = pick(STATUSES);
    const coordinator = pick(coordinators);
    const sup = await prisma.supporter.create({
      data: {
        name: fullName(),
        phone: phone(),
        whatsapp: phone(),
        email: Math.random() > 0.4 ? `apoiador${i}@email.com` : null,
        birthDate: new Date(1970 + Math.floor(rand(0, 35)), Math.floor(rand(0, 12)), Math.floor(rand(1, 28))),
        cep: '900' + Math.floor(rand(10, 99)) + '-000',
        neighborhood: pick(NEIGHBORHOODS),
        cityName: 'Porto Alegre',
        cityId: poaCity.id,
        regionId: regions[regionName].id,
        lat: jitter(POA.lat),
        lng: jitter(POA.lng),
        supportType,
        status,
        instagram: Math.random() > 0.6 ? `@${pick(FIRST).toLowerCase()}${i}` : null,
        coordinatorId: coordinator.id,
      },
    });

    if (supportType === 'VOLUNTARIO') {
      const confirmed = Math.random() > 0.3;
      const totalScore = confirmed ? Math.floor(rand(0, 320)) : 0;
      const v = await prisma.volunteer.create({
        data: {
          supporterId: sup.id,
          active: confirmed,
          confirmed,
          confirmedAt: confirmed ? new Date() : null,
          confirmationChannel: confirmed ? 'WHATSAPP' : null,
          helpPreference: confirmed ? pick(['Caminhadas', 'Faixa em casa', 'Material digital', 'Eventos']) : null,
          supervisorId: regionName === 'Zona Norte' ? supervisor.id : null,
          totalScore,
        },
      });
      volunteers.push(v);
      if (totalScore > 0) {
        const n = Math.floor(rand(1, 5));
        for (let k = 0; k < n; k++) {
          const t = pick(taskSpec);
          await prisma.engagement.create({ data: { volunteerId: v.id, type: t.type, taskId: tasks[t.type].id, points: t.points, validated: Math.random() > 0.4 } });
          await prisma.score.create({ data: { volunteerId: v.id, points: t.points, reason: `Engajamento: ${t.type}`, engagementType: t.type } });
        }
      }
    }
  }

  // Exemplo de SUSPEITO (telefone duplicado) e BLACKLIST
  const dupPhone = phone();
  await prisma.supporter.create({ data: { name: 'José Duplicado', phone: dupPhone, status: 'SUSPEITO', flaggedReason: 'Telefone usado em mais de um cadastro.', regionId: regions['Centro'].id, cityName: 'Porto Alegre', neighborhood: 'Centro Histórico', lat: jitter(POA.lat), lng: jitter(POA.lng), supportType: 'VOLUNTARIO' } });
  await prisma.supporter.create({ data: { name: 'José Duplicado (2)', phone: dupPhone, status: 'SUSPEITO', flaggedReason: 'Telefone duplicado — já cadastrado.', regionId: regions['Centro'].id, cityName: 'Porto Alegre', neighborhood: 'Cidade Baixa', supportType: 'VOLUNTARIO' } });
  await prisma.blacklist.create({ data: { phone: phone(), name: 'Contato Bloqueado', reason: 'Comportamento abusivo em grupos.', createdById: admin.id } });

  console.log('📢 Mural de avisos...');
  await prisma.notice.createMany({
    data: [
      { title: 'Caminhada neste sábado', description: 'Concentração às 9h na Redenção. Levem a camiseta da campanha!', type: 'CONVOCACAO', priority: 'ALTA', authorId: coordNorte.id },
      { title: 'Agenda da semana', description: 'Reuniões de equipe, visitas e bandeiraço. Confira o calendário.', type: 'AGENDA', priority: 'MEDIA', authorId: admin.id },
      { title: 'Novo card para WhatsApp', description: 'Já está disponível no Mídia Kit. Compartilhem!', type: 'AVISO', priority: 'MEDIA', authorId: admin.id, regionId: regions['Zona Sul'].id },
    ],
  });

  console.log('🎬 Mídia Kit...');
  await prisma.mediaKit.createMany({
    data: [
      { title: 'Card — Saúde nos bairros', description: 'Arte para feed.', type: 'ARTE', network: 'INSTAGRAM', priority: 'ALTA', captionText: 'Saúde de qualidade perto de você! 💚 #MárcioBinsEly #PortoAlegre #12345', hashtags: '#MárcioBinsEly #PortoAlegre #Saúde #12345', guidance: 'Postar entre 18h e 20h.', authorId: admin.id },
      { title: 'Reels — Infraestrutura', description: 'Vídeo curto de 30s.', type: 'REELS', network: 'INSTAGRAM', priority: 'MEDIA', captionText: 'Obras que transformam bairros. 🚧', hashtags: '#Infraestrutura #POA', authorId: admin.id },
      { title: 'Jingle oficial', description: 'Áudio para grupos de WhatsApp.', type: 'JINGLE', network: 'WHATSAPP', priority: 'ALTA', captionText: 'É Márcio Bins Ely, 12345!', authorId: admin.id },
    ],
  });

  console.log('🚩 Faixas em casas...');
  for (let i = 0; i < 14; i++) {
    await prisma.bannerLocation.create({
      data: {
        responsibleName: fullName(),
        phone: phone(),
        address: `Rua ${pick(LAST)}, ${Math.floor(rand(10, 999))}`,
        cityName: 'Porto Alegre',
        neighborhood: pick(NEIGHBORHOODS),
        lat: jitter(POA.lat),
        lng: jitter(POA.lng),
        authorized: Math.random() > 0.3,
        status: pick(['AUTORIZADO', 'AGUARDANDO_INSTALACAO', 'INSTALADO', 'INSTALADO']),
      },
    });
  }

  console.log('🚶 Ações de rua...');
  const actionTypes = ['CAMINHADA', 'REUNIAO', 'VISITA', 'EVENTO', 'ENTREGA_MATERIAL', 'CARREATA', 'BANDEIRACO'];
  for (let i = 0; i < 10; i++) {
    await prisma.streetAction.create({
      data: {
        type: pick(actionTypes),
        title: `Ação em ${pick(NEIGHBORHOODS)}`,
        cityName: 'Porto Alegre',
        neighborhood: pick(NEIGHBORHOODS),
        lat: jitter(POA.lat),
        lng: jitter(POA.lng),
        date: new Date(Date.now() - Math.floor(rand(0, 30)) * 86400000),
        peopleReached: Math.floor(rand(20, 400)),
        status: pick(['REALIZADA', 'REALIZADA', 'PLANEJADA']),
        coordinatorId: pick(coordinators).id,
        regionId: pick(Object.values(regions)).id,
      },
    });
  }

  console.log('📅 Agenda...');
  await prisma.event.createMany({
    data: [
      { title: 'Caminhada na Redenção', location: 'Parque Farroupilha', cityName: 'Porto Alegre', neighborhood: 'Bom Fim', date: new Date(Date.now() + 3 * 86400000), time: '09:00', status: 'CONFIRMADO', responsibleId: coordNorte.id },
      { title: 'Reunião com lideranças', location: 'Comitê Central', cityName: 'Porto Alegre', neighborhood: 'Centro Histórico', date: new Date(Date.now() + 6 * 86400000), time: '19:30', status: 'AGENDADO', responsibleId: admin.id },
      { title: 'Bandeiraço Zona Sul', location: 'Av. Wenceslau Escobar', cityName: 'Porto Alegre', neighborhood: 'Tristeza', date: new Date(Date.now() + 8 * 86400000), time: '17:00', status: 'AGENDADO', responsibleId: coordSul.id },
    ],
  });

  console.log('📨 Demandas da população...');
  const categories = ['SAUDE', 'EDUCACAO', 'INFRAESTRUTURA', 'SEGURANCA', 'EMPREGO', 'TRANSPORTE', 'OUTROS'];
  const demandStatus = ['NOVA', 'EM_ANALISE', 'EM_ANDAMENTO', 'RESOLVIDA'];
  for (let i = 0; i < 12; i++) {
    await prisma.demand.create({
      data: {
        citizenName: fullName(),
        phone: phone(),
        cityName: 'Porto Alegre',
        neighborhood: pick(NEIGHBORHOODS),
        category: pick(categories),
        description: pick(['Falta de iluminação na rua.', 'Posto de saúde sem médicos.', 'Buraco na via há meses.', 'Ponto de ônibus danificado.', 'Praça abandonada.']),
        priority: pick(['BAIXA', 'MEDIA', 'ALTA']),
        status: pick(demandStatus),
        responsibleId: Math.random() > 0.5 ? admin.id : null,
      },
    });
  }

  console.log('💬 Conversas...');
  await prisma.conversation.create({
    data: {
      channel: 'WHATSAPP', status: 'EM_ATENDIMENTO', contactName: 'Maria Apoiadora', contactPhone: phone(),
      tags: ['voluntária', 'zona norte'], lastMessageAt: new Date(), agentId: admin.id,
      messages: {
        create: [
          { direction: 'INBOUND', body: 'Olá! Quero ajudar na campanha 😊', channel: 'WHATSAPP' },
          { direction: 'OUTBOUND', body: 'Que ótimo, Maria! Como você prefere ajudar?', channel: 'WHATSAPP', senderId: admin.id },
        ],
      },
    },
  });

  console.log('🤖 Automações...');
  await prisma.automation.createMany({
    data: [
      { name: 'Feliz Aniversário', type: 'ANIVERSARIO', message: 'Olá {{nome}}, a campanha do Márcio Bins Ely deseja um feliz aniversário! 🎂', status: 'ATIVA' },
      { name: 'Boas-vindas Voluntário', type: 'AGRADECIMENTO_VOLUNTARIO', message: 'Obrigado por se juntar a nós, {{nome}}! Juntos somos mais fortes. 💪', status: 'ATIVA' },
      { name: 'Feliz Natal', type: 'NATAL', message: 'Feliz Natal, {{nome}}! 🎄', triggerDate: new Date(new Date().getFullYear(), 11, 25), status: 'RASCUNHO' },
    ],
  });

  console.log('📣 Disparo...');
  const campaign = await prisma.broadcastCampaign.create({
    data: { name: 'Convocação Caminhada', message: 'Olá {{nome}}! Vamos juntos à caminhada em {{bairro}}? Te esperamos! 🚶', channel: 'WHATSAPP', ownerId: coordNorte.id, status: 'RASCUNHO' },
  });
  await prisma.broadcastContact.createMany({
    data: Array.from({ length: 8 }).map(() => ({ campaignId: campaign.id, name: fullName(), phone: phone(), cityName: 'Porto Alegre', neighborhood: pick(NEIGHBORHOODS), status: 'PENDENTE' })),
  });
  await prisma.broadcastCampaign.update({ where: { id: campaign.id }, data: { totalContacts: 8, pendingCount: 8 } });

  console.log('⚙️  Configurações...');
  const settings = [
    { key: 'campaign', value: { name: 'Márcio Binsely Digital', candidate: 'Márcio Bins Ely', office: 'Vereador de Porto Alegre', party: 'PDT', number: '12345', city: 'Porto Alegre', uf: 'RS', slogan: 'Trabalho que move Porto Alegre' } },
    { key: 'theme', value: { brand: '#F3083E', green: '#2DBE60', accent: '#F7A810' } },
    { key: 'goals', value: { volunteers: 500, supporters: 5000, banners: 300, actions: 100 } },
  ];
  for (const s of settings) await prisma.setting.create({ data: s });

  console.log('\n✅ Seed concluído!');
  console.log('   Login admin: admin@marciobinsely.com / Admin@123');
  console.log(`   ${volunteers.length} voluntários, 50 apoiadores, e dados de exemplo criados.\n`);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
