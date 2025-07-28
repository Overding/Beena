import { ChildProcessWithoutNullStreams } from 'child_process'
import { Page } from 'playwright'

export type RunComponentExplorer = () => Promise<{
  port: number
  version: string
  childProcess: ChildProcessWithoutNullStreams
}>

export type GetComponentIdsInPage = (
  page: Page,
  version: string,
  baseURL: string,
) => Promise<string[]>

export type GotoComponentPage = (
  page: Page,
  version: string,
  baseURL: string,
  componentId: string,
  timeout: number,
) => Promise<void>

export type FitPageSizeToComponent = (page: Page) => Promise<void>
export type WaitUntilComponentIsReady = (
  page: Page,
  version: string,
) => Promise<void>
