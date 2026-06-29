#Requires -Version 5.1
param(
    [int]$BackendPort = 0,
    [int]$FrontendPort = 0,
    [switch]$SkipBackend,
    [switch]$SkipFrontend
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$repoRoot = $PSScriptRoot
$projectDir = Join-Path $repoRoot "qinghe-video"
if (-not (Test-Path $projectDir)) {
    Write-Error "Project directory not found: $projectDir"
    exit 1
}
Set-Location -Path $projectDir

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  QingHe Video MVP" -ForegroundColor Cyan
Write-Host "  Dir: $projectDir" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

function Get-EnvValue {
    param([string]$Key, [string]$DefaultValue)
    $envPath = Join-Path $projectDir ".env"
    if (Test-Path $envPath) {
        $line = Get-Content $envPath -Encoding UTF8 | Where-Object { $_ -match "^$Key\s*=" }
        if ($line) { return ($line -split "=", 2)[1].Trim() }
    }
    return $DefaultValue
}

function Stop-ProcessByPort {
    param([int]$Port)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    } catch {
        return
    }
    if (-not $conns) { return }

    $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -ne "Idle") {
                Write-Host "  Kill port $Port : $($proc.ProcessName) (PID $procId)" -ForegroundColor Yellow
                # kill the listener and its child tree (uvicorn workers / node dev server)
                Stop-Process -Id $procId -Force -ErrorAction Stop
                Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                    Where-Object { $_.ParentProcessId -eq $procId } |
                    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            }
        } catch {
            # ignore unavailable or protected processes
        }
    }
}

function Wait-PortListening {
    param([int]$Port, [int]$TimeoutSec = 45)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

if ($BackendPort -eq 0) {
    $BackendPort = [int](Get-EnvValue -Key "APP_PORT" -DefaultValue "18739")
}
if ($FrontendPort -eq 0) {
    $FrontendPort = 5173
}

$frontendDir = Join-Path $projectDir "frontend"
$viteJs = Join-Path $frontendDir "node_modules\vite\bin\vite.js"

# ---------- find Python ----------
$pythonCmd = $null
foreach ($cmd in @("python", "py", "python3")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $pythonCmd = $cmd
        break
    }
}
if (-not $SkipBackend -and -not $pythonCmd) {
    Write-Error "Python not found in PATH"
    exit 1
}
if ($pythonCmd) { Write-Host "Python: $pythonCmd" -ForegroundColor Gray }

# ---------- find Node / npm ----------
$nodeCmd = $null
if (Get-Command "node" -ErrorAction SilentlyContinue) { $nodeCmd = "node" }

$npmCmd = $null
$npmResolved = Get-Command npm -ErrorAction SilentlyContinue
if ($npmResolved -and $npmResolved.Source) {
    $npmCmd = $npmResolved.Source
} elseif ($nodeCmd) {
    $nodeDir = Split-Path -Parent (Get-Command $nodeCmd).Source
    $npmExe = Join-Path $nodeDir "npm.cmd"
    if (Test-Path $npmExe) { $npmCmd = $npmExe }
}
if (-not $SkipFrontend -and -not $nodeCmd) {
    Write-Error "node not found in PATH. Please install Node.js or use -SkipFrontend"
    exit 1
}
if (-not $SkipFrontend -and -not $npmCmd) {
    Write-Error "npm not found in PATH. Please install Node.js or use -SkipFrontend"
    exit 1
}
if ($nodeCmd) { Write-Host "Node:   $nodeCmd" -ForegroundColor Gray }
if ($npmCmd)  { Write-Host "npm:    $npmCmd" -ForegroundColor Gray }

# ---------- check Python deps ----------
if (-not $SkipBackend) {
    Write-Host "`n[1/4] Check Python deps..." -ForegroundColor Yellow
    $missing = @()
    foreach ($module in @("fastapi", "uvicorn", "langgraph", "langchain_openai", "pydantic", "pydantic_settings", "httpx", "edge_tts", "moviepy", "PIL")) {
        & $pythonCmd -c "import $module" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $missing += $module }
    }
    if ($missing.Count -gt 0) {
        Write-Host "Missing: $($missing -join ', ')" -ForegroundColor Red
        Write-Host "pip install -e ." -ForegroundColor Yellow
        & $pythonCmd -m pip install -e .
        if ($LASTEXITCODE -ne 0) {
            Write-Error "pip install failed"
            exit 1
        }
    } else {
        Write-Host "  OK" -ForegroundColor Green
    }
}

# ---------- check frontend deps ----------
if (-not $SkipFrontend) {
    Write-Host "`n[2/4] Check frontend deps..." -ForegroundColor Yellow
    if (-not (Test-Path $viteJs)) {
        Write-Host "  Running npm install..." -ForegroundColor Yellow
        $installProc = Start-Process -FilePath $npmCmd -ArgumentList "install" `
            -WorkingDirectory $frontendDir -WindowStyle Normal -PassThru -Wait
        if ($installProc.ExitCode -ne 0) {
            Write-Error "npm install failed"
            exit 1
        }
    } else {
        Write-Host "  OK" -ForegroundColor Green
    }
}

# ---------- clear ports ----------
Write-Host "`n[3/4] Clear ports..." -ForegroundColor Yellow
if (-not $SkipBackend)  { Stop-ProcessByPort -Port $BackendPort }
if (-not $SkipFrontend) { Stop-ProcessByPort -Port $FrontendPort }
Start-Sleep -Seconds 1

# ---------- start backend ----------
$backendProc = $null
if (-not $SkipBackend) {
    Write-Host "`n[4/4] Start FastAPI on port $BackendPort ..." -ForegroundColor Yellow
    $backendProc = Start-Process -FilePath $pythonCmd `
        -ArgumentList "-m uvicorn src.main:app --host 0.0.0.0 --port $BackendPort --reload" `
        -WorkingDirectory $projectDir -WindowStyle Normal -PassThru
}

# ---------- start frontend ----------
# Launch vite directly via node (avoids cmd.exe / npm.cmd indirection that can fail
# silently in some environments). Equivalent to `npm run dev`.
$frontendProc = $null
if (-not $SkipFrontend) {
    Write-Host "       Start Vite dev server on port $FrontendPort ..." -ForegroundColor Yellow
    $frontendProc = Start-Process -FilePath $nodeCmd `
        -ArgumentList "node_modules\vite\bin\vite.js","--port","$FrontendPort" `
        -WorkingDirectory $frontendDir -WindowStyle Normal -PassThru
}

# ---------- wait for services to come up ----------
Write-Host "`nWaiting for services..." -ForegroundColor Gray
$backendOk = $true
$frontendOk = $true
if (-not $SkipBackend) {
    $backendOk = Wait-PortListening -Port $BackendPort -TimeoutSec 45
    if ($backendOk) {
        Write-Host "  Backend  :$BackendPort ready" -ForegroundColor Green
    } else {
        Write-Host "  Backend  :$BackendPort NOT ready (see backend window)" -ForegroundColor Red
    }
}
if (-not $SkipFrontend) {
    $frontendOk = Wait-PortListening -Port $FrontendPort -TimeoutSec 45
    if ($frontendOk) {
        Write-Host "  Frontend :$FrontendPort ready" -ForegroundColor Green
    } else {
        Write-Host "  Frontend :$FrontendPort NOT ready (see frontend window)" -ForegroundColor Red
    }
}

# ---------- print addresses ----------
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  OK!" -ForegroundColor Green
if (-not $SkipFrontend -and $frontendOk) {
    Write-Host "  Frontend: http://localhost:$FrontendPort/" -ForegroundColor Green
}
if (-not $SkipBackend -and $backendOk) {
    Write-Host "  API:      http://localhost:$BackendPort/" -ForegroundColor Green
    Write-Host "  API Docs: http://localhost:$BackendPort/docs" -ForegroundColor Green
    Write-Host "  Health:   http://localhost:$BackendPort/api/health" -ForegroundColor Green
}
if ((-not $frontendOk) -or (-not $backendOk)) {
    Write-Host "  Some services failed. Check the spawned windows for errors." -ForegroundColor Red
}
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nPress any key to stop..." -ForegroundColor Gray

$null = [System.Console]::ReadKey($true)

# ---------- stop ----------
Write-Host "`nStopping..." -ForegroundColor Yellow
# Kill by port first — reliably gets the actual listener (node / uvicorn worker)
# even when the spawned parent window has already reparented children.
if (-not $SkipBackend)  { Stop-ProcessByPort -Port $BackendPort }
if (-not $SkipFrontend) { Stop-ProcessByPort -Port $FrontendPort }
# Fallback: kill the spawned parent processes.
if ($backendProc -and -not $backendProc.HasExited) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
}
if ($frontendProc -and -not $frontendProc.HasExited) {
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
}
Write-Host "Done." -ForegroundColor Green
