import { ChildProcessWithoutNullStreams } from "node:child_process"

export function setupProcessCleanUponExit(childProcesses: ChildProcessWithoutNullStreams[]) {
  const processExitEvents = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'uncaughtException', 'exit']
  processExitEvents.forEach(
    (event) => {
      process.on(event, (reason) => {
        if (event === 'uncaughtException') {
          console.error('Uncaught Exception:', reason)
        } else {
          console.log(`Process exiting due to: ${event}`)
        }
        childProcesses.forEach((item) => item.kill())
        process.exit(event === 'uncaughtException' ? 1 : 0)
      })
    }
  )
}