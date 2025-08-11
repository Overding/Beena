# Beena

<img title="a title" alt="Alt text" width="100" height="100" style="display: block; margin: 0 0 15px 0" src="./logo.svg">

Local, fast visual regression testing for your frontend projects. Compare the components of your Storybook in a baseline branch to a feature branch, generate a single HTML report, and run identically on your machine or in CI.

## Why Beena

- Local and CI‑parity: no cloud dependency, no data upload
- Cost‑efficient: no SaaS fees or per‑screenshot charges
- Fast and accurate: parallelized runs and accurate diffs
- Cross‑platform: macOS, Linux, Windows;
- Supported Component Explorers: Storybook v6+

### Comparison to hosted services

#### **Advantages:**

- No SaaS subscriptions fees
- No per screenshot fee
- Offline capable

#### **Trade‑offs:**

- Performance depends on your machine/runner
- No managed dashboard to view the report

## Quick Start

- Requirements
  - Node.js 18+
  - Project should be version controlled by **Git**
  - Playwright (browsers will be installed on first run)
  - Storybook v6+

- Install and run

  ```
  npm i -D beena
  npx beena -b main -f my-feature
  ```

  - CLI Arguments:

    `-h`, `--help` display help for command.
    `-b`, `--baseline-branch` (_required_) Baseline branch name, the reference branch (e.g., `main`).

    `-f`, `--feature-branch` (_required_) Feature branch name. the branch with changes to compare against baseline (e.g. `my-feature`).
    `-t`, `--timeout <ms>` (_optional_) Timeout in milliseconds for component rendering in milliseconds.
    `-r`, `--retry` (_optional_) Number of times to retry component rendering on failure.
    `--enable-head` (_optional_) Show the browser head while rendering components; Useful for debugging.
    `-w`, `--workers-count` (_optional_) number of workers to use to run the jobs in parallel. By default application will use the half of available CPU cores.

The CLI will print the HTML report path which you can copy past and open it in your browser.

Notes:

- Keep your working tree clean (commit or stash) before running.
- Installing may take longer as Playwright downloads browsers.

## How it works

1. Checks out and builds Storybook for the baseline branch, screenshots each story using Playwright.
2. Repeats for the feature branch.
3. Matches stories strictly by Storybook story ID and computes visual diffs with pixelmatch.
4. Generates a single, standalone HTML report containing a summary and per‑story views (diff heatmap + slider).
5. Saves artifacts under node_modules/.cache/beena.

### Tech stack:

- Screenshotting: Playwright
- Diffing: [pixelmatch](https://github.com/mapbox/pixelmatch) (accurate anti-aliased pixels detection and perceptual color difference metrics)
- Concurrency: automatic parallelization based on available CPU

### Extendible architecture

The integration of Beena with Storybook is decoupled. In fact, it is easy to introduce integration for new component explorer software (similar to Storybook) into Beena. All logic related to component explorers is extracted into `src/component-explorers`. If you need a new integration, please create an issue in the GitHub repo. We are also open to contributions; see the notes below about contributing.

## CI/CD

Beena runs the same locally and in CI; no special flags needed.

General guidance:

- Use [official Playwright Docker images](https://playwright.dev/docs/docker) for speed and determinism.
- Ensure the runner has git history to check out both branches.
- Persist node_modules/.cache/beena as an artifact.
- To reduce cold‑start time consider caching node_modules and Playwright browsers in your CI

## Troubleshooting

Build errors or missing report:

- Check terminal logs for Storybook or Playwright errors
- Verify both branches are accessible and buildable

Inconsistent renders:

- Stabilize fonts, network requests, animations and timers
- Use deterministic seed data/mocks in stories
- Ensure identical Storybook configuration across branches

## Security and privacy

No screenshots or diffs, usage statistics, or telemetry leave your environment. The headless browsers run locally or in your CI; no outbound uploads by Beena.

## Roadmap

- Story filtering/subsetting
- Configurable diff sensitivity
- Configurable Resource limits (CPU/memory)
- Auto‑detect baseline/feature from git state
- Better handling of renamed/moved stories
- Multiple viewport sizes (desktop/tablet/mobile)
- Cross‑browser (Firefox/WebKit)
- Extensibility for other component explorers or workshops beside Storybook

## Contributing

We welcome contributions!

- Please open an issue first to discuss changes before submitting a PR
- Typical flow:
  - Open an issue describing the problem or feature
  - Discuss approach with maintainers
  - Submit a PR referencing the issue

## What is origin of name for the software (Beena)?

In Persian (Farsi) language, the word Beena, or "بینا" (bīnā) means "sighted" or "able to see". It can also carry a figurative meaning of "perceptive" or "insightful", referring to someone who understands things deeply or has good judgment. We thought it can be a good name for a software which is "able to see" the visual regressions.
