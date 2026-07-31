param(
  [string]$Ref = "main"
)

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
Assert-Command -Name "git"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Write-Host "Resolving the published claw-kit GitHub marketplace ref..."
$repositoryUrl = "https://github.com/chanyuenpang/claw-kit.git"
$resolvedLine = git ls-remote $repositoryUrl $Ref | Select-Object -First 1
if ($LASTEXITCODE -ne 0 -or -not $resolvedLine) {
  throw "Unable to resolve published claw-kit marketplace ref '$Ref'."
}
$resolvedCommit = ($resolvedLine -split "\s+")[0]
if ($resolvedCommit -notmatch "^[a-f0-9]{40}$") {
  throw "Published claw-kit marketplace ref '$Ref' did not resolve to a commit."
}

Write-Host "Installing immutable marketplace commit $resolvedCommit..."
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("claw-kit-marketplace-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  git -C $tempRoot init --quiet
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to initialize the temporary marketplace checkout."
  }
  git -C $tempRoot remote add origin $repositoryUrl
  git -C $tempRoot fetch --depth 1 origin $resolvedCommit
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to fetch immutable marketplace commit $resolvedCommit."
  }
  git -C $tempRoot checkout --quiet --detach FETCH_HEAD
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to checkout immutable marketplace commit $resolvedCommit."
  }
  node (Join-Path $scriptDir "install-codex-plugin.mjs") --source-dir (Join-Path $tempRoot "packages\\codex-adapter")
  if ($LASTEXITCODE -ne 0) {
    throw "Codex plugin install failed."
  }
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Codex GitHub marketplace plugin update completed. Restart Codex and start a new task to load the refreshed skills."
