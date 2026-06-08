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
Assert-Command -Name "npm"

Write-Host "Removing any previous global claw installs or links..."
npm uninstall -g @veewo/claw | Out-Null
npm unlink -g @veewo/claw | Out-Null
npm unlink -g @claw-kit/cli | Out-Null

Write-Host "Installing claw CLI from npm..."
npm install -g @veewo/claw
if ($LASTEXITCODE -ne 0) {
  throw "npm install -g @veewo/claw failed."
}

Write-Host ""
Write-Host "claw CLI is installed."
Write-Host "Run 'claw --help' to verify the command."
