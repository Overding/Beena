import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ChildProcessWithoutNullStreams } from 'node:child_process'
import { Command } from 'commander'
import { chromium } from 'playwright'
import { PNG, PNGWithMetadata } from 'pngjs'
import pixelmatch from 'pixelmatch'

import { checkoutGitBranch, getGitBranchSHA1 } from './utils/git.js'
import { setupProcessCleanUponExit } from './utils/process.js'

import * as componentExplorers from './component-explorers/index.js'

type ComponentDiff = {
  id: string
  status: 'ok' | 'added' | 'deleted' | 'changed'
}

const cmd = new Command()
cmd
  .requiredOption(
    '-b, --baseline-branch <name>',
    'baseline branch name such as main',
  )
  .requiredOption(
    '-f, --feature-branch <name>',
    'feature branch name such as feat/awesome-feature',
  )

cmd.parse(process.argv)

const childProcesses: ChildProcessWithoutNullStreams[] = []
setupProcessCleanUponExit(childProcesses)

const COMPONENT_RENDER_FIRST_TRY_TIMEOUT_IN_MS = 30_000
const COMPONENT_RENDER_SECOND_TRY_TIMEOUT_IN_MS = 60_000

const componentExplorerType = 'storybook'
const componentExplorer = componentExplorers[componentExplorerType]

const baselineBranch = cmd.opts().baselineBranch as string
const baselineBranchHash = getGitBranchSHA1(baselineBranch)
const featureBranch = cmd.opts().featureBranch as string
const featureBranchHash = getGitBranchSHA1(featureBranch)
const screenshotsDirPath = './node_modules/.cache/beena/screenshots'
const reportDirPath = './node_modules/.cache/beena/reports'
const jobId = Date.now().toString()

if (fs.existsSync(path.join(process.cwd(), screenshotsDirPath))) {
  fs.rmSync(path.join(process.cwd(), screenshotsDirPath), {
    recursive: true,
  })
}

const baselineBranchComponentIds =
  await screenshotStorybookByBranch(baselineBranch)
const featureBranchComponentIds =
  await screenshotStorybookByBranch(featureBranch)
createReportDirectory()
const componentsDiff = getComponentsDiff(
  baselineBranchComponentIds,
  featureBranchComponentIds,
)
generateReport(componentsDiff)
process.exit()

async function screenshotStorybookByBranch(branch: string): Promise<string[]> {
  checkoutGitBranch(branch)
  console.log(`Starting up the component explorer (${componentExplorerType})… `)
  const { port, childProcess } = await componentExplorer.run()
  childProcesses.push(childProcess)
  console.log(`Component explorer is running at http://localhost:${port}`)
  console.log(`Taking screenshots of components…`)
  const ComponentIds = await takeScreenshotsOfStorybook(port, branch)
  childProcess.kill()
  return ComponentIds
}

function createReportDirectory() {
  const reportDiffDirPath = path.join(process.cwd(), reportDirPath, jobId)
  fs.mkdirSync(reportDiffDirPath, { recursive: true })
}

function generateReport(componentsDiff: ComponentDiff[]) {
  const reportConfig = {
    jobId,
    baselineBranch,
    baselineBranchHash,
    featureBranch,
    featureBranchHash,
    timestamp: Date.now(),
  }

  const template = fs.readFileSync(
    path.join(getModuleDir(), 'report-template.html'),
    'utf8',
  )
  const reportContent = template
    .replace('{ /* config */ }', JSON.stringify(reportConfig, null, 2))
    .replace('{ /* componentDiffs */ }', JSON.stringify(componentsDiff))

  const reportPath = path.join(process.cwd(), reportDirPath, `${jobId}.html`)
  fs.writeFileSync(reportPath, reportContent)
  console.log('\n✅ Report has been saved to:', path.resolve(reportPath))
}

function getModuleDir() {
  const __filename = fileURLToPath(import.meta.url)
  return path.dirname(__filename)
}

function getComponentsDiff(
  baselineBranchComponentIds: string[],
  featureBranchComponentIds: string[],
): ComponentDiff[] {
  const componentIdsDiff = getComponentIdsDiff(
    baselineBranchComponentIds,
    featureBranchComponentIds,
  )
  for (const componentIdDiff of componentIdsDiff) {
    if (componentIdDiff.status !== 'ok') {
      continue
    }

    const baselineShotPath = path.join(
      process.cwd(),
      screenshotsDirPath,
      baselineBranchHash,
      `${componentIdDiff.id}.png`,
    )
    let baselineShotImage = PNG.sync.read(fs.readFileSync(baselineShotPath))

    const featureShotPath = path.join(
      process.cwd(),
      screenshotsDirPath,
      featureBranchHash,
      `${componentIdDiff.id}.png`,
    )
    let featureShotImage = PNG.sync.read(fs.readFileSync(featureShotPath))

    /**
     *  Since baselineShotImage and featureShotImage are expected to be the same
     *  size, we need to ensure that they have the same dimensions, otherwise
     *  pixelmatch will not generate the diff image correctly and will throw an
     *  error: Image sizes do not match. we can fill in the missing pixels with
     *  transparent pixels.
     */
    if (
      baselineShotImage.width !== featureShotImage.width ||
      baselineShotImage.height !== featureShotImage.height
    ) {
      const maxWidth = Math.max(baselineShotImage.width, featureShotImage.width)
      const maxHeight = Math.max(
        baselineShotImage.height,
        featureShotImage.height,
      )

      const paddedBaseline = new PNG({ width: maxWidth, height: maxHeight })
      const paddedFeature = new PNG({ width: maxWidth, height: maxHeight })

      /** Fill the padded images with white pixels to prevent these areas from
       * being detected as differences */
      paddedBaseline.data.fill(0xff)
      paddedFeature.data.fill(0xff)

      // Copy baseline image data into paddedBaseline
      PNG.bitblt(
        baselineShotImage,
        paddedBaseline,
        0,
        0,
        baselineShotImage.width,
        baselineShotImage.height,
        0,
        0,
      )

      // Copy feature image data into paddedFeature
      PNG.bitblt(
        featureShotImage,
        paddedFeature,
        0,
        0,
        featureShotImage.width,
        featureShotImage.height,
        0,
        0,
      )

      // Use the padded images from here on
      baselineShotImage = paddedBaseline as unknown as PNGWithMetadata
      featureShotImage = paddedFeature as unknown as PNGWithMetadata

      fs.writeFileSync(
        './baselineShotImage.png',
        PNG.sync.write(baselineShotImage),
      )
      fs.writeFileSync(
        './featureShotImage.png',
        PNG.sync.write(featureShotImage),
      )
    }

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

      componentIdDiff.status = diffNumber > 0 ? 'changed' : 'ok'

      if (componentIdDiff.status === 'changed') {
        const diffShotPath = path.join(
          process.cwd(),
          reportDirPath,
          jobId,
          `${componentIdDiff.id}.png`,
        )

        fs.writeFileSync(diffShotPath, PNG.sync.write(diff))
      }
    } catch (e) {
      console.log('Error for ', componentIdDiff.id)
      console.log(e)
    }
  }
  return componentIdsDiff
}

function getComponentIdsDiff(
  baselineBranchComponentIds: string[],
  featureBranchComponentIds: string[],
) {
  const baselineComponentIdsSet = new Set(baselineBranchComponentIds)
  const featureComponentIdsSet = new Set(featureBranchComponentIds)

  const componentsDiff: ComponentDiff[] = []

  baselineBranchComponentIds.forEach((id) => {
    if (featureComponentIdsSet.has(id)) {
      componentsDiff.push({ id, status: 'ok' })
    } else {
      componentsDiff.push({ id, status: 'deleted' })
    }
  })

  featureBranchComponentIds.forEach((id) => {
    if (!baselineComponentIdsSet.has(id)) {
      componentsDiff.push({ id, status: 'added' })
    }
  })

  return componentsDiff
}

async function takeScreenshotsOfStorybook(port: number, branchName: string) {
  const startTime = Date.now()
  console.log('taking screenshots for', branchName, 'branch.')
  const browser = await chromium.launch({
    headless: true,
  })
  const page = await browser.newPage()
  const baseURL = `http://localhost:${port}`

  const componentIds = await componentExplorer.getComponentIdsInPage(
    page,
    baseURL,
  )

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
    const workerPage = await browser.newPage()
    const workerComponentIds = []

    const retriedComponents: Record<string, number> = {}

    for (let i = startIndex; i < endIndex; i++) {
      const componentId = componentIds[i]

      try {
        const timeout =
          (retriedComponents[componentId] ?? 0) === 0
            ? COMPONENT_RENDER_FIRST_TRY_TIMEOUT_IN_MS
            : COMPONENT_RENDER_SECOND_TRY_TIMEOUT_IN_MS

        await componentExplorer.gotoComponentPage(
          workerPage,
          baseURL,
          componentId,
          timeout,
        )
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
          await workerPage.screenshot({
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

      await componentExplorer.fitPageSizeToComponent(workerPage)
      await componentExplorer.waitUntilComponentIsReady(workerPage)

      await workerPage.screenshot({
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
    `Done. It took ${((Date.now() - startTime) / 60000).toFixed(
      2,
    )} minutes to take the screenshots for this branch`,
  )
  return processedComponentIds
}
