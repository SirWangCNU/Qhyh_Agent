﻿﻿﻿﻿﻿﻿#Requires -Version 5.1
param(
    [int]$BackendPort = 0,
    [switch]$SkipBackend
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$projectDir = $PSScriptRoot
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

$pythonCmd = $null
foreach ($cmd in @("python", "py", "python3")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $pythonCmd = $cmd
        break
    }
}
if (-not $pythonCmd) {
    Write-Error "Python not found in PATH"
    exit 1
}
Write-Host "Python: $pythonCmd" -ForegroundColor Gray

Write-Host "`n[1/3] Check deps..." -ForegroundColor Yellow
$missing = @()
foreach ($module in @("fastapi", "uvicorn", "langgraph", "langchain_openai", "pydantic", "pydantic_settings", "httpx")) {
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

Write-Host "`n[2/3] Clear port $BackendPort..." -ForegroundColor Yellow
if (-not $SkipBackend) { Stop-ProcessByPort -Port $BackendPort }
Start-Sleep -Seconds 1

$backendProc = $null
if (-not $SkipBackend) {
    Write-Host "`n[3/3] Start FastAPI on port $BackendPort ..." -ForegroundColor Yellow
    $backendProc = Start-Process -FilePath $pythonCmd `
        -ArgumentList "-m uvicorn src.main:app --host 0.0.0.0 --port $BackendPort --reload" `
        -WorkingDirectory $projectDir -WindowStyle Normal -PassThru
    Start-Sleep -Seconds 3
}

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  OK!" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:$BackendPort/" -ForegroundColor Green
Write-Host "  API Docs: http://localhost:$BackendPort/docs" -ForegroundColor Green
Write-Host "  Health:   http://localhost:$BackendPort/api/health" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nPress any key to stop..." -ForegroundColor Gray

$null = [System.Console]::ReadKey($true)

Write-Host "`nStopping..." -ForegroundColor Yellow
if ($backendProc -and -not $backendProc.HasExited) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
}
if (-not $SkipBackend) { Stop-ProcessByPort -Port $BackendPort }
Write-Host "Done." -ForegroundColor Green
