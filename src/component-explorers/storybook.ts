import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  RunComponentExplorer,
  GotoComponentPage,
  GetComponentIdsInPage,
  FitPageSizeToComponent,
  WaitUntilComponentIsReady,
} from './types.js'
import { extractPortNumberFromLog } from '../utils/stdio.js'

export const run: RunComponentExplorer = () => {
  return new Promise((resolve, _) => {
    let port: number | null = null

    const storybookExecutable =
      getStorybookMajorVersion() >= 7 ? 'storybook' : 'start-storybook'
    const childProcess = spawn('npx', [
      '--no-install',
      '--no',
      storybookExecutable,
      'dev',
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
  await page
    .locator('[data-nodetype="component"]')
    .first()
    .waitFor({ state: 'attached' })
  await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')

  const storiesLinks = await page.locator('[data-nodetype="story"]').all()

  const storiesIds = (
    await Promise.all(
      storiesLinks.map(
        (item) =>
          // In Storybook v6 (some cases in v7) the [data-nodetype="story"] element is a link itself
          item.getAttribute('href') ??
          // In Storybook v7+ the [data-nodetype="story"] element is a div which has a link inside it
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
  const rootSelector =
    getStorybookMajorVersion() === 6 ? '#root' : '#storybook-root'
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
) => {
  const rootSelector =
    getStorybookMajorVersion() === 6 ? '#root' : '#storybook-root'
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

const getStorybookMajorVersion = (): number => {
  const version = getStorybookVersion()
  if (!version) {
    throw new Error('Could not extract Storybook version')
  }

  //extract the major version out of a string which has full version in it
  const versionMatch = version?.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!versionMatch) {
    throw new Error('Could not extract Storybook version: ' + version)
  }

  return parseInt(versionMatch[1], 10)
}

let cachedStorybookVersion: string | null = null
function getStorybookVersion(): string | null {
  if (cachedStorybookVersion) {
    return cachedStorybookVersion
  }

  try {
    // List of common Storybook renderer/framework packages to check
    const storybookPackages = [
      '@storybook/react',
      '@storybook/vue',
      '@storybook/vue3',
      '@storybook/angular',
      '@storybook/web-components',
      '@storybook/html',
      '@storybook/svelte',
      '@storybook/preact',
      '@storybook/ember',
      '@storybook/nextjs',
      '@storybook/sveltekit',
      '@storybook/qwik',
      '@storybook/solid',

      // Framework packages (newer naming convention)
      '@storybook/react-webpack5',
      '@storybook/react-vite',
      '@storybook/vue3-webpack5',
      '@storybook/vue3-vite',
      '@storybook/angular-webpack5',

      // Core packages that might contain version info
      '@storybook/core',
      '@storybook/core-server',
      'storybook', // Main package in newer versions
    ]

    const installedPackages = []

    // Check each potential Storybook package
    for (const packageName of storybookPackages) {
      try {
        const packagePath = path.resolve(
          'node_modules',
          packageName,
          'package.json',
        )
        if (fs.existsSync(packagePath)) {
          const packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
          installedPackages.push({
            name: packageName,
            version: packageInfo.version,
          })
        }
      } catch (_) {
        // Skip packages that can't be read
        continue
      }
    }

    if (installedPackages.length === 0) {
      cachedStorybookVersion = null
      return null
    }

    cachedStorybookVersion = installedPackages[0].version as string
    return cachedStorybookVersion
  } catch (_) {
    cachedStorybookVersion = null
    return cachedStorybookVersion
  }
}
