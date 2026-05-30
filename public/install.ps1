# gochi installer — Windows (PowerShell, Admin).
# Usage:  Open PowerShell as Administrator, then:
#         powershell -c "irm gochi.in/install.ps1 | iex"
#
# Bootstraps Chocolatey if missing, then installs git, make,
# arduino-cli, and bun. Idempotent — safe to re-run.
#
# After this, clone the gochi repo and install the ESP32 core yourself:
#   git clone https://github.com/devfolioco/gochi.git
#   cd gochi
#   arduino-cli --config-file firmware/arduino-cli.yaml core update-index
#   arduino-cli --config-file firmware/arduino-cli.yaml core install esp32:esp32

$ErrorActionPreference = "Stop"

function Say($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  v $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "x $m" -ForegroundColor Red; exit 1 }

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path","User")
}

# --- admin check ------------------------------------------------------

$current = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $current.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  Die "This installer needs an elevated PowerShell. Re-open PowerShell as Administrator and run it again."
}

Say "gochi installer - Windows"

# --- Chocolatey -------------------------------------------------------

if (-not (Have choco)) {
  Say "Installing Chocolatey..."
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol =
    [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
  Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
  Refresh-Path
}
if (-not (Have choco)) { Die "Chocolatey install failed. Restart PowerShell and re-run." }
Ok "choco: $(choco --version)"

# --- git --------------------------------------------------------------

if (-not (Have git)) {
  Say "Installing git..."
  choco install -y git
  Refresh-Path
}
Ok "git: $(git --version)"

# --- make -------------------------------------------------------------

if (-not (Have make)) {
  Say "Installing make..."
  choco install -y make
  Refresh-Path
}
Ok "make installed"

# --- arduino-cli ------------------------------------------------------

if (-not (Have arduino-cli)) {
  Say "Installing arduino-cli..."
  choco install -y arduino-cli
  Refresh-Path
}
Ok "arduino-cli installed"

# --- bun --------------------------------------------------------------

if (-not (Have bun)) {
  Say "Installing bun..."
  # Bun ships its own Windows installer; choco's package lags behind.
  Invoke-RestMethod bun.sh/install.ps1 | Invoke-Expression
  Refresh-Path
}
Ok "bun installed"

# --- done -------------------------------------------------------------

Write-Host ""
Say "Toolchain installed. Next steps:"
Write-Host "  1. Open a fresh PowerShell so PATH picks up new tools"
Write-Host "  2. git clone https://github.com/devfolioco/gochi.git"
Write-Host "  3. cd gochi"
Write-Host "  4. arduino-cli --config-file firmware/arduino-cli.yaml core update-index"
Write-Host "  5. arduino-cli --config-file firmware/arduino-cli.yaml core install esp32:esp32"
Write-Host "  6. Plug the ESP32-C3 into USB (red power LED lights up)"
Write-Host "  7. make test-led    # blue LED should blink - flashing works"
