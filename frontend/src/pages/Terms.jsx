import { Link } from 'react-router-dom';
import '../styles/legal.css';

function RsFlag() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" width="100%" height="100%">
      <defs><clipPath id="rsclip-tm"><rect x="0" y="0" width="48" height="48" rx="13" /></clipPath></defs>
      <g clipPath="url(#rsclip-tm)">
        <polygon points="0,0 48,0 48,10 0,28" fill="#2bb153" />
        <polygon points="0,28 48,10 48,30 0,48" fill="#f3083e" />
        <polygon points="0,48 48,30 48,48" fill="#fec330" />
      </g>
    </svg>
  );
}

export default function Terms() {
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
        <h1>Termos de Uso</h1>
        <p className="legal-sub">Última atualização: 12 de agosto de 2026</p>

        <p>
          Estes Termos de Uso regem o acesso e a utilização da plataforma <strong>Márcio Binsely Digital</strong>
          (site, aplicativo e formulários de apoio) da campanha de <strong>Márcio Bins Ely</strong>. Ao se
          cadastrar ou utilizar a plataforma, você concorda com estes termos.
        </p>

        <h2>1. Objeto</h2>
        <p>
          A plataforma tem finalidade exclusivamente <strong>cívica e de mobilização política</strong>: organizar
          apoiadores e voluntários, divulgar propostas e realizações e receber demandas da população, em
          conformidade com a legislação eleitoral.
        </p>

        <h2>2. Cadastro e veracidade</h2>
        <ul>
          <li>Você declara que os dados informados são verdadeiros e de sua titularidade.</li>
          <li>É proibido cadastrar terceiros sem autorização ou usar dados falsos.</li>
          <li>Cadastros suspeitos de fraude podem ser bloqueados.</li>
        </ul>

        <h2>3. Uso adequado</h2>
        <p>Ao utilizar a plataforma, você se compromete a não:</p>
        <ul>
          <li>Violar leis, direitos de terceiros ou a legislação eleitoral;</li>
          <li>Tentar acessar áreas restritas ou comprometer a segurança do sistema;</li>
          <li>Utilizar os dados de outros participantes para fins alheios à campanha.</li>
        </ul>

        <h2>4. Comunicações</h2>
        <p>
          Ao se cadastrar, você autoriza o recebimento de comunicações da campanha pelos canais informados
          (WhatsApp, e-mail, SMS). Você pode cancelar o recebimento a qualquer momento pelos canais de contato.
        </p>

        <h2>5. Contas de equipe</h2>
        <p>
          Usuários internos (coordenadores, voluntários e parceiros) recebem acesso conforme seu perfil e são
          responsáveis por manter a confidencialidade de suas credenciais e pelo uso adequado dos dados a que
          têm acesso.
        </p>

        <h2>6. Privacidade e dados pessoais</h2>
        <p>
          O tratamento de dados pessoais segue a nossa{' '}
          <Link to="/privacidade">Política de Privacidade</Link>. Você pode solicitar a exclusão dos seus dados
          a qualquer momento em <Link to="/excluir-dados">Excluir meus dados</Link>.
        </p>

        <h2>7. Limitação de responsabilidade</h2>
        <p>
          A plataforma é fornecida “no estado em que se encontra”. Empregamos esforços razoáveis para mantê-la
          disponível e segura, mas não garantimos ausência de interrupções ou falhas.
        </p>

        <h2>8. Alterações</h2>
        <p>
          Estes termos podem ser atualizados. A data no topo indica a versão vigente; o uso continuado após
          alterações implica concordância.
        </p>

        <h2>9. Contato</h2>
        <div className="legal-box">
          <div className="legal-contact">
            <a href="mailto:contato@marciobinsely.com.br">✉️ contato@marciobinsely.com.br</a>
            <a href="https://wa.me/5551993069837" target="_blank" rel="noopener noreferrer">💬 WhatsApp (51) 99306-9837</a>
          </div>
        </div>
      </main>

      <footer className="legal-foot">
        © {new Date().getFullYear()} Márcio Bins Ely · Porto Alegre/RS ·{' '}
        <Link to="/privacidade">Política de Privacidade</Link>
      </footer>
    </div>
  );
}
