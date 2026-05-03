import type { Filters, Sticker } from "../types";
import {
  getRealGroups,
  getTeamCollections,
  getTeamGroup,
  SPECIAL_COLLECTION_NAME,
  SPONSOR_COLLECTION_NAME,
  TEAM_COLLECTION_NAME,
} from "../lib/album";

type FilterBarProps = {
  catalog: Sticker[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  showStatus?: boolean;
};

export function FilterBar({ catalog, filters, onChange, showStatus = true }: FilterBarProps) {
  const isSpecialCollection = filters.section === SPECIAL_COLLECTION_NAME || filters.section === SPONSOR_COLLECTION_NAME;
  const groups = getRealGroups(catalog);
  const countries = getTeamCollections(catalog, filters.group);
  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const resetFilters = () => onChange({ query: "", country: "", group: "", section: "", status: "all" });

  const updateSection = (section: string) => {
    if (section === SPECIAL_COLLECTION_NAME || section === SPONSOR_COLLECTION_NAME) {
      onChange({ ...filters, section, country: "", group: "" });
      return;
    }

    onChange({ ...filters, section });
  };

  const updateGroup = (group: string) => {
    const availableTeams = getTeamCollections(catalog, group);
    const nextCountry = filters.country && !availableTeams.includes(filters.country) ? "" : filters.country;
    onChange({ ...filters, section: "Team", group, country: nextCountry });
  };

  const updateCountry = (country: string) => {
    const group = country ? getTeamGroup(catalog, country) : filters.group;
    onChange({ ...filters, section: country ? "Team" : filters.section, country, group });
  };

  return (
    <section className="filter-panel" aria-label="Búsqueda y filtros">
      <label className="search-field">
        <span>Buscar</span>
        <input
          type="search"
          placeholder="Código, colección o nombre"
          value={filters.query}
          onChange={(event) => update({ query: event.target.value })}
        />
      </label>

      <div className="filter-grid">
        <label>
          <span>Colección</span>
          <select value={filters.section} onChange={(event) => updateSection(event.target.value)}>
            <option value="">Todas</option>
            <option value="Team">{TEAM_COLLECTION_NAME}</option>
            <option value={SPECIAL_COLLECTION_NAME}>{SPECIAL_COLLECTION_NAME}</option>
            <option value={SPONSOR_COLLECTION_NAME}>{SPONSOR_COLLECTION_NAME}</option>
          </select>
        </label>

        <label>
          <span>Grupo</span>
          <select value={filters.group} onChange={(event) => updateGroup(event.target.value)} disabled={isSpecialCollection}>
            <option value="">Todos</option>
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Equipo</span>
          <select value={filters.country} onChange={(event) => updateCountry(event.target.value)} disabled={isSpecialCollection}>
            <option value="">Todos</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
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
      <button className="ghost-button filter-reset" type="button" onClick={resetFilters}>
        Limpiar filtros
      </button>
    </section>
  );
}
