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
                Stop-Process -Id $procId -Force -ErrorAction Stop
            }
        } catch {
            # ignore unavailable or protected processes
        }
    }
}

if ($BackendPort -eq 0) {
    $BackendPort = [int](Get-EnvValue -Key "APP_PORT" -DefaultValue "18739")
}
if ($FrontendPort -eq 0) {
    $FrontendPort = 5173
}

$frontendDir = Join-Path $projectDir "frontend"

# ---------- 找 Python ----------
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

# ---------- 找 Node / npm ----------
$nodeCmd = $null
if (Get-Command "node" -ErrorAction SilentlyContinue) { $nodeCmd = "node" }

$npmCmd = $null
if (Get-Command "npm" -ErrorAction SilentlyContinue) {
    $npmCmd = "npm"
} elseif ($nodeCmd) {
    # npm.cmd 通常和 node.exe 在同一目录
    $nodeDir = Split-Path -Parent (Get-Command $nodeCmd).Source
    $npmExe = Join-Path $nodeDir "npm.cmd"
    if (Test-Path $npmExe) { $npmCmd = $npmExe }
}
if (-not $SkipFrontend -and -not $npmCmd) {
    Write-Error "npm not found in PATH. Please install Node.js or use -SkipFrontend"
    exit 1
}
if ($nodeCmd) { Write-Host "Node:   $nodeCmd" -ForegroundColor Gray }
if ($npmCmd) { Write-Host "npm:    $npmCmd" -ForegroundColor Gray }

# ---------- 检查 Python 依赖 ----------
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

# ---------- 检查前端依赖 ----------
if (-not $SkipFrontend) {
    Write-Host "`n[2/4] Check frontend deps..." -ForegroundColor Yellow
    $nodeModules = Join-Path $frontendDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
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

# ---------- 清端口 ----------
Write-Host "`n[3/4] Clear ports..." -ForegroundColor Yellow
if (-not $SkipBackend) { Stop-ProcessByPort -Port $BackendPort }
if (-not $SkipFrontend) { Stop-ProcessByPort -Port $FrontendPort }
Start-Sleep -Seconds 1

# ---------- 启动后端 ----------
$backendProc = $null
if (-not $SkipBackend) {
    Write-Host "`n[4/4] Start FastAPI on port $BackendPort ..." -ForegroundColor Yellow
    $backendProc = Start-Process -FilePath $pythonCmd -ArgumentList "-m uvicorn src.main:app --host 0.0.0.0 --port $BackendPort --reload" -WorkingDirectory $projectDir -WindowStyle Normal -PassThru
    Start-Sleep -Seconds 3
}

# ---------- 启动前端 ----------
$frontendProc = $null
if (-not $SkipFrontend) {
    Write-Host "`n       Start Vite dev server on port $FrontendPort ..." -ForegroundColor Yellow
    # npm 在 Windows 上是 cmd 脚本，用 cmd /c 调用更稳定
    $frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -- --port $FrontendPort" -WorkingDirectory $frontendDir -WindowStyle Normal -PassThru
    Start-Sleep -Seconds 3
}

# ---------- 打印地址 ----------
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  OK!" -ForegroundColor Green
if (-not $SkipFrontend) {
    Write-Host "  Frontend: http://localhost:$FrontendPort/" -ForegroundColor Green
}
if (-not $SkipBackend) {
    Write-Host "  API:      http://localhost:$BackendPort/" -ForegroundColor Green
    Write-Host "  API Docs: http://localhost:$BackendPort/docs" -ForegroundColor Green
    Write-Host "  Health:   http://localhost:$BackendPort/api/health" -ForegroundColor Green
}
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nPress any key to stop..." -ForegroundColor Gray

$null = [System.Console]::ReadKey($true)

# ---------- 停止 ----------
Write-Host "`nStopping..." -ForegroundColor Yellow
if ($backendProc -and -not $backendProc.HasExited) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
}
if ($frontendProc -and -not $frontendProc.HasExited) {
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
}
if (-not $SkipBackend) { Stop-ProcessByPort -Port $BackendPort }
if (-not $SkipFrontend) { Stop-ProcessByPort -Port $FrontendPort }
Write-Host "Done." -ForegroundColor Green
