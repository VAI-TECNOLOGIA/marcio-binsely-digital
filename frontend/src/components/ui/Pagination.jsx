import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Navegação de páginas das listagens.
 * A API sempre devolveu `pagination`, mas nenhuma tela usava — com 33 mil
 * apoiadores, só os 20 primeiros eram alcançáveis.
 *
 * `info` é o objeto `pagination` da resposta: { page, pageSize, total, totalPages }.
 */
export default function Pagination({ info, onChange }) {
  if (!info || info.totalPages <= 1) return null;

  const { page, pageSize, total, totalPages } = info;
  const de = (page - 1) * pageSize + 1;
  const ate = Math.min(page * pageSize, total);

  // Janela de páginas em torno da atual, sempre com a primeira e a última.
  const paginas = [];
  const push = (p) => { if (!paginas.includes(p) && p >= 1 && p <= totalPages) paginas.push(p); };
  push(1);
  for (let p = page - 2; p <= page + 2; p++) push(p);
  push(totalPages);
  paginas.sort((a, b) => a - b);

  const itens = [];
  paginas.forEach((p, i) => {
    if (i > 0 && p - paginas[i - 1] > 1) itens.push({ gap: true, key: `g${p}` });
    itens.push({ p, key: p });
  });

  return (
    <nav className="pager" aria-label="Navegação de páginas">
      <span className="pager-info">
        <strong>{de.toLocaleString('pt-BR')}–{ate.toLocaleString('pt-BR')}</strong> de{' '}
        {total.toLocaleString('pt-BR')}
      </span>

      <div className="pager-ctrl">
        <button
          className="pager-btn"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>

        {itens.map((it) =>
          it.gap ? (
            <span key={it.key} className="pager-gap">…</span>
          ) : (
            <button
              key={it.key}
              className={`pager-btn ${it.p === page ? 'on' : ''}`}
              onClick={() => onChange(it.p)}
              aria-current={it.p === page ? 'page' : undefined}
            >
              {it.p}
            </button>
          )
        )}

        <button
          className="pager-btn"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
