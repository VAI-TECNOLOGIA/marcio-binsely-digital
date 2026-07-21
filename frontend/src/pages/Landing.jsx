import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Check, MapPin, Flag, ShieldCheck, GraduationCap, HeartPulse,
  Droplets, Home, Users, Trophy, BadgeCheck, Landmark, Sparkles, ChevronDown,
  HeartHandshake,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { options } from '../config/enums.js';
import '../styles/landing.css';

/* ===== Dados para a prova social (escopo de módulo: não recriar a cada render) ===== */
const NOMES = [
  'Mateus','Lucas','Gabriel','Pedro','João','Felipe','Rafael','Bruno','Thiago','Vinícius','Eduardo','Gustavo',
  'Leonardo','Rodrigo','Marcelo','Fernando','Ricardo','André','Diego','Henrique','Carlos','Paulo','Daniel','Fábio',
  'Alexandre','Júlio','César','Renato','Maurício','Anderson','Cristiano','Émerson','Jonas','Augusto','Otávio','Caio',
  'Vitor','Igor','Murilo','Arthur','Bernardo','Heitor','Davi','Enzo','Nícolas','Samuel','Téo','Miguel','Lorenzo',
  'Cleber','Volnei','Ademar','Nelson','Valdir','Sérgio','Jair','Ivo','Délcio','Ari','Hélio','José','Antônio',
  'Ana','Maria','Júlia','Beatriz','Larissa','Fernanda','Camila','Bruna','Carolina','Letícia','Amanda','Gabriela',
  'Mariana','Patrícia','Aline','Vanessa','Daniela','Juliana','Renata','Tatiane','Cristiane','Sabrina','Débora','Priscila',
  'Eduarda','Manuela','Helena','Valentina','Laura','Isabela','Sofia','Alice','Lívia','Cecília','Antônia','Rafaela',
  'Bianca','Carla','Adriana','Simone','Elaine','Roberta','Michele','Andréa','Luana','Natália','Jéssica','Franciele',
];
const BAIRROS = [
  'Centro Histórico','Cidade Baixa','Menino Deus','Petrópolis','Bom Fim','Moinhos de Vento','Partenon','Restinga',
  'Rubem Berta','Sarandi','Lomba do Pinheiro','Cavalhada','Tristeza','Ipanema','Belém Novo','Cristal','Azenha',
  'Santana','Bela Vista','Higienópolis','Jardim Botânico','Glória','Teresópolis','Cascata','São João','Navegantes',
  'Humaitá','Farrapos','Passo das Pedras','Mário Quintana','Vila Nova','Camaquã','Nonoai','Santa Tereza','Aberta dos Morros',
];
const VERBOS = ['virou apoiador!','entrou na campanha!','agora caminha com o Márcio!','se juntou ao movimento!','virou voluntário!'];
const TEMPOS = ['agora mesmo','há poucos segundos','há instantes'];
const CORES = [['#003e9d','#062248'],['#f3083e','#a8062a'],['#2bb153','#1a7d3a'],['#0054d6','#00348a'],['#fec330','#d99e06'],['#0ea5e9','#075985']];

function gerarPool() {
  const pool = [];
  const seen = new Set();
  let guard = 0;
  while (pool.length < 1000 && guard < 60000) {
    guard++;
    const n = NOMES[(Math.random() * NOMES.length) | 0];
    const c = BAIRROS[(Math.random() * BAIRROS.length) | 0];
    const k = n + '|' + c;
    if (!seen.has(k)) { seen.add(k); pool.push([n, c]); }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/* ============================== PÁGINA ============================== */
export default function Landing() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  // imã — Plano de Governo
  const [lead, setLead] = useState({ name: '', email: '', phone: '' });
  const [leadSent, setLeadSent] = useState(false);
  const [leadSending, setLeadSending] = useState(false);

  // participar (CTA final)
  const [form, setForm] = useState({ supportType: 'VOLUNTARIO' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  // prova social
  const [toasts, setToasts] = useState([]);
  const poolRef = useRef(gerarPool());
  const idxRef = useRef(0);

  useEffect(() => {
    api.get('/public/stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.mlp-reveal');
    const reveal = (el) => el.classList.add('in');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el, i) => { el.style.transitionDelay = (i % 5) * 70 + 'ms'; io.observe(el); });
    // Fallback à prova de corrida: revela na hora tudo que já está na viewport
    // (evita hero invisível se o observer não disparar no primeiro paint).
    requestAnimationFrame(() => {
      const h = window.innerHeight;
      els.forEach((el) => { if (el.getBoundingClientRect().top < h * 0.92) { reveal(el); io.unobserve(el); } });
    });
    return () => io.disconnect();
  }, []);

  // prova social: 1 toast a cada 11s, some após ~9s
  useEffect(() => {
    let alive = true;
    function next() {
      if (!alive) return;
      if (idxRef.current >= poolRef.current.length) { poolRef.current = gerarPool(); idxRef.current = 0; }
      const [nome, bairro] = poolRef.current[idxRef.current++];
      const verbo = VERBOS[(Math.random() * VERBOS.length) | 0];
      const tempo = TEMPOS[(Math.random() * TEMPOS.length) | 0];
      const cor = CORES[(Math.random() * CORES.length) | 0];
      const id = Date.now() + '-' + Math.random();
      setToasts((t) => [...t, { id, nome, cidade: bairro, verbo, tempo, cor }]);
      setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x))), 8500);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9100);
    }
    const start = setTimeout(() => { next(); }, 4200);
    const iv = setInterval(next, 11000);
    return () => { alive = false; clearTimeout(start); clearInterval(iv); };
  }, []);

  async function submitLead(e) {
    e.preventDefault();
    setLeadSending(true);
    try {
      await api.post('/public/join', {
        name: lead.name, phone: lead.phone, email: lead.email || undefined,
        cityName: 'Porto Alegre', supportType: 'MATERIAL_DIGITAL',
      });
      setLeadSent(true);
      toast.success('Plano de Governo a caminho!');
    } catch (err) { toast.error(apiError(err)); }
    finally { setLeadSending(false); }
  }

  async function submitJoin(e) {
    e.preventDefault();
    setSending(true);
    try {
      await api.post('/public/join', { ...form, cityName: form.cityName || 'Porto Alegre' });
      setSent(true);
      toast.success('Cadastro recebido!');
    } catch (err) { toast.error(apiError(err)); }
    finally { setSending(false); }
  }

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));

  return (
    <div className="mlp">
      {/* ================= HEADER ================= */}
      <header className={'mlp-header' + (scrolled ? ' scrolled' : '')}>
        <div className="mlp-wrap mlp-bar">
          <a href="#topo" className="mlp-brand">
            <span className="num num-rs" aria-label="Bandeira do Rio Grande do Sul"><RsFlag /></span>
            <span className="wm"><b>Márcio Bins Ely</b><small>Pré-candidato · Dep. Federal</small></span>
          </a>
          <nav className="mlp-menu">
            <a className="mlp-navlink" href="#bandeiras">Bandeiras</a>
            <a className="mlp-navlink" href="#realizacoes">Realizações</a>
            <a className="mlp-navlink" href="#trajetoria">Trajetória</a>
            <a className="mlp-navlink" href="#redes">Redes</a>
            <Link to="/login" className="mlp-enter">Entrar no sistema</Link>
            <a href="#apoie" className="mlp-btn mlp-btn--primary mlp-btn--sm">Some-se <ArrowRight size={16} /></a>
          </nav>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="mlp-hero" id="topo">
        <div className="mlp-hero-bg" aria-hidden="true">
          <span className="orb o1" /><span className="orb o2" /><span className="orb o3" />
          <span className="grid-lines" />
        </div>
        <div className="mlp-wrap mlp-hero-grid">
          <div className="mlp-hero-copy">
            <span className="mlp-eyebrow mlp-reveal"><Flag size={13} /> Pré-candidato a Deputado Federal · PDT</span>
            <h1 className="mlp-reveal">
              O Rio Grande<br /><span className="accent">pode mais.</span>
            </h1>
            <p className="mlp-lead mlp-reveal">
              E nós vamos provar isso juntos. Mais de 20 anos de trabalho por Porto Alegre — ex-presidente
              da Câmara, presidente do PDT da capital e uma política de proximidade feita
              <strong> com a comunidade</strong>, para a comunidade.
            </p>
            <div className="mlp-cta mlp-reveal">
              <a href="#apoie" className="mlp-btn mlp-btn--primary mlp-btn--lg">Quero apoiar a campanha <ArrowRight size={19} /></a>
              <a href="#realizacoes" className="mlp-btn mlp-btn--outline mlp-btn--lg">Ver realizações</a>
            </div>
            <div className="mlp-hero-trust mlp-reveal">
              <div><b>833</b><span>projetos apresentados</span></div>
              <div className="sep" />
              <div><b>6</b><span>frentes parlamentares</span></div>
              <div className="sep" />
              <div><b>6º</b><span>mandato de vereador</span></div>
            </div>
          </div>

          <div className="mlp-hero-visual mlp-reveal">
            <div className="mlp-portrait">
              <div className="glow" />
              <img src="/foto-web.webp" alt="Márcio Bins Ely" />
              <div className="mlp-badge b-bot"><Landmark size={18} /><div><small>Hoje</small><b>Presidente do PDT · POA</b></div></div>
            </div>
          </div>
        </div>
        <a href="#numeros" className="mlp-scroll" aria-label="Rolar"><ChevronDown size={20} /></a>
      </section>

      {/* ================= MARQUEE ================= */}
      <div className="mlp-marquee">
        <div className="mlp-track">
          <span>Saúde<i>·</i>Educação<i>·</i>Guaíba Despoluído<i>·</i>Moradia Popular<i>·</i>Cooperativismo<i>·</i>Esporte<i>·</i>Segurança<i>·</i>Cidadania<i>·</i></span>
          <span>Saúde<i>·</i>Educação<i>·</i>Guaíba Despoluído<i>·</i>Moradia Popular<i>·</i>Cooperativismo<i>·</i>Esporte<i>·</i>Segurança<i>·</i>Cidadania<i>·</i></span>
        </div>
      </div>

      {/* ================= NÚMEROS AO VIVO ================= */}
      <section className="mlp-block mlp-nums-block" id="numeros">
        <div className="mlp-wrap">
          <div className="mlp-nums">
            <StatLive icon={<Users size={20} />} value={fmt(stats?.supporters)} label="Apoiadores" />
            <StatLive icon={<Sparkles size={20} />} value={fmt(stats?.volunteers)} label="Voluntários" />
            <StatLive icon={<Flag size={20} />} value={fmt(stats?.banners)} label="Faixas nas casas" />
            <StatLive icon={<MapPin size={20} />} value={fmt(stats?.actions)} label="Ações de rua" />
          </div>
          <p className="mlp-nums-note"><span className="live-dot" /> Movimento crescendo em tempo real</p>
        </div>
      </section>

      {/* ================= BANDEIRAS ================= */}
      <section className="mlp-block mlp-soft" id="bandeiras">
        <div className="mlp-wrap">
          <div className="mlp-head mlp-reveal">
            <span className="mlp-eyebrow">O que defendemos</span>
            <h2>Bandeiras que mudam o seu dia a dia</h2>
            <p>Não são promessas soltas — são causas que já viram projeto de lei, frente parlamentar e trabalho de rua em Porto Alegre.</p>
          </div>
          <div className="mlp-pillars">
            <Pillar icon={<GraduationCap size={24} />} t="Educação de futuro" d="Educação digital e mídias sociais nas escolas, habilidades socioemocionais na infância e combate à desinformação." />
            <Pillar icon={<HeartPulse size={24} />} t="Saúde que acolhe" d="Práticas integrativas no SUS, incentivo à doação de órgãos e sangue e agilidade no atendimento de emergência." />
            <Pillar icon={<ShieldCheck size={24} />} t="Segurança nas escolas" d="Patrulha Escolar Comunitária para proteger alunos, professores e o entorno das escolas municipais." />
            <Pillar icon={<Droplets size={24} />} t="Guaíba despoluído" d="À frente da Frente Parlamentar pela despoluição das águas do Guaíba — recuperar nosso cartão-postal." />
            <Pillar icon={<Home size={24} />} t="Moradia digna" d="Apoio à moradia popular e à regularização fundiária, com segurança jurídica e dignidade para as famílias." />
            <Pillar icon={<Users size={24} />} t="Trabalho e cooperação" d="Fortalecimento do cooperativismo, do pequeno empreendedor e do jovem aprendiz como motor de emprego e renda." />
            <Pillar icon={<HeartHandshake size={24} />} t="Políticas em defesa das mulheres" d="Atuação em projetos de lei que defendem a vida e a integridade das mulheres diante dos números alarmantes de feminicídios no Estado." />
          </div>
        </div>
      </section>

      {/* ================= RAIZ GAÚCHA (foto real, história humana) ================= */}
      <section className="mlp-block mlp-raiz" id="raiz">
        <div className="mlp-wrap mlp-raiz-grid">
          <div className="mlp-raiz-photo mlp-reveal">
            <img src="/tradicao.webp" alt="Márcio Bins Ely de lenço vermelho, tomando chimarrão em acampamento farroupilha" loading="lazy" />
            <div className="mlp-raiz-tag"><Flag size={14} /> Desfile Farroupilha</div>
          </div>
          <div className="mlp-raiz-copy">
            <span className="mlp-eyebrow mlp-reveal">Raiz gaúcha</span>
            <h2 className="mlp-reveal">Gaúcho de verdade,<br />porto-alegrense de coração</h2>
            <p className="mlp-reveal">
              A tradição não é figurino de campanha, é a pilcha no Desfile Farroupilha, o lenço no
              pescoço e a bandeira do Rio Grande na mão. Dessa raiz vem o jeito de fazer política:{' '}
              <strong>perto das pessoas, com orgulho da nossa terra</strong>.
            </p>
          </div>
        </div>
      </section>

      {/* ================= REALIZAÇÕES (prova real) ================= */}
      <section className="mlp-block mlp-realiz" id="realizacoes">
        <div className="mlp-wrap">
          <div className="mlp-head mlp-reveal">
            <span className="mlp-eyebrow">Feito, não prometido</span>
            <h2>Realizações que viraram lei</h2>
            <p>Ideias que saíram do papel e hoje beneficiam quem vive em Porto Alegre.</p>
          </div>
          <div className="mlp-realiz-grid">
            <Realiz tag="Saúde · Segurança" t="Tipo sanguíneo no crachá do transporte" d="Lei aprovada que inclui o tipo sanguíneo nos crachás dos trabalhadores do transporte público — segundos que salvam vidas numa emergência." />
            <Realiz tag="Esporte · Juventude" t="E-Sports reconhecido como esporte" d="Porto Alegre reconhece o e-sport como prática esportiva, abrindo caminho para apoio, eventos e inclusão da juventude." />
            <Realiz tag="Educação · Segurança" t="Patrulha Escolar Comunitária" d="Programa que reforça a segurança dentro e no entorno das escolas municipais, protegendo alunos e educadores." />
            <Realiz tag="Educação · Tecnologia" t="Educação digital nas escolas" d="Alfabetização digital, uso consciente da internet e combate à desinformação na grade das escolas da rede municipal." />
          </div>
        </div>
      </section>

      {/* ================= FRENTES PARLAMENTARES ================= */}
      <section className="mlp-block mlp-soft" id="frentes">
        <div className="mlp-wrap">
          <div className="mlp-head mlp-reveal">
            <span className="mlp-eyebrow">Liderança comprovada</span>
            <h2>Frentes parlamentares que presido</h2>
            <p>À frente de causas estruturantes para a cidade, articulando soluções com a sociedade civil.</p>
          </div>
          <div className="mlp-frentes">
            <Frente n="01" t="Despoluição das Águas do Guaíba" d="Pela recuperação e saúde do nosso cartão-postal." />
            <Frente n="02" t="Apoio à Moradia Popular e Regularização Fundiária" d="Segurança jurídica e dignidade para as famílias." />
            <Frente n="03" t="Apoio ao Cooperativismo — FRENCOOP" d="Fortalecimento da economia cooperativa local." />
            <Frente n="04" t="Práticas Integrativas em Saúde" d="Ampliação do cuidado e do bem-estar no SUS municipal." />
            <Frente n="05" t="Incentivo à Doação de Órgãos e Sangue" d="Conscientização e política pública que salvam vidas." />
            <Frente n="06" t="Desenvolvimento do Mercado Imobiliário" d="Cidade que cresce com responsabilidade e gera emprego." />
          </div>
        </div>
      </section>

      {/* ================= IMÃ — Plano de Governo ================= */}
      <section className="mlp-block" id="plano">
        <div className="mlp-wrap">
          <div className="mlp-magnet mlp-reveal">
            <div className="mlp-magnet-inner">
              <div className="mlp-magnet-copy">
                <span className="mlp-eyebrow">Material exclusivo · Grátis</span>
                <h2>Receba o Plano de Governo completo</h2>
                <p>No seu WhatsApp ou e-mail: todas as propostas, metas e cronograma — e as novidades da campanha em primeira mão.</p>
                <ul>
                  <li><Check size={20} /> Bandeiras detalhadas por área</li>
                  <li><Check size={20} /> Metas com prazos e indicadores</li>
                  <li><Check size={20} /> Agenda de eventos perto de você</li>
                </ul>
              </div>
              <div className="mlp-form">
                {leadSent ? (
                  <div className="mlp-ok">
                    <div className="ok-ring"><Check size={40} /></div>
                    <h3>Recebido!</h3>
                    <p>Em instantes você recebe o material. Obrigado por caminhar conosco.</p>
                  </div>
                ) : (
                  <form onSubmit={submitLead}>
                    <h3>Receba agora, é grátis</h3>
                    <p className="sub">Preencha e enviamos o material.</p>
                    <div className="mlp-field"><input placeholder="Seu nome" value={lead.name} onChange={(e) => setLead((s) => ({ ...s, name: e.target.value }))} required /></div>
                    <div className="mlp-field"><input placeholder="WhatsApp (DDD + número)" value={lead.phone} onChange={(e) => setLead((s) => ({ ...s, phone: e.target.value }))} required /></div>
                    <div className="mlp-field"><input type="email" placeholder="Seu e-mail (opcional)" value={lead.email} onChange={(e) => setLead((s) => ({ ...s, email: e.target.value }))} /></div>
                    <button className="mlp-btn mlp-btn--primary mlp-btn--block" disabled={leadSending}>
                      {leadSending ? 'Enviando...' : 'Quero o Plano de Governo'}
                    </button>
                    <p className="privacy"><ShieldCheck size={13} /> Seus dados estão seguros. Sem spam.</p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= VISION ================= */}
      <section className="mlp-block mlp-vision">
        <div className="mlp-wrap">
          <div className="quote-mark">”</div>
          <blockquote>Política se faz <span className="hl">com</span> as pessoas, não <span className="hl">pelas</span> pessoas. É caminhando junto, com trabalho e coerência, que Porto Alegre muda de verdade.</blockquote>
          <div className="mlp-by">
            <img src="/foto.png" alt="Márcio Bins Ely" />
            <div><b>Márcio Bins Ely</b><span>Pré-candidato a Deputado Federal · PDT</span></div>
          </div>
        </div>
      </section>

      {/* ================= TRAJETÓRIA ================= */}
      <section className="mlp-block mlp-soft" id="trajetoria">
        <div className="mlp-wrap">
          <div className="mlp-head mlp-reveal">
            <span className="mlp-eyebrow">Quem é Márcio</span>
            <h2>Uma trajetória de resultados</h2>
            <p>Advogado (OAB/RS), pós-graduado em Direito Público. Quase duas décadas dedicadas à capital gaúcha, do Executivo ao Legislativo.</p>
          </div>
          <div className="mlp-timeline">
            <Tl yr="2006" t="Secretário de Esportes, Recreação e Lazer" d="Primeira grande gestão pública na Prefeitura de Porto Alegre." />
            <Tl yr="2009–2012" t="Secretário de Planejamento" d="À frente do planejamento estratégico da capital gaúcha." />
            <Tl yr="2021" t="Presidente da Câmara Municipal" d="Eleito para presidir o Legislativo, chegando a assumir interinamente a Prefeitura." />
            <Tl yr="Hoje" t="6º mandato · Presidente do PDT-POA" d="833 projetos apresentados e a liderança de 6 frentes parlamentares estruturantes." />
          </div>
        </div>
      </section>

      {/* ================= REDES SOCIAIS ================= */}
      <section className="mlp-block mlp-social" id="redes">
        <div className="mlp-wrap">
          <div className="mlp-head mlp-reveal">
            <span className="mlp-eyebrow">Vem com a gente</span>
            <h2>Acompanhe nas redes</h2>
            <p>Bastidores, conquistas e a agenda da campanha em primeira mão. Siga, comente e compartilhe — sua voz fortalece o movimento.</p>
          </div>
          <div className="mlp-soc-grid">
            <a href="https://instagram.com/marciobinsely" target="_blank" rel="noopener noreferrer" className="mlp-soc ig mlp-reveal">
              <div className="top"><div className="ic"><IgIcon /></div><span className="live"><span className="dot" /> Ao vivo</span></div>
              <div className="mid"><h3>Instagram</h3><div className="handle">@marciobinsely</div></div>
              <span className="go">Seguir <ArrowRight size={16} /></span>
              <span className="bgnum">IG</span>
            </a>
            <a href="https://facebook.com/marciobinsely12345" target="_blank" rel="noopener noreferrer" className="mlp-soc fb mlp-reveal">
              <div className="top"><div className="ic"><FbIcon /></div><span className="live"><span className="dot" /> Online</span></div>
              <div className="mid"><h3>Facebook</h3><div className="handle">/marciobinsely12345</div></div>
              <span className="go">Curtir página <ArrowRight size={16} /></span>
              <span className="bgnum">f</span>
            </a>
            <a href="https://youtube.com/channel/UCrLCED_PdfgOHyvvlDseC1w" target="_blank" rel="noopener noreferrer" className="mlp-soc yt mlp-reveal">
              <div className="top"><div className="ic"><YtIcon /></div><span className="live"><span className="dot" /> Inscreva-se</span></div>
              <div className="mid"><h3>YouTube</h3><div className="handle">Canal Márcio Bins Ely</div></div>
              <span className="go">Inscrever-se <ArrowRight size={16} /></span>
              <span className="bgnum">▶</span>
            </a>
          </div>
        </div>
      </section>

      {/* ================= CTA FINAL + PARTICIPAR ================= */}
      <section className="mlp-block mlp-final" id="apoie">
        <div className="mlp-final-bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /></div>
        <div className="mlp-wrap mlp-final-grid">
          <div className="mlp-final-copy">
            <span className="mlp-eyebrow" style={{ color: 'var(--gold)' }}>Some-se ao movimento</span>
            <h2>Faça parte dessa mudança</h2>
            <p>Sua voz, seu voto e suas mãos constroem a Porto Alegre que a gente quer. Escolha como quer caminhar junto — leva menos de um minuto.</p>
            <div className="mlp-final-perks">
              <span><Check size={16} /> Voluntariado</span>
              <span><Check size={16} /> Faixa na sua casa</span>
              <span><Check size={16} /> Eventos e caminhadas</span>
            </div>
            <a href="https://wa.me/5551993069837" target="_blank" rel="noopener noreferrer" className="mlp-btn mlp-btn--glass mlp-btn--lg">
              Falar direto no WhatsApp <WaIcon />
            </a>
          </div>
          <div className="mlp-join-form">
            {sent ? (
              <div className="mlp-join-ok">
                <div className="ok"><Check size={30} /></div>
                <h3>Recebemos seu cadastro!</h3>
                <p>Em breve entraremos em contato. Obrigado por apoiar.</p>
              </div>
            ) : (
              <form onSubmit={submitJoin}>
                <h3>Quero participar</h3>
                <p className="sub">Voluntário, faixa na casa, eventos e muito mais.</p>
                <div className="mlp-field"><input placeholder="Seu nome" value={form.name || ''} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required /></div>
                <div className="mlp-field"><input placeholder="WhatsApp (DDD + número)" value={form.phone || ''} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} required /></div>
                <div className="mlp-field"><input placeholder="Seu bairro" value={form.neighborhood || ''} onChange={(e) => setForm((s) => ({ ...s, neighborhood: e.target.value }))} /></div>
                <div className="mlp-field">
                  <select value={form.supportType} onChange={(e) => setForm((s) => ({ ...s, supportType: e.target.value }))}>
                    {options('SupportType').map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </div>
                <button className="mlp-btn mlp-btn--primary mlp-btn--block mlp-btn--lg" disabled={sending}>
                  {sending ? 'Enviando...' : 'Quero apoiar a campanha'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="mlp-footer">
        <div className="mlp-wrap">
          <div className="mlp-foot-grid">
            <div>
              <div className="mlp-foot-brand"><span className="num num-rs" aria-label="Bandeira do Rio Grande do Sul"><RsFlag /></span><b>Márcio Bins Ely</b></div>
              <p style={{ maxWidth: 340 }}>O Rio Grande pode mais — e nós vamos provar isso juntos. Mais de 20 anos de trabalho e idealismo, com ética e coerência, ao lado da comunidade.</p>
              <div className="mlp-socials">
                <a href="https://instagram.com/marciobinsely" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><IgIcon /></a>
                <a href="https://facebook.com/marciobinsely12345" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><FbIcon /></a>
                <a href="https://youtube.com/channel/UCrLCED_PdfgOHyvvlDseC1w" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><YtIcon /></a>
              </div>
            </div>
            <div>
              <h4>Navegação</h4>
              <a href="#bandeiras">Bandeiras</a>
              <a href="#realizacoes">Realizações</a>
              <a href="#frentes">Frentes parlamentares</a>
              <a href="#trajetoria">Trajetória</a>
              <a href="#plano">Plano de Governo</a>
            </div>
            <div>
              <h4>Contato</h4>
              <a href="mailto:contato@marciobinsely.com.br">contato@marciobinsely.com.br</a>
              <a href="https://wa.me/5551993069837" target="_blank" rel="noopener noreferrer">WhatsApp (51) 99306-9837</a>
              <a href="https://marciobinsely.com.br" target="_blank" rel="noopener noreferrer">marciobinsely.com.br</a>
              <p>Porto Alegre · RS</p>
            </div>
          </div>
          <div className="mlp-foot-bottom">
            © {new Date().getFullYear()} Márcio Bins Ely · Vereador · Porto Alegre/RS · PDT
          </div>
        </div>
      </footer>

      {/* ================= TOASTS DE PROVA SOCIAL ================= */}
      <div className="mlp-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'mlp-toast' + (t.out ? ' out' : '')}>
            <div className="av" style={{ background: `linear-gradient(135deg, ${t.cor[0]}, ${t.cor[1]})` }}>{t.nome[0]}</div>
            <div className="tx"><b>{t.nome}, do {t.cidade}</b><span>{t.verbo} · {t.tempo}</span></div>
            <div className="chk"><Check size={13} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Subcomponentes ===== */
function StatLive({ icon, value, label }) {
  return (
    <div className="mlp-num mlp-reveal">
      <div className="ic">{icon}</div>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
function Pillar({ icon, t, d }) {
  return (<div className="mlp-pillar mlp-reveal"><div className="ic">{icon}</div><h3>{t}</h3><p>{d}</p><span className="arw"><ArrowRight size={16} /></span></div>);
}
function Realiz({ tag, t, d }) {
  return (<div className="mlp-realiz-card mlp-reveal"><span className="tag">{tag}</span><h3>{t}</h3><p>{d}</p><div className="seal"><BadgeCheck size={16} /> Realizado</div></div>);
}
function Frente({ n, t, d }) {
  return (<div className="mlp-frente mlp-reveal"><div className="n">{n}</div><div><h3>{t}</h3><p>{d}</p></div></div>);
}
function Tl({ yr, t, d }) {
  return (<div className="mlp-tl mlp-reveal"><div className="yr">{yr}</div><h3>{t}</h3><p>{d}</p></div>);
}

/* Bandeira do RS estilizada (faixas diagonais verde/vermelho/amarelo). */
function RsFlag() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <clipPath id="rsclip"><rect x="0" y="0" width="48" height="48" rx="13" /></clipPath>
      </defs>
      <g clipPath="url(#rsclip)">
        <polygon points="0,0 48,0 48,10 0,28" fill="#2bb153" />
        <polygon points="0,28 48,10 48,30 0,48" fill="#f3083e" />
        <polygon points="0,48 48,30 48,48" fill="#fec330" />
      </g>
    </svg>
  );
}

/* ===== Ícones de marca (SVG inline) ===== */
function IgIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>);
}
function FbIcon() {
  return (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></svg>);
}
function YtIcon() {
  return (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.5-.46-5.17a3 3 0 00-2.12-2.12C18.75 4.25 12 4.25 12 4.25s-6.75 0-8.42.46A3 3 0 001.46 6.83C1 8.5 1 12 1 12s0 3.5.46 5.17a3 3 0 002.12 2.12c1.67.46 8.42.46 8.42.46s6.75 0 8.42-.46a3 3 0 002.12-2.12C23 15.5 23 12 23 12zM10 15.5v-7l6 3.5z" /></svg>);
}
function WaIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zM6.597 20.13c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607z" /></svg>);
}
