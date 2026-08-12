import { Link } from 'react-router-dom';
import '../styles/legal.css';

/* Bandeira do RS estilizada (mesmo motivo da landing). */
function RsFlag() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" width="100%" height="100%">
      <defs><clipPath id="rsclip-pv"><rect x="0" y="0" width="48" height="48" rx="13" /></clipPath></defs>
      <g clipPath="url(#rsclip-pv)">
        <polygon points="0,0 48,0 48,10 0,28" fill="#2bb153" />
        <polygon points="0,28 48,10 48,30 0,48" fill="#f3083e" />
        <polygon points="0,48 48,30 48,48" fill="#fec330" />
      </g>
    </svg>
  );
}

export default function Privacy() {
  return (
    <div className="legal">
      <header className="legal-top">
        <div className="wrap">
          <span className="legal-flag"><RsFlag /></span>
          <b>Márcio Bins Ely · Márcio Binsely Digital</b>
          <Link to="/lp">Voltar ao site</Link>
        </div>
      </header>

      <main className="legal-card">
        <h1>Política de Privacidade</h1>
        <p className="legal-sub">Última atualização: 12 de agosto de 2026</p>

        <p>
          Esta Política de Privacidade descreve como a campanha de <strong>Márcio Bins Ely</strong> (“nós”)
          coleta, usa, armazena e protege os dados pessoais tratados na plataforma <strong>Márcio Binsely
          Digital</strong> (site, aplicativo e formulários de apoio), em conformidade com a
          <strong> Lei nº 13.709/2018 (LGPD)</strong> e a legislação eleitoral brasileira.
        </p>

        <h2>1. Quem é o controlador dos dados</h2>
        <p>
          O controlador é a campanha de Márcio Bins Ely (Porto Alegre/RS). Para qualquer questão relativa a
          dados pessoais, use os canais de contato descritos no item 9.
        </p>

        <h2>2. Quais dados coletamos</h2>
        <ul>
          <li><strong>Dados de identificação e contato:</strong> nome, telefone/WhatsApp, e-mail.</li>
          <li><strong>Dados de localização:</strong> cidade, bairro, CEP e endereço (quando informados), para organização territorial da mobilização.</li>
          <li><strong>Dados de participação:</strong> tipo de apoio, engajamento, pedidos de material e demandas registradas.</li>
          <li><strong>Dados técnicos:</strong> endereço IP e data/hora dos cadastros e solicitações, para segurança e prevenção a fraude.</li>
        </ul>
        <p>Fornecer os dados é voluntário — você decide se quer apoiar. Sem os dados de contato, porém, não conseguimos manter você informado.</p>

        <h2>3. Para que usamos os dados</h2>
        <ul>
          <li>Organizar apoiadores e voluntários e coordenar ações de rua e mobilização.</li>
          <li>Enviar comunicações da campanha (avisos, convites e novidades) pelos canais autorizados.</li>
          <li>Registrar e responder demandas e pedidos da população.</li>
          <li>Prevenir fraudes e cadastros duplicados/maliciosos.</li>
        </ul>

        <h2>4. Base legal</h2>
        <p>
          O tratamento se apoia no <strong>consentimento</strong> do titular (art. 7º, I da LGPD) e no
          <strong> legítimo interesse</strong> da campanha para mobilização política (art. 7º, IX),
          sempre respeitando seus direitos e liberdades.
        </p>

        <h2>5. Compartilhamento</h2>
        <p>
          <strong>Não vendemos seus dados.</strong> Eles podem ser tratados por prestadores que operam a
          plataforma em nosso nome (hospedagem, envio de mensagens por WhatsApp/e-mail), sempre sob
          obrigação de confidencialidade e apenas na medida necessária. Também podemos divulgar dados quando
          exigido por lei ou autoridade competente (inclusive a Justiça Eleitoral).
        </p>

        <h2>6. Armazenamento e segurança</h2>
        <p>
          Os dados são armazenados em servidores com acesso restrito e conexão criptografada (HTTPS). Adotamos
          controle de acesso por perfil, senhas protegidas por criptografia e registros de auditoria. Mantemos
          os dados apenas pelo tempo necessário às finalidades acima ou enquanto durar a campanha, salvo
          obrigação legal de retenção.
        </p>

        <h2>7. Cookies</h2>
        <p>
          Utilizamos armazenamento local do navegador apenas para manter sua sessão autenticada e preferências
          de uso. Não usamos cookies de rastreamento publicitário de terceiros.
        </p>

        <h2>8. Seus direitos (LGPD, art. 18)</h2>
        <p>Você pode, a qualquer momento, solicitar:</p>
        <ul>
          <li>Confirmação da existência de tratamento e <strong>acesso</strong> aos seus dados;</li>
          <li><strong>Correção</strong> de dados incompletos, inexatos ou desatualizados;</li>
          <li><strong>Eliminação</strong> dos dados e revogação do consentimento;</li>
          <li>Informação sobre com quem compartilhamos seus dados.</li>
        </ul>
        <p>
          Para <strong>excluir seus dados</strong>, use nossa página dedicada:
          {' '}<Link to="/excluir-dados"><strong>Excluir meus dados</strong></Link>.
        </p>

        <h2>9. Contato do encarregado</h2>
        <div className="legal-box">
          <p style={{ margin: 0 }}>Fale com a campanha sobre privacidade e dados pessoais:</p>
          <div className="legal-contact">
            <a href="mailto:contato@marciobinsely.com.br">✉️ contato@marciobinsely.com.br</a>
            <a href="https://wa.me/5551993069837" target="_blank" rel="noopener noreferrer">💬 WhatsApp (51) 99306-9837</a>
          </div>
        </div>

        <h2>10. Alterações</h2>
        <p>
          Esta política pode ser atualizada. A data de “última atualização” no topo indica a versão vigente.
          Alterações relevantes serão comunicadas pelos nossos canais.
        </p>
      </main>

      <footer className="legal-foot">
        © {new Date().getFullYear()} Márcio Bins Ely · Porto Alegre/RS ·{' '}
        <Link to="/excluir-dados">Excluir meus dados</Link>
      </footer>
    </div>
  );
}
