import { execSync, spawnSync } from "node:child_process"

export function getGitBranchSHA1(branchName: string) {
  try {
    // Execute the Git command to get the commit SHA-1 of the branch
    const sha1 = execSync(`git rev-parse ${branchName}`, {
      encoding: 'utf8',
    }).trim()
    return sha1
  } catch (error) {
    console.log(error)
    throw new Error(
      `Unable to retrieve SHA-1 for branch "${branchName}". Make sure the branch exists and Git is installed.`
    )
  }
}

export function checkoutGitBranch(branch: string) {
  spawnSync('git', ['checkout', branch])
  console.log(`Checked out ${branch} branch`)
}