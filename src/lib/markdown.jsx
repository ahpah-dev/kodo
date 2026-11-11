import { Fragment } from 'react'

function inline(text, keyBase) {
  const out = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m
  let i = 0

  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const k = keyBase + '-i' + i++

    if (tok.startsWith('`')) {
      out.push(<code key={k} className="md-code">{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith('**')) {
      out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>)
    } else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)
      out.push(
        <a key={k} href={mm[2]} target="_blank" rel="noreferrer">
          {mm[1]}
        </a>,
      )
    } else {
      out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function CodeBlock({ lang, code }) {
  return (
    <div className="md-pre">
      <div className="md-pre-head">
        <span className="md-lang">{lang || 'text'}</span>
        <button
          type="button"
          className="md-copy"
          onClick={() => navigator.clipboard?.writeText(code)}
          title="Copy code"
        >
          copy
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export default function Markdown({ text }) {
  const lines = text.split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const buf = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++
      blocks.push(<CodeBlock key={'c' + blocks.length} lang={lang} code={buf.join('\n')} />)
      continue
    }

    if (/^\s*$/.test(line)) {
      i++
      continue
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const Tag = 'h' + (level + 1)
      blocks.push(
        <Tag key={'h' + blocks.length} className={'md-h md-h' + level}>
          {inline(h[2], 'h' + blocks.length)}
        </Tag>,
      )
      i++
      continue
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={'r' + blocks.length} />)
      i++
      continue
    }

    if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
      const head = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim())
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(
          lines[i]
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim()),
        )
        i++
      }
      blocks.push(
        <div className="md-table-wrap" key={'tb' + blocks.length}>
          <table className="md-table">
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c, 'th' + j)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => <td key={ci}>{inline(c, 'td' + ri + ci)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (line.trim().startsWith('>')) {
      const buf = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={'q' + blocks.length} className="md-quote">
          {inline(buf.join(' '), 'q' + blocks.length)}
        </blockquote>,
      )
      continue
    }

    const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    const ol = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line)
    if (ul || ol) {
      const ordered = !!ol
      const items = []
      while (i < lines.length) {
        const u = /^(\s*)[-*+]\s+(.*)$/.exec(lines[i])
        const o = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(lines[i])
        if (ordered && o) {
          items.push({ indent: o[1].length, text: o[3] })
          i++
        } else if (!ordered && u) {
          items.push({ indent: u[1].length, text: u[2] })
          i++
        } else if (/^\s*$/.test(lines[i]) && (ordered ? o : u)) {
          i++
        } else break
      }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={'l' + blocks.length} className="md-list">
          {items.map((it, j) => (
            <li key={j} style={{ marginLeft: it.indent > 1 ? 18 : 0 }}>
              {inline(it.text, 'li' + blocks.length + j)}
            </li>
          ))}
        </Tag>,
      )
      continue
    }

    const buf = []
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !lines[i].trim().startsWith('```') &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('>') &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push(
      <p key={'p' + blocks.length} className="md-p">
        {inline(buf.join(' '), 'p' + blocks.length)}
      </p>,
    )
  }

  return <div className="markdown">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}
