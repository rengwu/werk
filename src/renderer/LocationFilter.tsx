import { useRef, useState } from 'react';
import { searchLocation, type LocationOption } from '../backend/geo/locations.ts';

export function LocationFilter({options, value, onChange, loading, error, retry}: {
  options: LocationOption[]; value: string[]; onChange: (value: string[]) => void;
  loading: boolean; error: Error | null; retry: () => void;
}) {
  const [search, setSearch] = useState('');
  const details = useRef<HTMLDetailsElement>(null), input = useRef<HTMLInputElement>(null);
  const missing: LocationOption[] = value.filter(v => !options.some(o => o.value === v)).map(v => ({
    value: v, label: /^country:[A-Z]{2}$/.test(v) ? new Intl.DisplayNames(['en'], {type:'region'}).of(v.slice(8)) || v : v,
    group: 'Selected locations',
  }));
  const groups = new Map<string, LocationOption[]>();
  for (const option of [...options, ...missing]) {
    if (search.trim() ? !searchLocation(option, search) : option.kind === 'place' && !value.includes(option.value)) continue;
    const group = option.group || 'Locations';
    groups.set(group, [...groups.get(group) || [], option]);
  }
  return <details ref={details} className="location-picker" onToggle={() => {
    if (details.current?.open) input.current?.focus(); else setSearch('');
  }} onKeyDown={event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    details.current!.open = false;
    details.current!.querySelector('summary')!.focus();
  }}>
    <summary aria-label="Locations">{value.length ? `Locations (${value.length})` : 'Any location'}</summary>
    <div className="location-choices">
      <input ref={input} type="search" aria-label="Search locations" placeholder="Search city, country or region" value={search} onChange={e => setSearch(e.target.value)}/>
      {error ? <p role="alert">Locations could not load. <button onClick={retry}>Retry</button></p> : loading ? <p role="status">Loading locations…</p> : <div className="location-options">
        {[...groups].map(([group, options]) => <fieldset key={group}><legend>{group}</legend>{options.map(option => <label className="check" key={option.value}>
          <input type="checkbox" checked={value.includes(option.value)} disabled={value.length >= 50 && !value.includes(option.value)} onChange={e => onChange(e.target.checked ? [...value, option.value] : value.filter(v => v !== option.value))}/>
          {option.label}
        </label>)}</fieldset>)}
        {!groups.size && <p>No locations found.</p>}
      </div>}
      {value.length > 0 && <button onClick={() => onChange([])}>Clear locations</button>}
    </div>
  </details>;
}
