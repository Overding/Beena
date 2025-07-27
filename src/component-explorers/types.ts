import { ChildProcessWithoutNullStreams } from 'child_process'
import { Page } from 'playwright'

export type RunComponentExplorer = () => Promise<{
  port: number
  childProcess: ChildProcessWithoutNullStreams
}>

export type GetComponentIdsInPage = (page: Page) => Promise<string[]>
