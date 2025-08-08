# Beena

Local, privacy‑first visual regression testing for Storybook. Compare a baseline branch to a feature branch, generate a single HTML report, and run identically on your machine or in CI.

- License: MIT
- Status: Actively developed

## Why Beena

- Local and CI‑parity: no cloud dependency, no data upload
- Cost‑efficient: no SaaS fees or per‑screenshot charges
- Fast and accurate: parallelized screenshots + pixelmatch diffs
- Cross‑platform: macOS, Linux, Windows; Storybook v6+

## Quick Start

- Requirements
  - Node.js 18+ and npm (or compatible)
  - Git repo with accessible baseline and feature branches
  - Storybook v6+ that can build successfully
  - Playwright (browsers will be installed on first run)
- Install and run
  ```
  npm i -D beena
  npx beena -b main -f my-feature
  ```

The CLI prints the HTML report path; open it in a browser.

Notes:

- Keep your working tree clean (commit or stash) before running.
- Installing may take longer as Playwright downloads browsers.

## CLI

Basic:

- npx beena -b <baseline-branch> -f <feature-branch>

Flags:

- `-b`, `--baseline-branch` Baseline branch name (required), the reference branch (e.g., main).
- `-f`, `--feature-branch` Feature branch name (required). the branch with changes to compare against baseline.

Exit codes:

- `0`: Completed without fatal errors. (Diff presence policy may be configurable in future.)
- `1`: Fatal error (e.g., Storybook build failure, Playwright error).

## How it works

1. Checks out and builds Storybook for the baseline branch, screenshots each story using Playwright.
2. Repeats for the feature branch.
3. Matches stories strictly by Storybook story ID and computes visual diffs with pixelmatch.
4. Generates a single, standalone HTML report with counts and per‑story views (diff heatmap + slider).
5. Saves artifacts under node_modules/.cache/beena.

Tech stack:

- Screenshotting: Playwright
- Diffing: [pixelmatch](https://github.com/mapbox/pixelmatch) (accurate anti-aliased pixels detection and perceptual color difference metrics)
- Concurrency: automatic parallelization based on available CPU

Defaults (current behavior):

- Strict match by story ID across branches
- Automatic parallelization; no manual config required yet
- A single default viewport/device scale (will become configurable)

## Reports

- Format: single HTML file (plus any required assets if applicable)
- Location: node_modules/.cache/beena
- Contents:
  - Summary: counts of ok / added / changed / deleted stories
  - Per‑story details: diff heatmap and baseline vs feature slider
- Usage:
  - Open locally in a browser
  - Upload directory as a CI artifact and download/view post‑job

## CI/CD

Beena runs the same locally and in CI; no special flags.

General guidance:

- Use [official Playwright Docker images](https://playwright.dev/docs/docker) for speed and determinism.
- Ensure the runner has git history to check out both branches.
- Persist node_modules/.cache/beena as an artifact.

Tip: cache node_modules and Playwright browsers in your CI to reduce cold‑start time.

## Limitations (current)

- Renamed/moved stories appear as added/deleted (strict ID match)
- No story filtering/subsetting yet
- No CPU/thread or memory limit controls yet

## Troubleshooting

Build errors or missing report:

- Check terminal logs for Storybook or Playwright errors
- Verify both branches are accessible and buildable

Inconsistent renders:

- Stabilize fonts, network requests, animations and timers
- Use deterministic seed data/mocks in stories
- Ensure identical Storybook configuration across branches

## Security and privacy

- No screenshots or diffs, usage statistics, or telemetry leave your environment
- Headless browsers run locally or in your CI; no outbound uploads by Beena

## Comparison to hosted services

Advantages:

- No SaaS fees, offline capable, full data control

Trade‑offs:

- Performance depends on your machine/runner
- No managed dashboard/cloud storage

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
