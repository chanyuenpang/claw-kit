# claw-kit OpenCode plugin installer
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\install-opencode-plugin.ps1

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

Write-Host "Installing claw-kit OpenCode plugin..." -ForegroundColor Cyan

# Build core and CLI first
Push-Location $PSScriptRoot\..
npm run build -w @veewo/claw-core
npm run build -w @veewo/claw
Pop-Location

# Reinstall the global claw CLI binary so plugin↔CLI contract changes take effect
# (the global claw.cmd is a COPY, not a symlink — building alone doesn't update it)
Write-Host "Reinstalling global claw CLI..." -ForegroundColor Cyan
Push-Location $PSScriptRoot\..\packages\cli
npm install -g .
Pop-Location

# Install the plugin
$repoRoot = Split-Path -Parent $PSScriptRoot
node (Join-Path $PSScriptRoot "install-opencode-plugin.mjs") --source-dir (Join-Path $repoRoot "packages\opencode-adapter")

if ($LASTEXITCODE -eq 0) {
    Write-Host "claw-kit OpenCode plugin installed successfully." -ForegroundColor Green
    Write-Host "Restart OpenCode for the plugin to take effect." -ForegroundColor Yellow
} else {
    Write-Host "Failed to install claw-kit OpenCode plugin." -ForegroundColor Red
    exit 1
}