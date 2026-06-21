#Requires -Version 5.1
<#
.SYNOPSIS
    青禾映画 MVP 一键启动脚本（PowerShell）
.DESCRIPTION
    自动停止占用目标端口的旧进程，并启动后端 FastAPI 和前端 Streamlit。
.PARAMETER FrontendPort
    Streamlit 前端端口，默认读取 .env 中的 STREAMLIT_PORT 或 18510
.PARAMETER BackendPort
    FastAPI 后端端口，默认读取 .env 中的 APP_PORT 或 18739
.PARAMETER SkipBackend
    跳过启动后端
.PARAMETER SkipFrontend
    跳过启动前端
.EXAMPLE
    .\start.ps1
    .\start.ps1 -BackendPort 18739 -FrontendPort 18510
#>
param(
    [int]$FrontendPort = 0,
    [int]$BackendPort = 0,
    [switch]$SkipBackend,
    [switch]$SkipFrontend
)

# 设置默认编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 切换到脚本所在目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $scriptDir

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  青禾映画 MVP 启动脚本" -ForegroundColor Cyan
Write-Host "  目录: $scriptDir" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ---------- 辅助函数 ----------
function Get-EnvValue {
    param([string]$Key, [string]$DefaultValue)
    $envPath = Join-Path $scriptDir ".env"
    if (Test-Path $envPath) {
        $line = Get-Content $envPath | Where-Object { $_ -match "^$Key\s*=" }
        if ($line) {
            return ($line -split "=", 2)[1].Trim()
        }
    }
    return $DefaultValue
}

function Test-CommandAvailable {
    param([string]$Command)
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-PythonExecutable {
    foreach ($cmd in @("python", "py", "python3")) {
        if (Test-CommandAvailable $cmd) { return $cmd }
    }
    return $null
}

function Stop-ProcessByPort {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pid in $pids) {
            try {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "  正在停止占用端口 $Port 的进程: $($proc.ProcessName) (PID $pid)" -ForegroundColor Yellow
                    Stop-Process -Id $pid -Force -ErrorAction Stop
                }
            }
            catch {
                Write-Warning "无法结束占用端口 $Port 的进程 PID $pid`: $_"
            }
        }
    }
}

# ---------- 解析端口 ----------
if ($BackendPort -eq 0) {
    $BackendPort = [int](Get-EnvValue -Key "APP_PORT" -DefaultValue "18739")
}
if ($FrontendPort -eq 0) {
    $FrontendPort = [int](Get-EnvValue -Key "STREAMLIT_PORT" -DefaultValue "18510")
}

$pythonCmd = Get-PythonExecutable
if (-not $pythonCmd) {
    Write-Error "未找到 Python 解释器，请确保已安装 Python 并加入 PATH"
    exit 1
}
Write-Host "使用 Python: $pythonCmd" -ForegroundColor Gray

# ---------- 依赖检查与安装 ----------
Write-Host "`n[1/5] 检查项目依赖..." -ForegroundColor Yellow
$missingDeps = @()
foreach ($module in @("fastapi", "uvicorn", "streamlit", "langgraph", "langchain_openai", "pydantic", "pydantic_settings")) {
    & $pythonCmd -c "import $module" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $missingDeps += $module }
}

if ($missingDeps.Count -gt 0) {
    Write-Host "检测到缺少依赖: $($missingDeps -join ', ')" -ForegroundColor Red
    Write-Host "正在执行 pip install -e . ..." -ForegroundColor Yellow
    & $pythonCmd -m pip install -e .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "依赖安装失败，请检查网络或 pip 配置"
        exit 1
    }
}
else {
    Write-Host "依赖检查通过" -ForegroundColor Green
}

# ---------- 停止占用目标端口的旧进程 ----------
Write-Host "`n[2/5] 停止占用目标端口的旧进程..." -ForegroundColor Yellow
if (-not $SkipBackend) { Stop-ProcessByPort -Port $BackendPort }
if (-not $SkipFrontend) { Stop-ProcessByPort -Port $FrontendPort }
Start-Sleep -Seconds 2

# ---------- 启动后端 ----------
$backendProc = $null
if (-not $SkipBackend) {
    Write-Host "`n[3/5] 启动后端 FastAPI (端口 $BackendPort)..." -ForegroundColor Yellow
    $backendArgs = "-m uvicorn src.main:app --host 0.0.0.0 --port $BackendPort --reload"
    $backendProc = Start-Process -FilePath $pythonCmd -ArgumentList $backendArgs `
        -WorkingDirectory $scriptDir -WindowStyle Normal -PassThru
    Start-Sleep -Seconds 3
}

# ---------- 启动前端 ----------
$frontendProc = $null
if (-not $SkipFrontend) {
    Write-Host "`n[4/5] 启动前端 Streamlit (端口 $FrontendPort)..." -ForegroundColor Yellow
    $frontendArgs = "-m streamlit run frontend/app.py --server.port $FrontendPort --server.headless true"
    $frontendProc = Start-Process -FilePath $pythonCmd -ArgumentList $frontendArgs `
        -WorkingDirectory $scriptDir -WindowStyle Normal -PassThru
    Start-Sleep -Seconds 5
}

# ---------- 输出访问地址 ----------
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  青禾映画服务已启动" -ForegroundColor Green
if (-not $SkipBackend) {
    Write-Host "  后端 API:    http://localhost:$BackendPort/docs" -ForegroundColor Green
    Write-Host "  健康检查:    http://localhost:$BackendPort/api/health" -ForegroundColor Green
}
if (-not $SkipFrontend) {
    Write-Host "  前端页面:    http://localhost:$FrontendPort" -ForegroundColor Green
}
Write-Host "============================================" -ForegroundColor Green
Write-Host "`n按任意键停止服务..." -ForegroundColor Gray

# ---------- 等待停止 ----------
$null = [System.Console]::ReadKey($true)

Write-Host "`n[5/5] 正在停止服务..." -ForegroundColor Yellow
if ($backendProc -and -not $backendProc.HasExited) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
}
if ($frontendProc -and -not $frontendProc.HasExited) {
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
}

# 额外清理可能残留的端口进程
if (-not $SkipBackend) { Stop-ProcessByPort -Port $BackendPort }
if (-not $SkipFrontend) { Stop-ProcessByPort -Port $FrontendPort }

Write-Host "服务已停止" -ForegroundColor Green
