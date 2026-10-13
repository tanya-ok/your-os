import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';

export async function parseNote(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  return parseNoteContent(raw, filePath);
}

export function parseNoteContent(raw, filePath = '') {
  const result = { frontmatter: {}, body: '', lines: raw.split('\n'), path: filePath };
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (match) {
    try { result.frontmatter = yaml.load(match[1]) || {}; } catch { result.frontmatter = {}; }
    result.body = match[2];
  } else {
    result.body = raw;
  }
  return result;
}

export function extractSections(lines) {
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^## /, ''), startLine: i, lines: [], subSections: {} };
    } else if (current) {
      current.lines.push({ text: line, lineNum: i });
      const boldMatch = line.match(/^\*\*(.+?):\*\*\s*$/);
      if (boldMatch) {
        current._currentSub = boldMatch[1];
        current.subSections[current._currentSub] = [];
      } else if (current._currentSub) {
        current.subSections[current._currentSub].push({ text: line, lineNum: i });
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function extractChecklists(lines, startLine = 0, endLine = Infinity) {
  const items = [];
  let currentHeading = '';
  let currentSub = '';
  for (let i = startLine; i < Math.min(lines.length, endLine); i++) {
    const line = lines[i];
    if (line.startsWith('## ')) currentHeading = line.replace(/^## /, '').trim();
    const boldMatch = line.match(/^\*\*(.+?):\*\*/);
    if (boldMatch) currentSub = boldMatch[1];
    const checkMatch = line.match(/^(\s*)-\s\[([ xX])\]\s(.+)$/);
    if (checkMatch) {
      const text = checkMatch[3].trim();
      const prefixMatch = text.match(/^\(([PWH])\)\s*/);
      items.push({
        lineNum: i,
        checked: checkMatch[2] !== ' ',
        rawText: text,
        text: prefixMatch ? text.replace(prefixMatch[0], '') : text,
        prefix: prefixMatch ? prefixMatch[1] : null,
        section: currentHeading,
        subSection: currentSub,
        indent: checkMatch[1].length,
      });
    }
  }
  return items;
}

export function parseTableRows(content) {
  const lines = content.split('\n');
  const headerIdx = lines.findIndex(l => l.startsWith('| Date') || l.startsWith('|Date'));
  if (headerIdx < 0) return [];
  const headers = lines[headerIdx].split('|').map(h => h.trim()).filter(Boolean);
  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) continue;
    const cells = lines[i].split('|').map(c => c.trim()).filter((_, ci) => ci > 0);
    if (cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 2) continue;
    const row = {};
    headers.forEach((h, hi) => { row[h.toLowerCase()] = cells[hi] || ''; });
    rows.push(row);
  }
  return rows;
}

export function parseMarkdownTable(lines, startLine = 0) {
  const rows = [];
  let headers = null;
  let started = false;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) { if (started) break; continue; }
    started = true;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (!headers) { headers = cells; continue; }
    if (cells.every(c => /^[-:]+$/.test(c))) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = cells[j] || ''; });
    row._lineNum = i;
    rows.push(row);
  }
  return { headers, rows };
}
