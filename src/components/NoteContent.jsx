/* biome-ignore-all lint/suspicious/noArrayIndexKey: Parsed document fragments are stateless; source positions disambiguate repeated text and table columns. */
import { Fragment } from 'react';

function safeURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function inline(text) {
  const tokens = text.split(
    /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g
  );
  return tokens.map((token, index) => {
    if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    )
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('`') && token.endsWith('`'))
      return <code key={index}>{token.slice(1, -1)}</code>;
    const wiki = token.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    if (wiki)
      return (
        <span className="note-content-reference" key={index}>
          {wiki[2] || wiki[1]}
        </span>
      );
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeURL(link[2]);
      return href ? (
        <a href={href} key={index} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      ) : (
        <Fragment key={index}>{link[1]}</Fragment>
      );
    }
    if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    )
      return <em key={index}>{token.slice(1, -1)}</em>;
    return <Fragment key={index}>{token}</Fragment>;
  });
}
function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}
function separator(line) {
  const values = cells(line);
  return values.length > 0 && values.every((value) => /^:?-{3,}:?$/.test(value));
}
const listItem = (line) => line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
const normalizedTitle = (text) => text.replace(/[*_`]/g, '').trim().toLocaleLowerCase();

/** A deliberately small Markdown reader. React escapes all text; HTML is never interpreted. */
export default function NoteContent({ text, body, title = '' }) {
  const lines = String(text ?? body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  let cursor = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (end > 0) cursor = end + 1;
  }
  const blocks = [];
  let firstContent = true;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) {
      cursor++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (heading) {
      if (
        !(
          firstContent &&
          heading[1].length === 1 &&
          normalizedTitle(heading[2]) === normalizedTitle(title)
        )
      ) {
        const Heading = `h${Math.min(6, heading[1].length + 2)}`;
        blocks.push(<Heading key={`h-${cursor}`}>{inline(heading[2])}</Heading>);
      }
      firstContent = false;
      cursor++;
      continue;
    }
    firstContent = false;
    if (line.trim().startsWith('```')) {
      const start = cursor;
      cursor++;
      const code = [];
      while (cursor < lines.length && !lines[cursor].trim().startsWith('```'))
        code.push(lines[cursor++]);
      if (cursor < lines.length) cursor++;
      blocks.push(
        <pre key={`code-${start}`}>
          <code>{code.join('\n')}</code>
        </pre>
      );
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${cursor++}`} />);
      continue;
    }
    if (line.includes('|') && cursor + 1 < lines.length && separator(lines[cursor + 1])) {
      const start = cursor;
      const headers = cells(line);
      cursor += 2;
      const rows = [];
      while (cursor < lines.length && lines[cursor].trim() && lines[cursor].includes('|'))
        rows.push(cells(lines[cursor++]));
      blocks.push(
        <div className="note-content-table-scroll" key={`table-${start}`}>
          <table>
            <thead>
              <tr>
                {headers.map((header, index) => (
                  <th key={index} scope="col">
                    {inline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {headers.map((_, column) => (
                    <td key={column}>{inline(row[column] || '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const item = listItem(line);
    if (item) {
      const start = cursor;
      const ordered = !item[1];
      const rows = [];
      while (cursor < lines.length) {
        const next = listItem(lines[cursor]);
        if (!next || !next[1] !== ordered) break;
        rows.push(next[2]);
        cursor++;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={`list-${start}`}>
          {rows.map((row, index) => {
            const check = row.match(/^\[([ xX])\]\s+(.*)$/);
            return (
              <li key={index}>
                {check ? (
                  <>
                    <span
                      className="note-content-check"
                      role="img"
                      aria-label={check[1].trim() ? 'Completed' : 'Open'}
                    >
                      {check[1].trim() ? '☑' : '☐'}
                    </span>
                    {inline(check[2])}
                  </>
                ) : (
                  inline(row)
                )}
              </li>
            );
          })}
        </List>
      );
      continue;
    }
    const start = cursor;
    const paragraph = [];
    while (cursor < lines.length && lines[cursor].trim()) {
      if (
        cursor !== start &&
        (/^#{1,6}\s/.test(lines[cursor]) ||
          listItem(lines[cursor]) ||
          lines[cursor].trim().startsWith('```') ||
          (cursor + 1 < lines.length &&
            lines[cursor].includes('|') &&
            separator(lines[cursor + 1])))
      )
        break;
      paragraph.push(lines[cursor++].replace(/^>\s?/, ''));
    }
    blocks.push(<p key={`p-${start}`}>{inline(paragraph.join(' '))}</p>);
  }
  return <div className="note-content">{blocks}</div>;
}
