declare module 'node:fs/promises' {
  export const mkdtemp: any
  export const rm: any
  export const lstat: any
  export const mkdir: any
  export const readFile: any
  export const readdir: any
  export const writeFile: any
  export const access: any
}

declare module 'node:child_process' { export const spawn: any }
declare module 'node:process' { const value: any; export default value }

declare module 'node:os' { export const tmpdir: any }
declare module 'node:crypto' { export const randomUUID: any }

declare module 'node:path' {
  export const dirname: any
  export const relative: any
  export const resolve: any
  export const join: any
  export const sep: any
}

declare const Buffer: {
  byteLength(value: string, encoding?: string): number
  from(value: string, encoding?: string): { subarray(start: number, end?: number): { toString(encoding?: string): string } }
}
