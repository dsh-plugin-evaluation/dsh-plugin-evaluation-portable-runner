import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

export function workspacePath(root: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0')) throw new Error('portable case workspace path is invalid')
  if (relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.split('/').includes('..')) throw new Error('portable case workspace path must be relative')
  const path = resolve(root, relativePath)
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`
  if (path !== root && !path.startsWith(boundary)) throw new Error('portable case workspace path escapes workspace')
  return path
}

async function assertNoSymlink(root: string, target: string): Promise<void> {
  let current = resolve(target)
  const rootPath = resolve(root)
  while (current.startsWith(`${rootPath}${sep}`)) {
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error('portable case workspace cannot follow symbolic links')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    if (current === rootPath) break
    current = dirname(current)
  }
}

export async function filesUnder(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = resolve(current, entry.name)
    if (entry.isSymbolicLink()) throw new Error('portable case workspace contains a symbolic link')
    if (entry.isDirectory()) files.push(...await filesUnder(root, path))
    else files.push(relative(root, path).split(sep).join('/'))
  }
  return files.sort()
}

export function createWorkspace(root: string) {
  return {
    write: async (path: string, content: string) => {
      const target = workspacePath(root, path)
      await assertNoSymlink(root, target)
      await mkdir(dirname(target), { recursive: true })
      await assertNoSymlink(root, target)
      await writeFile(target, content, 'utf8')
    },
    read: async (path: string) => {
      const target = workspacePath(root, path)
      await assertNoSymlink(root, target)
      return readFile(target, 'utf8')
    },
  }
}
