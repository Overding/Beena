import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'

import { chromium } from 'playwright'
import Handlebars from 'handlebars'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

import { checkoutGitBranch, getGitBranchSHA1 } from './utils/git.js'
import { setupProcessCleanUponExit } from './utils/process.js'

type StoryDiff = {
  id: string
  status: 'ok' | 'added' | 'deleted' | 'changed'
}

const childProcesses: ChildProcessWithoutNullStreams[] = []
setupProcessCleanUponExit(childProcesses)

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
  console.log('Building storybook')
  const { port, childProcess } = await runStorybook()
  childProcesses.push(childProcess)
  console.log(`Storybook running at http://localhost:${port}`)
  console.log(`Taking screenshots of stories.`)
  const storyIds = await takeScreenshotsOfStorybook(port, branch)
  console.log(`Took screenshots of stories.`)
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

  await page.getByLabel('Collapse', { exact: true }).click() // newer versions of storybook
  await page.keyboard.press('ControlOrMeta+Shift+ArrowDown') // version 6?

  await page
    .locator('[data-nodetype="story"]')
    .first()
    .waitFor({ state: 'attached' })
  const storiesLinks = await page.locator('[data-nodetype="story"]')
  const storiesLinksCount = await storiesLinks.count()

  const workersCount = Math.ceil(Math.max(os.cpus().length / 3, 1))
  const storyPerWorker = Math.ceil(storiesLinksCount / workersCount)

  console.log(
    `using ${workersCount} worker(s). stories per worker: ${storyPerWorker}`,
  )

  const workerProcesses = []
  for (let workerIndex = 0; workerIndex < workersCount; workerIndex++) {
    workerProcesses.push(
      doWork(
        workerIndex * storyPerWorker,
        Math.min((workerIndex + 1) * storyPerWorker, storiesLinksCount),
        workerIndex,
      ),
    )
  }

  const storyIds = (await Promise.all(workerProcesses)).reduce(
    (acc, current) => acc.concat(current),
    [],
  )

  async function doWork(
    startIndex: number,
    endIndex: number,
    workerIndex: number,
  ) {
    const storyPage = await browser.newPage()
    const workerStoryIds = []

    const retriedStories: Record<string, number> = {}

    for (let i = startIndex; i < endIndex; i++) {
      const storyLink = await storiesLinks
        .nth(i)
        //TODO: difference in different versions of storybook!! a is not nested in the previous versions
        .locator('a')
        .first()
        .getAttribute('href')

      if (!storyLink) {
        continue
      }

      const storyId = storyLink.split('/').pop() as string

      // TODO: it can be #root in lower version of storybook
      const rootSelector = '#storybook-root'

      try {
        await storyPage.goto(
          `http://localhost:${port}/iframe.html?viewMode=story&id=${storyId}`,
          { waitUntil: 'networkidle', timeout: 60000 },
        )

        await storyPage.waitForSelector(rootSelector, {
          timeout: (retriedStories[storyId] ?? 0) === 0 ? 30000 : 60000,
        })
      } catch (_error) {
        if (!retriedStories[storyId] || retriedStories[storyId] < 3) {
          console.warn(
            'will retry the ',
            storyId,
            `(retry count ${retriedStories[storyId] ?? 0} so far)`,
          )
          retriedStories[storyId] = (retriedStories[storyId] ?? 0) + 1
          continue
          i--
        } else {
          await storyPage.screenshot({
            path: path.join(
              process.cwd(),
              screenshotsDirPath,
              getGitBranchSHA1(branchName),
              `${storyId}.png`,
            ),
            fullPage: true,
            animations: 'disabled',
          })
          continue
        }
      }
      const body = await storyPage.locator('body')
      const bodyBoundingBox = await body.boundingBox()
      const newBrowserSize = {
        width: Math.ceil(bodyBoundingBox.width),
        height: Math.ceil(bodyBoundingBox.height),
      }
      await storyPage.setViewportSize(newBrowserSize)

      await storyPage.waitForFunction<boolean, string>((rootSelector) => {
        return (
          document.querySelector(rootSelector).children.length > 0 &&
          document
            .querySelector(rootSelector)
            .children[0].textContent.indexOf('Loading...') === -1
        )
      }, rootSelector)

      await storyPage.evaluate(async () => {
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

      await storyPage.screenshot({
        path: path.join(
          process.cwd(),
          screenshotsDirPath,
          getGitBranchSHA1(branchName),
          `${storyId}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      })

      workerStoryIds.push(storyId)
    }

    return workerStoryIds
  }

  await browser.close()
  console.log(
    `It took ${
      (Date.now() - startTime) / 60000
    } minutes to to take the screenshots for this branch`,
  )
  return storyIds
}

async function runStorybook(): Promise<{
  port: number
  childProcess: ChildProcessWithoutNullStreams
}> {
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
      const port = extractPort(data)
      if (port) {
        resolve({ port: +port, childProcess })
      }
    })

    childProcess.stderr.setEncoding('utf8')
    childProcess.stderr.on('data', function (_data) {
      // TODO: Verbose mode should enable this console
      // console.error(data);
    })
  })
}

function extractPort(input: string) {
  const regex = /localhost:(\d+)/
  const match = input.match(regex)

  if (match) {
    return match[1]
  }

  return null
}
