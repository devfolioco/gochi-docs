# gochi installer — Windows (PowerShell, winget).
# Usage:  powershell -c "iex (iwr https://gochi.in/install.ps1).Content"
#
# Installs the toolchain via winget: git, make, arduino-cli, bun.
# No Administrator needed for most installs — a UAC prompt may pop up
# for GnuWin32.Make. Idempotent — safe to re-run.
#
# After this, clone the gochi repo and install the ESP32 core yourself:
#   git clone https://github.com/devfolioco/gochi.git
#   cd gochi
#   arduino-cli --config-file firmware/arduino-cli.yaml core update-index
#   arduino-cli --config-file firmware/arduino-cli.yaml core install esp32:esp32

$ErrorActionPreference = "Stop"

# TLS 1.2 for any WebClient downloads (e.g. the bun fallback).
[System.Net.ServicePointManager]::SecurityProtocol =
  [System.Net.ServicePointManager]::SecurityProtocol -bor 3072

function Say($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  v $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "x $m" -ForegroundColor Red; exit 1 }

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path","User")
}

function Winget-Install($id) {
  # --scope user keeps it out of Program Files when the package supports
  # it; falls back gracefully when it doesn't. Accept agreements so the
  # script doesn't stall on prompts.
  winget install --exact --id $id `
    --silent `
    --accept-source-agreements `
    --accept-package-agreements `
    --scope user 2>$null
  if ($LASTEXITCODE -ne 0) {
    # Retry without --scope user — some packages (e.g. GnuWin32.Make)
    # are machine-scope only.
    winget install --exact --id $id `
      --silent `
      --accept-source-agreements `
      --accept-package-agreements
  }
}

Say "gochi installer - Windows"

# --- winget itself ----------------------------------------------------

if (-not (Have winget)) {
  Die @"
winget not found. Install 'App Installer' from the Microsoft Store, then
re-run this script. (winget ships with Windows 10 1809+ and Windows 11.)
"@
}
Ok "winget: $(winget --version)"

# --- git --------------------------------------------------------------

if (-not (Have git)) {
  Say "Installing git..."
  Winget-Install "Git.Git"
  Refresh-Path
}
Ok "git: $(git --version)"

# --- make -------------------------------------------------------------

if (-not (Have make)) {
  Say "Installing make (a UAC prompt may appear)..."
  Winget-Install "GnuWin32.Make"
  Refresh-Path
}
Ok "make installed"

# --- arduino-cli ------------------------------------------------------

if (-not (Have arduino-cli)) {
  Say "Installing arduino-cli..."
  Winget-Install "ArduinoSA.CLI"
  Refresh-Path
}
Ok "arduino-cli installed"

# --- bun --------------------------------------------------------------

if (-not (Have bun)) {
  Say "Installing bun..."
  # Prefer winget; fall back to bun's own installer if the package
  # isn't on this user's source.
  try {
    Winget-Install "Oven-sh.Bun"
  } catch {
    Warn "winget install of bun failed — falling back to bun.sh installer"
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://bun.sh/install.ps1'))
  }
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
