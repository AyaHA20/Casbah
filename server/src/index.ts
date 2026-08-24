import { createApp } from './app.js'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import { waitForDatabase } from './lib/db-ready.js'
import { createShutdown, installCrashHandlers, installSignalHandlers } from './lib/lifecycle.js'
import { setReady } from './routes/health.routes.js'

const app = createApp()

let bindFailed = false

const server = app.listen(env.PORT, () => {
  // Deferred by one tick: on Windows a dual-stack bind can emit 'listening' for
  // IPv4 before the IPv6 half fails with EADDRINUSE, which would otherwise
  // print "API is up" immediately above "port already in use".
  setImmediate(() => {
    if (bindFailed) return
    console.log(`Casbah API — http://localhost:${env.PORT}/api/health  [${env.NODE_ENV}]`)

    // Warm the Neon compute at boot rather than making the first customer pay
    // for it, and only report ready once it answers. Not awaited: the process
    // already accepts connections and /api/health/ready reports the truth
    // meanwhile.
    void waitForDatabase('db').then(setReady)
  })
})

// Without this, EADDRINUSE is an unhandled 'error' event and the process dies
// with a stack trace — which reads like a crash rather than "the port is taken".
server.on('error', (err: NodeJS.ErrnoException) => {
  bindFailed = true
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${env.PORT} is already in use — another server is running.\n` +
        `  Find it:  netstat -ano | findstr :${env.PORT}\n` +
        `  Or use a different port:  PORT=4010 npm run dev`,
    )
  } else if (err.code === 'EACCES') {
    console.error(`Port ${env.PORT} needs elevated privileges. Pick a port above 1024.`)
  } else {
    console.error('Server failed to start:', err)
  }
  process.exit(1)
})

const shutdown = createShutdown({
  server,
  disconnect: () => prisma.$disconnect(),
  // Fail readiness the instant draining starts, so the load balancer stops
  // sending new traffic while in-flight requests finish.
  onDraining: () => setReady(false),
  graceMs: 10_000,
})

installSignalHandlers(shutdown)
installCrashHandlers(shutdown)
