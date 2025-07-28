import { spawn } from 'node:child_process'

import {
  RunComponentExplorer,
  GotoComponentPage,
  GetComponentIdsInPage,
  FitPageSizeToComponent,
  WaitUntilComponentIsReady,
} from './types.js'
import {
  extractPortNumberFromLog,
  extractVersionFromLog,
} from '../utils/stdio.js'

export const run: RunComponentExplorer = () => {
  return new Promise((resolve, _) => {
    let port: number | null = null
    let version: string | null = null

    // TODO: The command to run storybook might be different per project on user space
    const childProcess = spawn('npm', [
      'run',
      'storybook',
      'dev',
      '--',
      '--ci',
      '--no-open',
      '--disable-telemetry',
    ])

    childProcess.stdout.setEncoding('utf8')
    childProcess.stdout.on('data', function (data) {
      console.log(data)
      if (!port) {
        port = extractPortNumberFromLog(data)
      }

      if (!version) {
        version = extractVersionFromLog(data)
      }

      if (port && version) {
        resolve({ port, version, childProcess })
      }
    })

    childProcess.stderr.setEncoding('utf8')
    childProcess.stderr.on('data', function (_data) {
      // TODO: Verbose mode should enable this console
      // console.error(data);
    })
  })
}

export const getComponentIdsInPage: GetComponentIdsInPage = async (
  page,
  version,
  baseURL,
) => {
  const majorVersion = getMajorVersion(version)

  await page.goto(baseURL)
  await page
    .locator('[data-nodetype="component"]')
    .first()
    .waitFor({ state: 'attached' })
  console.log('sending keyboard shortcut to open the component explorer')
  await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
  console.log('sent ControlOrMeta+Shift+ArrowDown')

  const storiesLinks = await page.locator('[data-nodetype="story"]').all()

  const storiesIds = (
    await Promise.all(
      storiesLinks.map((item) =>
        majorVersion >= 7
          ? item.locator('a').first().getAttribute('href')
          : item.getAttribute('href'),
      ),
    )
  )
    .filter((item) => item !== null)
    .map((item) => item.split('/').pop() as string)
  console.log({ storiesIds })
  return storiesIds
}

export const gotoComponentPage: GotoComponentPage = async (
  page,
  version,
  baseURL,
  componentId,
  timeout,
) => {
  const rootSelector =
    getMajorVersion(version) === 6 ? '#root' : '#storybook-root'
  await page.goto(`${baseURL}/iframe.html?viewMode=story&id=${componentId}`)
  await page.waitForSelector(rootSelector, { timeout })
}

export const fitPageSizeToComponent: FitPageSizeToComponent = async (page) => {
  const bodyBoundingBox = await page.locator('body').boundingBox()
  if (bodyBoundingBox) {
    const newBrowserSize = {
      width: Math.ceil(bodyBoundingBox.width),
      height: Math.ceil(bodyBoundingBox.height),
    }
    await page.setViewportSize(newBrowserSize)
  }
}

export const waitUntilComponentIsReady: WaitUntilComponentIsReady = async (
  page,
  version,
) => {
  const rootSelector =
    getMajorVersion(version) === 6 ? '#root' : '#storybook-root'
  await page.waitForFunction<boolean, string>((rootSelector) => {
    return (
      document.querySelector(rootSelector).children.length > 0 &&
      document
        .querySelector(rootSelector)
        .children[0].textContent.indexOf('Loading...') === -1
    )
  }, rootSelector)

  await page.evaluate(async () => {
    const selectors = Array.from(document.querySelectorAll('img'))
    return await Promise.all(
      selectors.map((img) => {
        if (img.complete) return
        return new Promise((resolve, reject) => {
          img.addEventListener('load', resolve)
          img.addEventListener('error', reject)
        })
      }),
    )
  })
}

const getMajorVersion = (version: string): number => {
  //extract the major version out of a string which has full version in it
  const versionMatch = version?.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!versionMatch) {
    throw new Error('Could not extract Storybook version: ' + version)
  }

  return parseInt(versionMatch[1], 10)
}
