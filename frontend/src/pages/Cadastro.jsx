import { useState } from 'react';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import '../styles/cadastro.css';

/**
 * Formulário público de cadastro — substitui o Fluent Forms do WordPress.
 *
 * Diferenças de propósito em relação ao original:
 * - Só Nome e WhatsApp são obrigatórios. No formulário antigo TUDO era
 *   obrigatório (inclusive rede social e endereço completo), o que derruba
 *   conversão: quem não tem Instagram ou não quer dar o endereço desiste.
 * - O CEP preenche rua/bairro/cidade sozinho (ViaCEP), reduzindo a digitação
 *   no celular, que é de onde vem a maior parte do tráfego.
 */

const VAZIO = {
  nome: '', whatsapp: '', email: '', social: '',
  cep: '', endereco: '', bairro: '', cidade: '',
  propaganda: '', indicacao: '', aceite: false,
};

// (51) 99999-9999
function mascaraTelefone(v) {
  let d = v.replace(/\D/g, '');
  // Muita gente cola o número com o código do país ("+55 47 98866-5310").
  // Sem tirar o 55 antes de cortar em 11, o DDD vira 55 e o número fica errado
  // — e ninguém percebe até a mensagem não chegar.
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const mascaraCep = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export default function Cadastro() {
  const [f, setF] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroGeral, setErroGeral] = useState('');

  const set = (campo) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, [campo]: v }));
    setErros((s) => (s[campo] ? { ...s, [campo]: undefined } : s));
  };

  async function buscarCep(valor) {
    const d = valor.replace(/\D/g, '');
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const dados = await r.json();
      if (!dados.erro) {
        setF((s) => ({
          ...s,
          endereco: s.endereco || dados.logradouro || '',
          bairro: dados.bairro || s.bairro,
          cidade: dados.localidade || s.cidade,
        }));
      }
    } catch {
      /* CEP é conveniência: falhou, a pessoa digita à mão */
    } finally {
      setBuscandoCep(false);
    }
  }

  function validar() {
    const e = {};
    if (f.nome.trim().split(/\s+/).length < 2) e.nome = 'Informe nome e sobrenome.';
    if (f.whatsapp.replace(/\D/g, '').length < 10) e.whatsapp = 'Informe um WhatsApp válido com DDD.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'E-mail inválido.';
    if (!f.aceite) e.aceite = 'É preciso aceitar para continuar.';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function enviar(ev) {
    ev.preventDefault();
    setErroGeral('');
    if (!validar()) {
      document.querySelector('.cad-erro-campo')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setEnviando(true);
    try {
      // Mesmos nomes de campo do site antigo: o back aceita os dois formatos.
      await api.post('/public/site', {
        names: { first_name: f.nome.trim() },
        whatsApp: f.whatsapp,
        email: f.email || undefined,
        input_social: f.social || undefined,
        input_cep: f.cep || undefined,
        input_endereco: f.endereco || undefined,
        input_bairro: f.bairro || undefined,
        input_cidade: f.cidade || undefined,
        input_propaganda: f.propaganda || undefined,
        input_indicacao: f.indicacao || undefined,
      });
      setPronto(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErroGeral(apiError(err, 'Não foi possível enviar agora. Tente novamente em instantes.'));
    } finally {
      setEnviando(false);
    }
  }

  // Lado visual: foto do candidato, bandeira do RS e números reais da campanha.
  const painel = (
    <aside className="cad-visual">
      <div className="cad-foto" />
      <div className="cad-tint" />
      <div className="cad-sombra" />
      <div className="cad-flag"><i className="g" /><i className="y" /><i className="r" /></div>

      <div className="cad-visual-txt">
        <span className="cad-visual-tag">Vereador de Porto Alegre · PDT</span>
        <h2>
          O Rio Grande<br /><em>pode mais.</em>
        </h2>
        <p>Mais de 20 anos de trabalho por Porto Alegre — uma política de proximidade,
          feita com a comunidade.</p>
        <ul className="cad-numeros">
          <li><strong>833</strong><span>projetos apresentados</span></li>
          <li><strong>6</strong><span>frentes parlamentares</span></li>
          <li><strong>6º</strong><span>mandato de vereador</span></li>
        </ul>
      </div>
    </aside>
  );

  if (pronto) {
    return (
      <main className="cad">
        <div className="cad-split">
          {painel}
          <div className="cad-form-side">
            <div className="cad-box cad-ok">
              <div className="cad-ok-ic"><Check size={30} /></div>
              <h1>Cadastro recebido!</h1>
              <p>
                Obrigado, <strong>{f.nome.trim().split(' ')[0]}</strong>. Sua inscrição chegou para a
                equipe da campanha e em breve entraremos em contato pelo WhatsApp.
              </p>
              <button className="cad-btn cad-btn-sec" onClick={() => { setF(VAZIO); setPronto(false); }}>
                Cadastrar outra pessoa
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="cad">
      <div className="cad-split">
        {painel}
        <div className="cad-form-side">
      <form className="cad-box" onSubmit={enviar} noValidate>
        <header className="cad-head">
          <span className="cad-tag">Márcio Bins Ely · Vereador · PDT</span>
          <h1>Faça parte da campanha</h1>
          <p>Preencha seus dados e some-se ao movimento.</p>
        </header>

        {erroGeral && <div className="cad-alerta">{erroGeral}</div>}

        <div className="cad-campo">
          <label htmlFor="nome">Nome completo <b>*</b></label>
          <input id="nome" value={f.nome} onChange={set('nome')} placeholder="Ex: João da Silva"
            autoComplete="name" className={erros.nome ? 'cad-erro-campo' : ''} />
          {erros.nome && <small className="cad-erro">{erros.nome}</small>}
        </div>

        <div className="cad-campo">
          <label htmlFor="zap">WhatsApp <b>*</b></label>
          <input id="zap" inputMode="numeric" autoComplete="tel" placeholder="(51) 99999-9999"
            value={f.whatsapp}
            onChange={(e) => setF((s) => ({ ...s, whatsapp: mascaraTelefone(e.target.value) }))}
            className={erros.whatsapp ? 'cad-erro-campo' : ''} />
          {erros.whatsapp && <small className="cad-erro">{erros.whatsapp}</small>}
        </div>

        <div className="cad-linha">
          <div className="cad-campo">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" value={f.email} onChange={set('email')}
              placeholder="contato@gmail.com" autoComplete="email"
              className={erros.email ? 'cad-erro-campo' : ''} />
            {erros.email && <small className="cad-erro">{erros.email}</small>}
          </div>
          <div className="cad-campo">
            <label htmlFor="social">Instagram</label>
            <input id="social" value={f.social} onChange={set('social')} placeholder="@seuperfil" />
          </div>
        </div>

        <div className="cad-linha">
          <div className="cad-campo cad-campo-cep">
            <label htmlFor="cep">CEP</label>
            <input id="cep" inputMode="numeric" placeholder="91520-600" value={f.cep}
              onChange={(e) => { const v = mascaraCep(e.target.value); setF((s) => ({ ...s, cep: v })); buscarCep(v); }} />
            {buscandoCep && <span className="cad-cep-carregando"><Loader2 size={13} /> buscando…</span>}
          </div>
          <div className="cad-campo">
            <label htmlFor="cidade">Cidade</label>
            <input id="cidade" value={f.cidade} onChange={set('cidade')} placeholder="Porto Alegre" />
          </div>
        </div>

        <div className="cad-linha">
          <div className="cad-campo">
            <label htmlFor="endereco">Endereço</label>
            <input id="endereco" value={f.endereco} onChange={set('endereco')} placeholder="Rua São Pedro, 599" />
          </div>
          <div className="cad-campo">
            <label htmlFor="bairro">Bairro</label>
            <input id="bairro" value={f.bairro} onChange={set('bairro')} placeholder="Cidade Baixa" />
          </div>
        </div>

        <fieldset className="cad-campo cad-radio">
          <legend>Aceita colocar uma propaganda na sua residência e receber o kit de material?</legend>
          <div className="cad-opcoes">
            {['Sim', 'Não'].map((op) => (
              <label key={op} className={f.propaganda === op ? 'on' : ''}>
                <input type="radio" name="propaganda" value={op}
                  checked={f.propaganda === op} onChange={set('propaganda')} />
                {op}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="cad-campo">
          <label htmlFor="indicacao">Quem te indicou?</label>
          <input id="indicacao" value={f.indicacao} onChange={set('indicacao')} placeholder="Primeiro e último nome" />
        </div>

        <label className={`cad-aceite ${erros.aceite ? 'cad-erro-campo' : ''}`}>
          <input type="checkbox" checked={f.aceite} onChange={set('aceite')} />
          <span>
            Li e concordo com os <a href="/termos" target="_blank" rel="noopener">Termos de Uso</a> e com a{' '}
            <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>, e autorizo o
            contato da campanha pelo WhatsApp.
          </span>
        </label>
        {erros.aceite && <small className="cad-erro">{erros.aceite}</small>}

        <button className="cad-btn" type="submit" disabled={enviando}>
          {enviando ? <><Loader2 size={17} className="cad-girando" /> Enviando…</> : 'Quero fazer parte'}
        </button>

        <p className="cad-rodape">
          <ShieldCheck size={14} /> Seus dados são usados apenas pela campanha e não são vendidos
          nem compartilhados com terceiros.
        </p>
      </form>
        </div>
      </div>
    </main>
  );
}
