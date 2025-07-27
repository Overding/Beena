import { spawn } from 'node:child_process'

import { GetComponentIdsInPage, RunComponentExplorer } from './types.js'
import { extractPortNumberFromLog } from '../utils/stdio.js'

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

export const getComponentIdsInPage: GetComponentIdsInPage = async (page) => {
  await page.getByLabel('Collapse', { exact: true }).click() // newer versions of storybook
  await page.keyboard.press('ControlOrMeta+Shift+ArrowDown') // version 6?

  await page
    .locator('[data-nodetype="story"]')
    .first()
    .waitFor({ state: 'attached' })
  const storiesLinks = await page.locator('[data-nodetype="story"]').all()

  const links = (
    await Promise.all(
      storiesLinks.map((item) =>
        //TODO: difference in different versions of storybook!! a is not nested in the previous versions
        item.locator('a').first().getAttribute('href'),
      ),
    )
  )
    .filter((item) => item !== null)
    .map((item) => item.split('/').pop() as string)

  return links
}
