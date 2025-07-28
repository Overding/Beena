export function extractPortNumberFromLog(log: string): number | null {
  const regex = /\b(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d+)\b/
  const match = log.match(regex)

  if (match) {
    return +match[1]
  }

  return null
}

export function extractVersionFromLog(log: string): string | null {
  const regex = /Storybook (\d+\.\d+\.\d+) for/
  const versionMatch = log.match(regex)

  if (versionMatch) {
    return versionMatch[1]
  }

  return null
}
