import { createApp } from './app.js'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`Casbah API — http://localhost:${env.PORT}/api/health  [${env.NODE_ENV}]`)
})

// Close the pool on the way out: Neon counts idle connections, and a process
// killed without disconnecting leaves them hanging until they time out.
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down.`)
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
