import { useMemo, useState } from 'react';

const labels = {
  en: {
    title: 'A map of your workspace',
    description:
      'Only the project notes, task list, weekly review, and their known links are shown.',
    search: 'Find a note or project',
    placeholder: 'Search this map…',
    all: 'All notes',
    project: 'Project',
    note: 'Note',
    empty: 'No matching notes.',
    emptyHelp: 'Try another search. Notes appear when they exist in this workspace.',
    selected: 'Selected note',
    connections: 'Connections',
    noConnections: 'No known links yet.',
    open: 'Open project',
    nodes: 'notes',
    edges: 'links',
    list: 'Notes in this map',
    clear: 'Clear search',
    visual: 'Visual map; use the note buttons or searchable list to explore.',
    noSelection: 'Choose a note to see its connections.',
    visualLimit: 'The map shows up to 30 matching notes. The list below includes every match.',
    area: 'Area',
  },
  ru: {
    title: 'Карта вашего пространства',
    description:
      'Здесь только заметки проектов, список задач, обзор недели и известные связи между ними.',
    search: 'Найти заметку или проект',
    placeholder: 'Поиск на карте…',
    all: 'Все заметки',
    project: 'Проект',
    note: 'Заметка',
    empty: 'Ничего не найдено.',
    emptyHelp: 'Попробуйте другой запрос. Карта показывает существующие заметки пространства.',
    selected: 'Выбранная заметка',
    connections: 'Связи',
    noConnections: 'Известных связей пока нет.',
    open: 'Открыть проект',
    nodes: 'заметок',
    edges: 'связей',
    list: 'Заметки на карте',
    clear: 'Очистить поиск',
    visual: 'Карта связей; используйте кнопки заметок или список для навигации.',
    noSelection: 'Выберите заметку, чтобы увидеть её связи.',
    visualLimit: 'Карта показывает до 30 найденных заметок. В списке ниже доступны все совпадения.',
    area: 'Область',
  },
};

export default function WorkspaceGraph({ graph, areas = [], locale = 'en', onOpenProject }) {
  const text = labels[locale] || labels.en;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [kind, setKind] = useState('all');
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const visible = useMemo(
    () =>
      nodes.filter(
        (node) =>
          (kind === 'all' || node.type === kind) &&
          node.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())
      ),
    [nodes, query, kind]
  );
  const selected = nodes.find((node) => node.id === selectedId);
  const connectedIds = new Set(
    edges.flatMap((edge) =>
      edge.source === selectedId ? [edge.target] : edge.target === selectedId ? [edge.source] : []
    )
  );
  const connected = nodes.filter((node) => connectedIds.has(node.id));
  const visualNodes = visible.slice(0, 30);
  const positions = new Map(
    visualNodes.map((node, index) => {
      const angle = (index / Math.max(visualNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const ring = visualNodes.length <= 8 ? 1 : index % 2 === 0 ? 1 : 0.58;
      return [
        node.id,
        {
          x: visualNodes.length === 1 ? 50 : 50 + Math.cos(angle) * 33 * ring,
          y: visualNodes.length === 1 ? 50 : 50 + Math.sin(angle) * 34 * ring,
        },
      ];
    })
  );
  return (
    <section className="card graph-panel" aria-labelledby="graph-title">
      <div className="section-heading">
        <h2 id="graph-title">{text.title}</h2>
        <span className="count-pill">
          {nodes.length} {text.nodes} · {edges.length} {text.edges}
        </span>
      </div>
      <p className="graph-description">{text.description}</p>
      <div className="graph-tools">
        <label className="field">
          <span>{text.search}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text.placeholder}
          />
        </label>
        <label className="field">
          <span>{text.all}</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">{text.all}</option>
            <option value="project">{text.project}</option>
            <option value="note">{text.note}</option>
          </select>
        </label>
      </div>
      {visible.length ? (
        <>
          <section className="graph-canvas" aria-label={text.visual}>
            <svg
              className="graph-edges"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {edges
                .filter((edge) => positions.has(edge.source) && positions.has(edge.target))
                .map((edge) => {
                  const source = positions.get(edge.source);
                  const target = positions.get(edge.target);
                  return (
                    <line
                      key={`${edge.source}-${edge.target}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      className={
                        edge.source === selectedId || edge.target === selectedId
                          ? 'selected-edge'
                          : ''
                      }
                    />
                  );
                })}
            </svg>
            {visualNodes.map((node) => {
              const position = positions.get(node.id);
              return (
                <button
                  type="button"
                  key={node.id}
                  className={`graph-node ${node.type} ${selectedId === node.id ? 'selected' : ''} ${connectedIds.has(node.id) ? 'connected' : ''}`}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  aria-pressed={selectedId === node.id}
                  onClick={() => setSelectedId(node.id)}
                >
                  <span className="graph-node-dot" aria-hidden="true">
                    {node.type === 'project' ? '◇' : '·'}
                  </span>
                  <span>{node.label}</span>
                </button>
              );
            })}
          </section>
          {visible.length > 30 && <p className="field-help">{text.visualLimit}</p>}
          <div className="graph-explorer">
            <section className="graph-list" aria-label={text.list}>
              {visible.map((node) => (
                <button
                  type="button"
                  key={node.id}
                  className={selectedId === node.id ? 'selected' : ''}
                  aria-pressed={selectedId === node.id}
                  onClick={() => setSelectedId(node.id)}
                >
                  <span aria-hidden="true">{node.type === 'project' ? '◇' : '○'}</span>
                  <span>{node.label}</span>
                  <small>{text[node.type]}</small>
                </button>
              ))}
            </section>
            <section className="graph-detail" aria-live="polite">
              {selected ? (
                <>
                  <span className="eyebrow">{text.selected}</span>
                  <h3>{selected.label}</h3>
                  {selected.area && (
                    <p>
                      {text.area}:{' '}
                      {areas.find((area) => area.id === selected.area)?.title || selected.area}
                    </p>
                  )}
                  <h4>{text.connections}</h4>
                  {connected.length ? (
                    <ul>
                      {connected.map((node) => (
                        <li key={node.id}>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setSelectedId(node.id)}
                          >
                            {node.label} <span aria-hidden="true">↗</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{text.noConnections}</p>
                  )}
                  {selected.type === 'project' && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        onOpenProject(selected.projectId || selected.id.replace(/^project:/, ''))
                      }
                    >
                      {text.open} <span aria-hidden="true">→</span>
                    </button>
                  )}
                </>
              ) : (
                <p>{text.noSelection}</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h3>{text.empty}</h3>
          <p>{text.emptyHelp}</p>
          {query && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery('');
                setKind('all');
              }}
            >
              {text.clear}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
