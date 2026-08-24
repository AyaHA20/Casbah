import type { Server } from 'node:http'

export type Shutdown = (signal: string) => Promise<void>

type Options = {
  server: Server
  /** Close the database pool. Injected so this module never imports Prisma. */
  disconnect: () => Promise<void>
  /** Flip readiness false the instant draining starts. */
  onDraining?: () => void
  /**
   * Must stay below the platform's own kill timeout (commonly 30s), or the
   * platform SIGKILLs us mid-drain and none of this runs.
   */
  graceMs?: number
  /** Injectable so tests can assert the exit code without dying. */
  exit?: (code: number) => void
  log?: (msg: string) => void
  logError?: (msg: string, err?: unknown) => void
}

/**
 * Builds the drain sequence: stop accepting connections, let in-flight requests
 * finish, then close the database pool.
 *
 * `server.close()` is the part that matters — it refuses new sockets but lets
 * open requests run to completion, so a rolling restart cannot cut a customer
 * off mid-checkout. Disconnecting Prisma before that drain finishes would fail
 * those very requests, which is why the await order is deliberate and not
 * merely tidy.
 */
export function createShutdown(opts: Options): Shutdown {
  const {
    server,
    disconnect,
    onDraining,
    graceMs = 10_000,
    exit = (code) => process.exit(code),
    log = (m) => console.log(m),
    logError = (m, e) => (e === undefined ? console.error(m) : console.error(m, e)),
  } = opts

  let running = false

  return async function shutdown(signal: string): Promise<void> {
    // A second SIGTERM must not restart the sequence half-way through.
    if (running) return
    running = true

    onDraining?.()
    log(`${signal} received — draining (max ${Math.round(graceMs / 1000)}s).`)

    const forced = setTimeout(() => {
      logError(`Drain exceeded ${graceMs}ms — forcing exit.`)
      // Whatever is still open has had its chance; cut it rather than let the
      // platform SIGKILL us with the database pool still held.
      server.closeAllConnections?.()
      exit(1)
    }, graceMs)
    // This timer must not itself hold the process open.
    forced.unref?.()

    // server.close() waits for EVERY socket, including idle keep-alive
    // connections a load balancer holds open with no request on them. Sweeping
    // once is not enough: a socket becomes idle the moment its response ends,
    // which is after the first sweep has run. So sweep on an interval until the
    // close callback fires. Sockets mid-request are never touched.
    const sweep = setInterval(() => server.closeIdleConnections?.(), 100)
    sweep.unref?.()

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
        server.closeIdleConnections?.()
      })
      log('HTTP server closed, no requests in flight.')
    } catch (err) {
      logError('Error while closing the HTTP server:', err)
    } finally {
      clearInterval(sweep)
    }

    try {
      // Neon counts idle connections; exiting without disconnecting leaves them
      // held until they time out server-side.
      await disconnect()
      log('Database pool closed.')
    } catch (err) {
      logError('Error while disconnecting the database:', err)
    }

    clearTimeout(forced)
    exit(0)
  }
}

export function installSignalHandlers(shutdown: Shutdown): void {
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

/** Everything worth knowing about a thrown value, without assuming it is an Error. */
export function describeFatal(value: unknown): string[] {
  const lines: string[] = []
  if (value instanceof Error) {
    lines.push(`  ${value.name}: ${value.message}`)
    if (value.stack) lines.push(value.stack)
    if ('code' in value) lines.push(`  code: ${String((value as { code: unknown }).code)}`)
    if (value.cause !== undefined) lines.push(`  cause: ${String(value.cause)}`)
  } else {
    lines.push(`  non-Error value: ${typeof value}`)
    try {
      lines.push(`  ${JSON.stringify(value)}`)
    } catch {
      lines.push(`  ${String(value)}`)
    }
  }
  return lines
}

/**
 * A rejection or exception nobody handled means a code path failed in a way no
 * request ever learned about. Log enough to debug, then exit non-zero so the
 * platform replaces the instance — continuing would keep serving from a state
 * nobody has reasoned about.
 */
export function installCrashHandlers(
  shutdown: Shutdown,
  logError: (msg: string) => void = (m) => console.error(m),
): void {
  process.on('unhandledRejection', (reason: unknown) => {
    logError('UNHANDLED REJECTION — exiting.')
    for (const line of describeFatal(reason)) logError(line)
    void shutdown('unhandledRejection')
  })

  process.on('uncaughtException', (err: Error, origin: string) => {
    logError('UNCAUGHT EXCEPTION — exiting.')
    logError(`  origin: ${origin}`)
    for (const line of describeFatal(err)) logError(line)
    void shutdown('uncaughtException')
  })
}
