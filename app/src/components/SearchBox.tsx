import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { Search, X } from 'lucide-preact';
import { dataset, flyTo } from '../state';
import { buildIndex, type SearchHit } from '../data/search';
import { navigate } from '../router';
import { areaName, fmtNumber, t } from '../i18n';

export function SearchBox() {
  const ds = dataset.value;
  const index = useMemo(() => (ds ? buildIndex(ds) : null), [ds]);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(h);
  }, [q]);
  const hits = useMemo(() => (index && debounced.trim() ? index.search(debounced) : []), [index, debounced]);
  useEffect(() => setActive(0), [hits]);

  const choose = (h: SearchHit) => {
    setOpen(false);
    setQ('');
    input.current?.blur();
    if (h.kind === 'school') {
      navigate({ name: 'school', id: h.school.id });
      flyTo({ center: [h.school.lon, h.school.lat], zoom: 14 });
    } else {
      navigate({ name: h.kind, id: h.area.id });
      flyTo({ bbox: h.area.bbox });
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); choose(hits[active]); }
    else if (e.key === 'Escape') { setQ(''); setOpen(false); }
  };

  const showList = open && debounced.trim().length > 0;
  return (
    <div class="search">
      <div class="search-box">
        <Search size={18} aria-hidden="true" class="muted" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={t('search.placeholder')}
          aria-expanded={showList}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? `sr-${active}` : undefined}
          placeholder={t('search.placeholder')}
          value={q}
          disabled={!ds}
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
        />
        {q && <button class="icon-btn" aria-label={t('search.clear')} onClick={() => { setQ(''); input.current?.focus(); }}><X size={18} /></button>}
      </div>
      <p class="sr-only" aria-live="polite">{showList ? t('search.count', { n: fmtNumber(hits.length) }) : ''}</p>
      {showList && (
        <ul id="search-results" class="results" role="listbox">
          {hits.length === 0 && <li class="empty" role="option" aria-disabled="true">{t('search.noResults', { q: debounced })}</li>}
          {hits.map((h, i) => (
            <li id={`sr-${i}`} key={i} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(h); }}>
              {h.kind === 'school' ? (
                <>
                  <span class="r-name">{h.school.name}</span>
                  <span class="r-meta">{t('kind.school')} · {[h.school.district, h.school.province].filter(Boolean).map((a) => areaName(a!)).join(', ')}</span>
                </>
              ) : (
                <>
                  <span class="r-name">{areaName(h.area)}</span>
                  <span class="r-meta">{t(h.kind === 'district' ? 'kind.district' : 'kind.province')}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
