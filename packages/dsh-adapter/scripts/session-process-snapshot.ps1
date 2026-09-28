# Read-only Windows DSH/claw process census. Never terminates a process.
param([string]$OutputPath, [string]$LeaseJson)
$ErrorActionPreference = 'Stop'
$all = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'")
$byPid = @{}
foreach ($p in $all) { $byPid[[int]$p.ProcessId] = $p }
$rows = @(
  foreach ($p in $all) {
    $cmd = [string]$p.CommandLine
    $isRunner = $cmd -like '*dsh-subprocess-local*runner.js*'
    $isSession = $cmd -match 'session open (?<workdir>.*?) (?<sid>[^\s]+) --host dsh'
    $kind = if ($isRunner -and $isSession) { 'runner' } elseif ($isSession -and $cmd -like '*claw*bin.js*') { 'claw' } elseif ($cmd -like '*session-daemon-entry.js*') { 'daemon' } else { $null }
    if (-not $kind) { continue }
    $workdir = if ($isSession) { $Matches['workdir'].Trim('"') } else { $null }
    $sessionId = if ($isSession) { $Matches['sid'].Trim('"') } else { $null }
    [pscustomobject]@{
      kind = $kind; pid = [int]$p.ProcessId; parentPid = [int]$p.ParentProcessId
      parentAlive = $byPid.ContainsKey([int]$p.ParentProcessId)
      startedAt = [string]$p.CreationDate
      workingSetMiB = [math]::Round($p.WorkingSetSize / 1MB, 1)
      workdir = $workdir; sessionId = $sessionId
    }
  }
)
$runnerPids = @($rows | Where-Object kind -eq runner | ForEach-Object pid)
$clawPids = @($rows | Where-Object kind -eq claw | ForEach-Object pid)
$runnerRows = @($rows | Where-Object kind -eq runner)
$clawRows = @($rows | Where-Object kind -eq claw)
$paired = @($clawRows | Where-Object { $runnerPids -contains $_.parentPid })
$summary = [pscustomobject]@{
  node = $all.Count; runner = $runnerRows.Count; claw = $clawRows.Count
  paired = $paired.Count; daemon = @($rows | Where-Object kind -eq daemon).Count
  runnerWorkingSetMiB = [math]::Round(($runnerRows | Measure-Object workingSetMiB -Sum).Sum, 1)
  clawWorkingSetMiB = [math]::Round(($clawRows | Measure-Object workingSetMiB -Sum).Sum, 1)
  unmatchedRunnerPids = @($runnerRows | Where-Object { $p = $_.pid; -not @($clawRows | Where-Object parentPid -eq $p).Count } | ForEach-Object pid)
  unmatchedClawPids = @($clawRows | Where-Object { $runnerPids -notcontains $_.parentPid } | ForEach-Object pid)
}
$leases = $null
if ($LeaseJson) {
  # Optional loopback RPC snapshot saved separately; absence is not evidence of a leak.
  $leases = Get-Content -Raw -LiteralPath $LeaseJson | ConvertFrom-Json
}
$result = [pscustomobject]@{
  sampledAt = (Get-Date).ToString('o'); summary = $summary
  byWorkdir = @($clawRows | Group-Object workdir | ForEach-Object { [pscustomobject]@{ workdir = $_.Name; count = $_.Count } })
  rows = $rows; leases = $leases
}
$json = ConvertTo-Json -Depth 8 -InputObject $result
if ($OutputPath) { Set-Content -LiteralPath $OutputPath -Value $json -Encoding utf8 }
else { $json }
