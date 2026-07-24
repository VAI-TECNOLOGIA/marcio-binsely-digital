import { useState } from 'react';
import { X, Plus } from 'lucide-react';

/**
 * Campo de grupos (tags) do apoiador.
 * Sugere os grupos que já existem na base e deixa criar novos digitando —
 * a campanha precisa abrir frentes novas sem depender de quem programa.
 * Grava sempre em MAIÚSCULA para a taxonomia não se fragmentar.
 */
export default function TagsInput({ value = [], onChange, sugestoes = [] }) {
  const [texto, setTexto] = useState('');
  const atuais = Array.isArray(value) ? value : [];

  function adicionar(bruto) {
    const t = String(bruto || '').trim().toUpperCase();
    if (!t || atuais.includes(t)) { setTexto(''); return; }
    onChange([...atuais, t]);
    setTexto('');
  }

  const disponiveis = sugestoes
    .filter((s) => !atuais.includes(s.toUpperCase()))
    .filter((s) => !texto || s.toUpperCase().includes(texto.toUpperCase()))
    .slice(0, 6);

  return (
    <div className="tags-input">
      {atuais.length > 0 && (
        <div className="tags-atuais">
          {atuais.map((t) => (
            <span key={t} className="tag-chip">
              {t}
              <button type="button" onClick={() => onChange(atuais.filter((x) => x !== t))} aria-label={`Remover ${t}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="tags-add">
        <input
          className="input"
          value={texto}
          placeholder="Digite um grupo e tecle Enter"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); adicionar(texto); }
          }}
        />
        <button type="button" className="btn btn-sm" onClick={() => adicionar(texto)} disabled={!texto.trim()}>
          <Plus size={14} /> Incluir
        </button>
      </div>

      {disponiveis.length > 0 && (
        <div className="tags-sugestoes">
          <span>Grupos existentes:</span>
          {disponiveis.map((s) => (
            <button key={s} type="button" className="tag-sug" onClick={() => adicionar(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
