import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../src')
const maxLines = 300

async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await files(path))
    else if (/\.ts$/u.test(entry.name)) result.push(path)
  }
  return result
}

const violations = []
for (const path of await files(root)) {
  const source = await readFile(path, 'utf8')
  const lines = source.split(/\r?\n/u)
  if (lines.at(-1) === '') lines.pop()
  const lineCount = lines.length
  if (lineCount > maxLines) violations.push(`${path}: ${lineCount} lines (maximum ${maxLines})`)
}
if (violations.length > 0) {
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Checked TypeScript source files: maximum ${maxLines} lines per file.`)
}
