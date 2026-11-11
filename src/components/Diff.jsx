function Line({ line }) {
  const cls = line.t === 'add' ? 'd-add' : line.t === 'del' ? 'd-del' : 'd-ctx'
  const sign = line.t === 'add' ? '+' : line.t === 'del' ? '−' : ' '
  return (
    <div className={'d-line ' + cls}>
      <span className="d-num">{line.n}</span>
      <span className="d-sign">{sign}</span>
      <span className="d-text">{line.text || ' '}</span>
    </div>
  )
}

export default function Diff({ lines }) {
  let adds = 0
  let dels = 0
  for (const l of lines) {
    if (l.t === 'add') adds++
    if (l.t === 'del') dels++
  }
  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-add">+{adds}</span>
        <span className="diff-del">−{dels}</span>
      </div>
      <div className="diff-body">
        {lines.map((l, i) => (
          <Line key={i} line={l} />
        ))}
      </div>
    </div>
  )
}
