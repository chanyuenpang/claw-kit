# claw-kit OpenCode plugin installer
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\install-opencode-plugin.ps1

$ErrorActionPreference = "Stop"

Write-Host "Installing claw-kit OpenCode plugin..." -ForegroundColor Cyan

# Build core and CLI first
Push-Location $PSScriptRoot\..
npm run build -w @veewo/claw-core
npm run build -w @veewo/claw
Pop-Location

# Install the plugin
node "$PSScriptRoot\install-opencode-plugin.mjs"

if ($LASTEXITCODE -eq 0) {
    Write-Host "claw-kit OpenCode plugin installed successfully." -ForegroundColor Green
    Write-Host "Restart OpenCode for the plugin to take effect." -ForegroundColor Yellow
} else {
    Write-Host "Failed to install claw-kit OpenCode plugin." -ForegroundColor Red
    exit 1
}