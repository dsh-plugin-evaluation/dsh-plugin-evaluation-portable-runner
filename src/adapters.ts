export type Handler = (argumentsValue: Record<string, unknown>) => unknown | Promise<unknown>
export type NetworkHandler = (request: { url: string; options: Record<string, unknown> }) => unknown | Promise<unknown>
export type Call = { name: string; arguments: Record<string, unknown>; result: unknown }

export function createMockTools(definitions: Record<string, Handler> = {}) {
  const calls: Call[] = []
  return {
    calls,
    register(name: string, handler: Handler) { definitions[name] = handler; return this },
    async call(name: string, argumentsValue: Record<string, unknown> = {}) {
      const handler = definitions[name]
      if (typeof handler !== 'function') throw new Error(`mock tool is not registered: ${name}`)
      const result = await handler(argumentsValue)
      calls.push({ name, arguments: structuredClone(argumentsValue), result: structuredClone(result) })
      return result
    },
  }
}

export function createMockNetwork(routes: Record<string, unknown | NetworkHandler> = {}) {
  const requests: Array<{ url: string; options: Record<string, unknown>; response: unknown }> = []
  return {
    requests,
    async request(url: string, options: Record<string, unknown> = {}) {
      const route = routes[url]
      if (route === undefined) throw new Error(`mock network route is not registered: ${url}`)
      const response = typeof route === 'function' ? await (route as NetworkHandler)({ url, options }) : route
      requests.push({ url, options: structuredClone(options), response: structuredClone(response) })
      return response
    },
  }
}

export function createTemporaryDatabase() {
  const records = new Map<string, unknown>()
  return {
    async get(key: string) { return structuredClone(records.get(key)) },
    async set(key: string, value: unknown) { records.set(key, structuredClone(value)) },
    async delete(key: string) { records.delete(key) },
    async clear() { records.clear() },
  }
}
