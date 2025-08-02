import { ChildProcessWithoutNullStreams } from 'child_process'
import { Page } from 'playwright'

export type RunComponentExplorer = () => Promise<{
  port: number
  childProcess: ChildProcessWithoutNullStreams
}>

export type GetComponentIdsInPage = (
  page: Page,
  baseURL: string,
) => Promise<string[]>

export type GotoComponentPage = (
  page: Page,
  baseURL: string,
  componentId: string,
  timeout: number,
) => Promise<void>

export type FitPageSizeToComponent = (page: Page) => Promise<void>
export type WaitUntilComponentIsReady = (page: Page) => Promise<void>
