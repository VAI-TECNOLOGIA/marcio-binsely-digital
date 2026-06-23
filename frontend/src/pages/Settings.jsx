import { useEffect, useState } from 'react';
import { Save, Settings as Cog, Target, Trophy, Package, MapPinned, ShieldCheck } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card } from '../components/ui/Card.jsx';
import Field from '../components/ui/Field.jsx';
import ResourcePage from '../components/ResourcePage.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import api, { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { tasks, materials } from '../config/resources.jsx';
import { label } from '../config/enums.js';

const CAMPAIGN_FIELDS = [
  { name: 'name', label: 'Nome do sistema' },
  { name: 'candidate', label: 'Candidato' },
  { name: 'office', label: 'Cargo' },
  { name: 'party', label: 'Partido' },
  { name: 'number', label: 'Número' },
  { name: 'city', label: 'Cidade' },
  { name: 'uf', label: 'UF' },
  { name: 'slogan', label: 'Slogan', full: true },
];

const regionsConfig = {
  endpoint: '/regions',
  singular: 'região',
  createLabel: 'Nova região',
  titleField: 'name',
  writeRoles: ['LIDER'],
  searchable: false,
  columns: [
    { key: 'name', label: 'Região', render: (r) => <div className="cell-strong">{r.name}</div> },
    { key: 'uf', label: 'UF', render: (r) => r.uf },
    { key: 'color', label: 'Cor', render: (r) => <span className="legend-dot" style={{ background: r.color || '#cbd5e1', display: 'inline-block' }} /> },
    { key: 'count', label: 'Apoiadores', render: (r) => r._count?.supporters ?? 0 },
  ],
  fields: [
    { name: 'name', label: 'Nome', required: true },
    { name: 'uf', label: 'UF', placeholder: 'RS' },
    { name: 'color', label: 'Cor (hex)', placeholder: '#C8102E' },
  ],
};

export default function Settings() {
  const toast = useToast();
  const [campaign, setCampaign] = useState(null);
  const [goals, setGoals] = useState({});
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([api.get('/settings'), api.get('/settings/roles')]);
        setCampaign(s.data?.campaign || {});
        setGoals(s.data?.goals || {});
        setRoles(r.data.data);
      } catch (e) {
        toast.error(apiError(e));
        setCampaign({});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(key, value, msg) {
    try {
      await api.put(`/settings/${key}`, { value });
      toast.success(msg);
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  if (!campaign) {
    return (
      <Layout title="Configurações">
        <LoadingBox />
      </Layout>
    );
  }

  return (
    <Layout title="Configurações" subtitle="Identidade da campanha, metas, catálogos e perfis">
      <div className="grid grid-2">
        <Card title="Dados da campanha" icon={Cog} actions={<button className="btn btn-primary btn-sm" onClick={() => save('campaign', campaign, 'Dados salvos!')}><Save size={15} /> Salvar</button>}>
          <div className="form-grid">
            {CAMPAIGN_FIELDS.map((f) => (
              <Field key={f.name} field={f} value={campaign[f.name]} onChange={(n, v) => setCampaign((s) => ({ ...s, [n]: v }))} />
            ))}
          </div>
        </Card>

        <Card title="Metas da campanha" icon={Target} actions={<button className="btn btn-primary btn-sm" onClick={() => save('goals', { volunteers: Number(goals.volunteers) || 0, supporters: Number(goals.supporters) || 0, banners: Number(goals.banners) || 0, actions: Number(goals.actions) || 0 }, 'Metas salvas!')}><Save size={15} /> Salvar</button>}>
          <div className="form-grid">
            <Field field={{ name: 'volunteers', label: 'Meta de voluntários', type: 'number' }} value={goals.volunteers} onChange={(n, v) => setGoals((s) => ({ ...s, [n]: v }))} />
            <Field field={{ name: 'supporters', label: 'Meta de apoiadores', type: 'number' }} value={goals.supporters} onChange={(n, v) => setGoals((s) => ({ ...s, [n]: v }))} />
            <Field field={{ name: 'banners', label: 'Meta de faixas', type: 'number' }} value={goals.banners} onChange={(n, v) => setGoals((s) => ({ ...s, [n]: v }))} />
            <Field field={{ name: 'actions', label: 'Meta de ações', type: 'number' }} value={goals.actions} onChange={(n, v) => setGoals((s) => ({ ...s, [n]: v }))} />
          </div>
        </Card>
      </div>

      <h3 style={{ margin: '26px 0 14px' }}><Trophy size={18} style={{ verticalAlign: '-3px' }} /> Catálogo de pontuação (tarefas)</h3>
      <ResourcePage config={tasks} />

      <h3 style={{ margin: '26px 0 14px' }}><Package size={18} style={{ verticalAlign: '-3px' }} /> Catálogo de materiais</h3>
      <ResourcePage config={materials} />

      <h3 style={{ margin: '26px 0 14px' }}><MapPinned size={18} style={{ verticalAlign: '-3px' }} /> Regiões e cidades</h3>
      <ResourcePage config={regionsConfig} />

      <h3 style={{ margin: '26px 0 14px' }}><ShieldCheck size={18} style={{ verticalAlign: '-3px' }} /> Perfis de acesso</h3>
      <Card noBody>
        <div className="card-body">
          {roles.map((r) => (
            <div className="rank-row" key={r.id}>
              <Badge tone="blue">{label('UserRole', r.key)}</Badge>
              <div className="rank-info">
                <strong>{r.name}</strong>
                <span>{r.description}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Layout>
  );
}
