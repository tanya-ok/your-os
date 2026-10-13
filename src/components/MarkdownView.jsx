// biome-ignore-all lint/suspicious/noArrayIndexKey: Read-only stateless Markdown fragments use source positions, not editable row identities.
function inline(text, onProject) {
  const tokens = text.split(
    /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g
  );
  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**'))
      return <strong key={`part-${index}`}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('*') && token.endsWith('*'))
      return <em key={`part-${index}`}>{token.slice(1, -1)}</em>;
    if (token.startsWith('`') && token.endsWith('`'))
      return <code key={`part-${index}`}>{token.slice(1, -1)}</code>;
    const wiki = token.match(/^\[\[([^|]+)(?:\|([^\]]+))?\]\]$/);
    if (wiki) {
      const id = wiki[1].match(/^Projects\/([a-zA-Z0-9_-]+)$/)?.[1];
      return id && onProject ? (
        <button
          type="button"
          key={`part-${index}`}
          className="markdown-note-link"
          onClick={() => onProject(id)}
        >
          {wiki[2] || id}
        </button>
      ) : (
        <span key={`part-${index}`}>{wiki[2] || wiki[1]}</span>
      );
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      try {
        const url = new URL(link[2]);
        if (url.protocol === 'https:' && !url.username && !url.password)
          return (
            <a key={`part-${index}`} href={url.href} target="_blank" rel="noreferrer">
              {link[1]}
            </a>
          );
      } catch {
        /* Invalid links stay readable text. */
      }
      return <span key={`part-${index}`}>{link[1]}</span>;
    }
    return token;
  });
}
export default function MarkdownView({ text = '', title = '', onProject }) {
  const lines = String(text).replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length + 1, 6)}`;
      if (!(heading[1] === '#' && heading[2] === title))
        blocks.push(<Tag key={i}>{inline(heading[2], onProject)}</Tag>);
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const start = i++;
      const code = [];
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={start}>
          <code>{code.join('\n')}</code>
        </pre>
      );
      continue;
    }
    if (/^\s*([-*+] |\d+\. )/.test(line)) {
      const start = i,
        ordered = /^\s*\d+\. /.test(line),
        values = [];
      const pattern = ordered ? /^\s*\d+\. (.*)$/ : /^\s*[-*+] (.*)$/;
      while (i < lines.length && pattern.test(lines[i]))
        values.push(lines[i++].replace(pattern, '$1'));
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={start}>
          {values.map((value, index) => (
            <li key={`part-${index}`}>
              {/^\[[ xX]\] /.test(value) && (
                <input
                  type="checkbox"
                  disabled
                  checked={/^\[[xX]\]/.test(value)}
                  aria-label={/^\[[xX]\]/.test(value) ? 'Completed task' : 'Open task'}
                />
              )}
              {inline(value.replace(/^\[[ xX]\] /, ''), onProject)}
            </li>
          ))}
        </Tag>
      );
      continue;
    }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const start = i;
      const cells = (value) =>
        value
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((value) => value.trim());
      const headers = cells(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) rows.push(cells(lines[i++]));
      blocks.push(
        <div className="markdown-table-wrap" key={start}>
          <table>
            <thead>
              <tr>
                {headers.map((value, index) => (
                  <th key={`part-${index}`}>{inline(value, onProject)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`part-${index}`}>
                  {row.map((value, cell) => (
                    <td key={`cell-${cell}`}>{inline(value, onProject)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const start = i++;
    const paragraph = [line];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6} |```|[-*+] |\d+\. )/.test(lines[i]))
      paragraph.push(lines[i++]);
    blocks.push(<p key={start}>{inline(paragraph.join(' '), onProject)}</p>);
  }
  return <div className="markdown-reading">{blocks}</div>;
}
