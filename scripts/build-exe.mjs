import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const outDir = path.join(root, 'release')
const outFile = path.join(outDir, 'kodo.exe')

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })

const files = walk(dist)
if (files.length === 0) {
  console.error('dist/ is empty — run `npm run build` first.')
  process.exit(1)
}

const assets = {}
for (const file of files) {
  const key = path.relative(dist, file).split(path.sep).join('/')
  assets[key] = file
}

mkdirSync(outDir, { recursive: true })

const configPath = path.join(root, 'sea-config.json')
writeFileSync(
  configPath,
  JSON.stringify(
    {
      main: path.join(root, 'server', 'main.cjs'),
      output: outFile,
      disableExperimentalSEAWarning: true,
      useCodeCache: true,
      assets,
    },
    null,
    2,
  ),
)

console.log(`Embedding ${files.length} assets into ${path.relative(root, outFile)} ...`)

const result = spawnSync(process.execPath, [`--build-sea=${configPath}`], {
  stdio: 'inherit',
  cwd: root,
})

rmSync(configPath, { force: true })

if (result.status !== 0) {
  console.error('SEA build failed.')
  process.exit(result.status ?? 1)
}

const mb = (statSync(outFile).size / 1024 / 1024).toFixed(1)
console.log(`\n  release/kodo.exe  (${mb} MB)\n  Run it — it serves the app on http://127.0.0.1:4173 and opens your browser.`)
