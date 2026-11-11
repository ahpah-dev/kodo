import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'

export default function CommandPalette({ onClose, actions }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    const score = (a) => {
      const label = a.label.toLowerCase()
      if (label.startsWith(q)) return 0
      if (label.includes(q)) return 1
      if ((a.hint || '').toLowerCase().includes(q)) return 2
      if ((a.group || '').toLowerCase().includes(q)) return 3
      return -1
    }
    return actions
      .map((a, i) => ({ a, i, s: score(a) }))
      .filter((x) => x.s >= 0)
      .sort((x, y) => x.s - y.s || x.i - y.i)
      .map((x) => x.a)
  }, [actions, query])

  const activeIndex = Math.min(cursor, Math.max(0, results.length - 1))

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-cursor="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % Math.max(results.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + results.length) % Math.max(results.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const a = results[activeIndex]
      if (a) {
        onClose()
        a.run()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const rendered = []
  let lastGroup = null
  results.forEach((a, i) => {
    if (a.group && a.group !== lastGroup) {
      rendered.push(
        <div key={'g-' + a.group + i} className="cmdk-group">
          {a.group}
        </div>,
      )
      lastGroup = a.group
    }
    rendered.push(
      <button
        key={a.id}
        type="button"
        data-cursor={i === activeIndex}
        className={'cmdk-item' + (i === activeIndex ? ' active' : '')}
        onMouseEnter={() => setCursor(i)}
        onClick={() => {
          onClose()
          a.run()
        }}
      >
        <Icon name={a.icon || 'command'} size={16} className="cmdk-icon" />
        <span className="cmdk-main">
          <span className="cmdk-label">{a.label}</span>
          {a.hint && <span className="cmdk-hint">{a.hint}</span>}
        </span>
        {a.keys && <kbd className="cmdk-keys">{a.keys}</kbd>}
      </button>,
    )
  })

  return (
    <div className="cmdk-scrim" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cmdk-input-row">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search..."
            aria-label="Command palette"
          />
          <kbd className="cmdk-esc">esc</kbd>
        </div>

        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && (
            <div className="cmdk-empty">
              <Icon name="search" size={20} />
              <p>Nothing matches &ldquo;{query}&rdquo;</p>
            </div>
          )}
          {rendered}
        </div>

        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span className="cmdk-foot-spacer" />
          <span className="cmdk-count">{results.length} results</span>
        </div>
      </div>
    </div>
  )
}
