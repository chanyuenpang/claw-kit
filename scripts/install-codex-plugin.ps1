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

Write-Host "Cloning the published claw-kit GitHub marketplace..."
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("claw-kit-marketplace-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  git clone --depth 1 --branch main https://github.com/chanyuenpang/claw-kit.git $tempRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to clone the published claw-kit GitHub marketplace."
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
