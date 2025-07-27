import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ChildProcessWithoutNullStreams } from 'node:child_process'

import { chromium } from 'playwright'
import Handlebars from 'handlebars'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

import { checkoutGitBranch, getGitBranchSHA1 } from './utils/git.js'
import { setupProcessCleanUponExit } from './utils/process.js'

import * as componentExplorers from './component-explorers/index.js'

type StoryDiff = {
  id: string
  status: 'ok' | 'added' | 'deleted' | 'changed'
}

const childProcesses: ChildProcessWithoutNullStreams[] = []
setupProcessCleanUponExit(childProcesses)

const componentExplorer = 'storybook'
const baselineBranch = 'main'
const baselineBranchHash = getGitBranchSHA1(baselineBranch)
const featureBranch = 'feat/sample'
const featureBranchHash = getGitBranchSHA1(featureBranch)
const screenshotsDirPath = './node_modules/.cache/beena/screenshots'
const reportDirPath = './node_modules/.cache/beena/reports'
const diffId = Date.now().toString()

if (fs.existsSync(path.join(process.cwd(), screenshotsDirPath))) {
  fs.rmSync(path.join(process.cwd(), screenshotsDirPath), {
    recursive: true,
  })
}

const baselineBranchStoryIds = await screenshotStorybookByBranch(baselineBranch)
const featureBranchStoryIds = await screenshotStorybookByBranch(featureBranch)
createReportDirectory()
const storiesDiff = getStoriesDiff(
  baselineBranchStoryIds,
  featureBranchStoryIds,
)
console.log({ storiesDiff })
generateReport(storiesDiff)
process.exit()

async function screenshotStorybookByBranch(branch: string): Promise<string[]> {
  checkoutGitBranch(branch)
  console.log(`Starting up the component explorer (${componentExplorer})… `)
  const { port, childProcess } =
    await componentExplorers[componentExplorer].run()
  childProcesses.push(childProcess)
  console.log(`Component explorer is running at http://localhost:${port}`)
  console.log(`Taking screenshots of components…`)
  const storyIds = await takeScreenshotsOfStorybook(port, branch)
  console.log(`Took screenshots of components`)
  childProcess.kill()
  return storyIds
}

function createReportDirectory() {
  const reportDiffDirPath = path.join(process.cwd(), reportDirPath, diffId)
  fs.mkdirSync(reportDiffDirPath, { recursive: true })
}

function generateReport(storiesDiff: StoryDiff[]) {
  const reportPath = path.join(process.cwd(), reportDirPath, `${diffId}.html`)

  Handlebars.registerHelper(
    'ifEquals',
    function (this: unknown, arg1, arg2, options) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this)
    },
  )

  const template = Handlebars.compile(
    fs.readFileSync(path.join(getModuleDir(), 'report-template.hbs'), 'utf8'),
  )
  const reportContent = template({
    diffId,
    baselineBranchHash,
    featureBranchHash,
    storiesDiff,
  })

  fs.writeFileSync(reportPath, reportContent)
  console.log('Report has been saved to:', path.resolve(reportPath))
}

function getModuleDir() {
  const __filename = fileURLToPath(import.meta.url)
  return path.dirname(__filename)
}

function getStoriesDiff(
  baselineBranchStoryIds: string[],
  featureBranchStoryIds: string[],
): StoryDiff[] {
  const stroyIdsDiff = getStroyIdsDiff(
    baselineBranchStoryIds,
    featureBranchStoryIds,
  )
  for (const story of stroyIdsDiff) {
    if (story.status !== 'ok') {
      continue
    }

    const baselineShotPath = path.join(
      process.cwd(),
      screenshotsDirPath,
      baselineBranchHash,
      `${story.id}.png`,
    )
    const baselineShotImage = PNG.sync.read(fs.readFileSync(baselineShotPath))

    const featureShotPath = path.join(
      process.cwd(),
      screenshotsDirPath,
      featureBranchHash,
      `${story.id}.png`,
    )
    const featureShotImage = PNG.sync.read(fs.readFileSync(featureShotPath))

    const { width, height } = baselineShotImage
    const diff = new PNG({ width, height })

    try {
      const diffNumber = pixelmatch(
        baselineShotImage.data,
        featureShotImage.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 },
      )

      story.status = diffNumber > 0 ? 'changed' : 'ok'

      if (story.status === 'changed') {
        const diffShotPath = path.join(
          process.cwd(),
          reportDirPath,
          diffId,
          `${story.id}.png`,
        )

        fs.writeFileSync(diffShotPath, PNG.sync.write(diff))
      }
    } catch (e) {
      console.log('Error for ', story.id)
      console.log(e)
    }
  }
  return stroyIdsDiff
}

function getStroyIdsDiff(
  baselineBranchStoryIds: string[],
  featureBranchStoryIds: string[],
) {
  const baselineStoryIdsSet = new Set(baselineBranchStoryIds)
  const featureStoryIdsSet = new Set(featureBranchStoryIds)

  const storiesDiff: StoryDiff[] = []

  baselineBranchStoryIds.forEach((id) => {
    if (featureStoryIdsSet.has(id)) {
      storiesDiff.push({ id, status: 'ok' })
    } else {
      storiesDiff.push({ id, status: 'deleted' })
    }
  })

  featureBranchStoryIds.forEach((id) => {
    if (!baselineStoryIdsSet.has(id)) {
      storiesDiff.push({ id, status: 'added' })
    }
  })

  return storiesDiff
}

async function takeScreenshotsOfStorybook(port: number, branchName: string) {
  const startTime = Date.now()
  console.log('taking screenshots for', branchName, 'branch.')
  const browser = await chromium.launch({
    headless: true,
  })
  const page = await browser.newPage()
  await page.goto(`http://localhost:${port}/`)

  const componentIds =
    await componentExplorers[componentExplorer].getComponentIdsInPage(page)

  const workersCount = Math.ceil(Math.max(os.cpus().length / 3, 1))
  const componentsPerWorker = Math.ceil(componentIds.length / workersCount)

  console.log(
    `using ${workersCount} worker(s). components per worker: ${componentsPerWorker}`,
  )

  const workerProcesses = []
  for (let workerIndex = 0; workerIndex < workersCount; workerIndex++) {
    workerProcesses.push(
      doWork(
        workerIndex * componentsPerWorker,
        Math.min((workerIndex + 1) * componentsPerWorker, componentIds.length),
        workerIndex,
      ),
    )
  }

  const processedComponentIds = (await Promise.all(workerProcesses)).reduce(
    (acc, current) => acc.concat(current),
    [],
  )

  async function doWork(
    startIndex: number,
    endIndex: number,
    _workerIndex: number,
  ) {
    const componentPage = await browser.newPage()
    const workerComponentIds = []

    const retriedComponents: Record<string, number> = {}

    for (let i = startIndex; i < endIndex; i++) {
      const componentId = componentIds[i]

      // TODO: it can be #root in lower version of storybook
      const rootSelector = '#storybook-root'

      try {
        await componentPage.goto(
          `http://localhost:${port}/iframe.html?viewMode=story&id=${componentId}`,
          { waitUntil: 'networkidle', timeout: 60000 },
        )

        await componentPage.waitForSelector(rootSelector, {
          timeout: (retriedComponents[componentId] ?? 0) === 0 ? 30000 : 60000,
        })
      } catch (_error) {
        if (
          !retriedComponents[componentId] ||
          retriedComponents[componentId] < 3
        ) {
          console.warn(
            'will retry the ',
            componentId,
            `(retry count ${retriedComponents[componentId] ?? 0} so far)`,
          )
          retriedComponents[componentId] =
            (retriedComponents[componentId] ?? 0) + 1
          i--
          continue
        } else {
          await componentPage.screenshot({
            path: path.join(
              process.cwd(),
              screenshotsDirPath,
              getGitBranchSHA1(branchName),
              `${componentId}.png`,
            ),
            fullPage: true,
            animations: 'disabled',
          })
          continue
        }
      }
      const body = await componentPage.locator('body')
      const bodyBoundingBox = await body.boundingBox()
      const newBrowserSize = {
        width: Math.ceil(bodyBoundingBox.width),
        height: Math.ceil(bodyBoundingBox.height),
      }
      await componentPage.setViewportSize(newBrowserSize)

      await componentPage.waitForFunction<boolean, string>((rootSelector) => {
        return (
          document.querySelector(rootSelector).children.length > 0 &&
          document
            .querySelector(rootSelector)
            .children[0].textContent.indexOf('Loading...') === -1
        )
      }, rootSelector)

      await componentPage.evaluate(async () => {
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

      await componentPage.screenshot({
        path: path.join(
          process.cwd(),
          screenshotsDirPath,
          getGitBranchSHA1(branchName),
          `${componentId}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      })

      workerComponentIds.push(componentId)
    }

    return workerComponentIds
  }

  await browser.close()
  console.log(
    `It took ${
      (Date.now() - startTime) / 60000
    } minutes to to take the screenshots for this branch`,
  )
  return processedComponentIds
}
