$ErrorActionPreference = "Stop"

function Assert-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Assert-Command -Name "node"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Write-Host "Updating the claw-kit local marketplace source and Codex cache..."
node (Join-Path $scriptDir "install-codex-plugin.mjs") --source-dir (Join-Path $repoRoot "packages\\codex-adapter")
if ($LASTEXITCODE -ne 0) {
  throw "Codex plugin install failed."
}

Write-Host ""
Write-Host "Codex plugin development surface update completed. Restart Codex and start a new task to load the refreshed skills."
