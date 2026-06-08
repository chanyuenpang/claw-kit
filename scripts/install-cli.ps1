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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Assert-Command -Name "node"
Assert-Command -Name "npm"

Push-Location $repoRoot
try {
  Write-Host "Installing workspace dependencies..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
  }

  Write-Host "Building claw packages..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed."
  }

  Write-Host "Removing any previous global claw links..."
  npm unlink -g @veewo/claw | Out-Null
  npm unlink -g @claw-kit/cli | Out-Null

  Write-Host "Linking the claw CLI globally..."
  npm link --force .\packages\cli
  if ($LASTEXITCODE -ne 0) {
    throw "npm link --force .\\packages\\cli failed."
  }

  Write-Host ""
  Write-Host "claw CLI is installed."
  Write-Host "Run 'claw --help' to verify the command."
} finally {
  Pop-Location
}
