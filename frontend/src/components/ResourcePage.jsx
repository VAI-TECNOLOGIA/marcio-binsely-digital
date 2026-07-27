import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, Download } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card } from './ui/Card.jsx';
import DataTable from './ui/DataTable.jsx';
import Pagination from './ui/Pagination.jsx';
import Modal from './ui/Modal.jsx';
import Field from './ui/Field.jsx';
import { LoadingBox } from './ui/Spinner.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { options } from '../config/enums.js';
import { toInputDate } from '../lib/format.js';

/** Página de recurso genérica: lista paginada com busca, filtros e CRUD em modal. */
export default function ResourcePage({ config }) {
  const toast = useToast();
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState(null);
  const [ordem, setOrdem] = useState('az');
  const [exportando, setExportando] = useState(false);
  const [lookups, setLookups] = useState({});
  const [lookupRaw, setLookupRaw] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const has = (roles) => !roles || !user || roles.includes(user.role);
  const canCreate = config.create !== false && has(config.writeRoles);
  const canEdit = config.edit !== false && has(config.writeRoles);
  const canDelete = config.delete !== false && has(config.deleteRoles || config.writeRoles);

  // Buscar ou filtrar sempre volta para a primeira página: sem isso, filtrar
  // estando na página 40 cairia num intervalo que o novo resultado não tem,
  // e a lista apareceria vazia.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, JSON.stringify(filterValues)]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filterValues, page };
      if (search) params.search = search;
      if (config.sortable !== false && ordem) params.ordem = ordem;
      const { data } = await api.get(config.endpoint, { params });
      setRows(data.data || data);
      setPageInfo(data.pagination || null);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.endpoint, search, page, ordem, JSON.stringify(filterValues)]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    (async () => {
      const map = {};
      const raw = {};
      for (const lk of config.lookups || []) {
        try {
          const { data } = await api.get(lk.endpoint, { params: lk.params });
          const items = data.data || data;
          raw[lk.key] = items;
          map[lk.key] = items.map((it) => ({
            value: it[lk.valueKey || 'id'],
            label: lk.labelFn ? lk.labelFn(it) : it[lk.labelKey || 'name'],
          }));
        } catch {
          map[lk.key] = [];
          raw[lk.key] = [];
        }
      }
      setLookups(map);
      setLookupRaw(raw);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resolveField(f) {
    if (f.optionsFrom) {
      // 'tags' também usa optionsFrom (para sugerir os grupos existentes),
      // mas não é um select — preserva o tipo declarado.
      const tipo = f.type === 'tags' ? 'tags' : 'select';
      const resolved = { ...f, type: tipo, options: lookups[f.optionsFrom] || [] };
      // Ao escolher a região, mostra o coordenador responsável (vem no lookup).
      if (f.optionsFrom === 'regions' && form[f.name]) {
        const region = (lookupRaw.regions || []).find((r) => r.id === form[f.name]);
        const c = region?.coordinator;
        resolved.hint = c
          ? `Coordenador responsável: ${c.name}${c.phone ? ' · ' + c.phone : ''}`
          : 'Sem coordenador definido para esta região (defina em Configurações → Regiões).';
      }
      return resolved;
    }
    if (f.enumGroup) return { ...f, type: 'select', options: options(f.enumGroup) };
    return f;
  }

  function openCreate() {
    setForm({ ...(config.defaultValues || {}) });
    setErrors({});
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row) {
    const f = {};
    for (const field of config.fields || []) {
      let v = row[field.name];
      if (field.type === 'date') v = toInputDate(v);
      // Campo derivado de uma tag (ex.: "Quem indicou" ← INDICAÇÃO: X).
      if (field.fromTag) {
        const t = (row.tags || []).find((x) => x.startsWith(field.fromTag));
        f[field.name] = t ? t.slice(field.fromTag.length) : '';
        continue;
      }
      if (field.type === 'tags') {
        const arr = Array.isArray(row.tags) ? row.tags : [];
        f[field.name] = field.excludeTags ? arr.filter((t) => !field.excludeTags(t)) : arr;
        continue;
      }
      f[field.name] = v ?? '';
    }
    setForm(f);
    setEditing(row);
    setModalOpen(true);
  }

  async function submit() {
    // Bug 10: validação por campo antes de enviar.
    const fieldErrors = {};
    for (const f of config.fields || []) {
      const v = form[f.name];
      if (f.required && (v == null || String(v).trim() === '')) fieldErrors[f.name] = `${f.label} é obrigatório.`;
    }
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      const labels = (config.fields || []).filter((f) => fieldErrors[f.name]).map((f) => f.label);
      toast.error(`Preencha: ${labels.join(', ')}.`);
      // foca o primeiro campo inválido
      const first = (config.fields || []).find((f) => fieldErrors[f.name]);
      setTimeout(() => document.querySelector(`[data-field="${first?.name}"]`)?.focus(), 0);
      return;
    }
    setErrors({});

    const payload = {};
    for (const f of config.fields || []) {
      let v = form[f.name];
      if (f.type === 'tags') { payload[f.name] = Array.isArray(v) ? v : []; continue; }
      if (v === '') v = null;
      if (f.type === 'number' && v != null) v = Number(v);
      payload[f.name] = v;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`${config.endpoint}/${editing.id}`, payload);
        toast.success('Registro atualizado!');
      } else {
        const { data } = await api.post(config.endpoint, payload);
        config.onCreated?.(data, toast, payload);
        toast.success('Registro criado com sucesso!');
      }
      setModalOpen(false);
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Exporta a lista inteira (respeitando busca e filtros) para abrir no Excel.
   * Baixa todas as páginas: exportar só a página visível daria uma lista
   * incompleta sem a pessoa perceber.
   */
  async function exportar() {
    setExportando(true);
    try {
      const base = { ...filterValues, pageSize: 500 };
      if (search) base.search = search;
      if (config.sortable !== false && ordem) base.ordem = ordem;

      let pagina = 1;
      let todos = [];
      let totalPaginas = 1;
      do {
        const { data } = await api.get(config.endpoint, { params: { ...base, page: pagina } });
        todos = todos.concat(data.data || data);
        totalPaginas = data.pagination?.totalPages || 1;
        pagina++;
      } while (pagina <= totalPaginas && pagina <= 40); // teto de segurança

      const colunas = config.exportColumns || config.columns.map((c) => ({ key: c.key, label: c.label }));
      const valor = (linha, col) => {
        const v = col.value ? col.value(linha) : linha[col.key];
        if (v == null) return '';
        if (Array.isArray(v)) return v.join(' | ');
        // ; e quebra de linha quebram a coluna no Excel
        return String(v).replace(/[;\r\n]+/g, ' ').trim();
      };

      const linhas = [colunas.map((c) => c.label).join(';')];
      todos.forEach((r) => linhas.push(colunas.map((c) => valor(r, c)).join(';')));

      // BOM: sem ele o Excel do Windows mostra acento quebrado.
      const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${config.exportName || 'lista'}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${todos.length} registros exportados.`);
    } catch (e) {
      toast.error(apiError(e, 'Não foi possível exportar agora.'));
    } finally {
      setExportando(false);
    }
  }

  async function del(row) {
    const name = row[config.titleField || 'name'] || row.title || 'este registro';
    if (!window.confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`${config.endpoint}/${row.id}`);
      toast.success('Registro excluído.');
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const renderActions =
    canEdit || canDelete || config.rowActionsExtra
      ? (row) => (
          <>
            {config.rowActionsExtra?.(row, load, toast)}
            {canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)} title="Editar">
                <Pencil size={15} />
              </button>
            )}
            {canDelete && (
              <button className="btn btn-ghost btn-sm" onClick={() => del(row)} title="Excluir">
                <Trash2 size={15} />
              </button>
            )}
          </>
        )
      : null;

  return (
    <>
      <div className="toolbar">
        {config.searchable !== false && (
          <div className="search">
            <Search size={16} />
            <input
              className="input"
              placeholder={config.searchPlaceholder || 'Buscar...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        {(config.filters || []).map((f) => {
          // optionsFrom = lista dinâmica vinda de lookup (ex.: tags da base)
          const opts = f.optionsFrom
            ? lookups[f.optionsFrom] || []
            : f.enumGroup
              ? options(f.enumGroup)
              : f.options || [];
          return (
            <select
              key={f.name}
              className="select"
              style={{ width: 'auto' }}
              value={filterValues[f.name] || ''}
              onChange={(e) => setFilterValues((v) => ({ ...v, [f.name]: e.target.value }))}
            >
              <option value="">{f.label}</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        })}
        {config.sortable !== false && (
          <select
            className="select"
            style={{ width: 'auto' }}
            value={ordem}
            onChange={(e) => setOrdem(e.target.value)}
            title="Ordenar a lista"
          >
            <option value="az">Ordem alfabética (A–Z)</option>
            <option value="za">Ordem alfabética (Z–A)</option>
            <option value="recentes">Mais recentes primeiro</option>
            <option value="antigos">Mais antigos primeiro</option>
          </select>
        )}
        <div className="spacer" />
        {config.exportable && (
          <button className="btn" onClick={exportar} disabled={exportando} title="Baixar a lista para abrir no Excel">
            <Download size={16} /> {exportando ? 'Exportando...' : 'Exportar Excel'}
          </button>
        )}
        {canCreate && config.fields && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            {config.createLabel || 'Novo'}
          </button>
        )}
      </div>

      <Card noBody>
        {loading ? (
          <LoadingBox />
        ) : (
          <DataTable
            columns={config.columns}
            rows={rows}
            actions={renderActions}
            empty={
              <EmptyState
                title="Nenhum registro encontrado"
                message={config.emptyMessage}
                action={
                  canCreate && config.fields ? (
                    <button className="btn btn-primary" onClick={openCreate}>
                      <Plus size={16} /> {config.createLabel || 'Novo'}
                    </button>
                  ) : null
                }
              />
            }
          />
        )}
      </Card>

      <Pagination
        info={pageInfo}
        onChange={(p) => {
          setPage(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {modalOpen && (
        <Modal
          title={editing ? `Editar ${config.singular || ''}` : config.createLabel || 'Novo registro'}
          onClose={() => setModalOpen(false)}
          wide={config.wideForm}
          footer={
            <>
              <button className="btn" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={submit}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            {(config.fields || []).map((f) => (
              <Field
                key={f.name}
                field={resolveField(f)}
                value={form[f.name]}
                error={errors[f.name]}
                onChange={(name, val) => { setForm((s) => ({ ...s, [name]: val })); setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e)); }}
              />
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
