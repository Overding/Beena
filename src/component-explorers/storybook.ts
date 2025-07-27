import { spawn } from 'node:child_process'

import {
  RunComponentExplorer,
  GotoComponentPage,
  GetComponentIdsInPage,
  FitPageSizeToComponent,
  WaitUntilComponentIsReady,
} from './types.js'
import { extractPortNumberFromLog } from '../utils/stdio.js'

// TODO: it can be #root in lower version of storybook
const rootSelector = '#storybook-root'

export const run: RunComponentExplorer = () => {
  return new Promise((resolve, _) => {
    const childProcess = spawn('yarn', [
      'storybook',
      'dev',
      '--no-open',
      '--disable-telemetry',
    ])

    childProcess.stdout.setEncoding('utf8')
    childProcess.stdout.on('data', function (data) {
      console.log(data)
      const port = extractPortNumberFromLog(data)
      if (port) {
        resolve({ port, childProcess })
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
  baseURL,
) => {
  await page.goto(baseURL)

  // TODO: does expanding the stories work in all versions of storybook?
  await page.getByLabel('Collapse', { exact: true }).click() // newer versions
  await page.keyboard.press('ControlOrMeta+Shift+ArrowDown') // version 6

  await page
    .locator('[data-nodetype="story"]')
    .first()
    .waitFor({ state: 'attached' })
  const storiesLinks = await page.locator('[data-nodetype="story"]').all()

  const storiesIds = (
    await Promise.all(
      storiesLinks.map((item) =>
        //TODO: difference in different versions of storybook!! a is not nested in the previous versions
        item.locator('a').first().getAttribute('href'),
      ),
    )
  )
    .filter((item) => item !== null)
    .map((item) => item.split('/').pop() as string)

  return storiesIds
}

export const gotoComponentPage: GotoComponentPage = async (
  page,
  baseURL,
  componentId,
  timeout,
) => {
  await page.goto(`${baseURL}/iframe.html?viewMode=story&id=${componentId}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  })

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
) => {
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
