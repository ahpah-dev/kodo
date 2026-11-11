export const suggestions = [
  { label: 'Explain this codebase', hint: 'map the architecture in 60 seconds', icon: 'compass' },
  { label: 'Find and fix a bug', hint: 'run, trace, patch, verify', icon: 'wand' },
  { label: 'Add a feature', hint: 'plan, edit, build', icon: 'sparkles' },
  { label: 'Review my uncommitted changes', hint: 'diff-aware code review', icon: 'diff' },
]

export function formatCtx(n) {
  if (!n) return ''
  return n >= 1_000_000 ? +(n / 1_000_000).toFixed(1) + 'M' : Math.round(n / 1000) + 'k'
}

export function formatTokens(n) {
  if (!n) return '0'
  return n >= 10_000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}
