import type { Filters, Sticker } from "../types";
import { getUniqueValues } from "../lib/album";

type FilterBarProps = {
  catalog: Sticker[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  showStatus?: boolean;
};

export function FilterBar({ catalog, filters, onChange, showStatus = true }: FilterBarProps) {
  const countries = getUniqueValues(catalog, "country");
  const groups = getUniqueValues(catalog, "group");
  const sections = getUniqueValues(catalog, "section");
  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <section className="filter-panel" aria-label="Búsqueda y filtros">
      <label className="search-field">
        <span>Buscar</span>
        <input
          type="search"
          placeholder="Código, país o nombre"
          value={filters.query}
          onChange={(event) => update({ query: event.target.value })}
        />
      </label>

      <div className="filter-grid">
        <label>
          <span>País</span>
          <select value={filters.country} onChange={(event) => update({ country: event.target.value })}>
            <option value="">Todos</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Grupo</span>
          <select value={filters.group} onChange={(event) => update({ group: event.target.value })}>
            <option value="">Todos</option>
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Sección</span>
          <select value={filters.section} onChange={(event) => update({ section: event.target.value })}>
            <option value="">Todas</option>
            {sections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </label>

        {showStatus ? (
          <label>
            <span>Estado</span>
            <select value={filters.status} onChange={(event) => update({ status: event.target.value as Filters["status"] })}>
              <option value="all">Todos</option>
              <option value="missing">Faltante</option>
              <option value="owned">La tengo</option>
              <option value="repeated">Repetida</option>
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );
}
