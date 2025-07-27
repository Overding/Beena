export function extractPortNumberFromLog(log: string): number | null {
  const regex = /\b(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d+)\b/
  const match = log.match(regex)

  if (match) {
    return +match[1]
  }

  return null
}
