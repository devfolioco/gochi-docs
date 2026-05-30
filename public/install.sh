#!/usr/bin/env bash
# gochi installer — macOS and Linux.
# Usage:  curl -fsSL https://gochi.in/install.sh | bash
#
# Installs the toolchain only: make, git, curl, arduino-cli, bun
# (and Homebrew on macOS if it's missing). Idempotent — safe to re-run.
#
# After this, clone the gochi repo and install the ESP32 core yourself:
#   git clone https://github.com/devfolioco/gochi.git
#   cd gochi
#   arduino-cli --config-file firmware/arduino-cli.yaml core update-index
#   arduino-cli --config-file firmware/arduino-cli.yaml core install esp32:esp32

set -euo pipefail

B="\033[1m"; G="\033[32m"; Y="\033[33m"; R="\033[31m"; N="\033[0m"
say()  { printf "${B}==>${N} %s\n" "$*"; }
ok()   { printf "  ${G}✓${N} %s\n" "$*"; }
warn() { printf "  ${Y}!${N} %s\n" "$*"; }
die()  { printf "${R}✗ %s${N}\n" "$*" >&2; exit 1; }

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM=macOS ;;
  Linux)  PLATFORM=Linux ;;
  *) die "Unsupported OS: $OS. On Windows, use https://gochi.in/install.ps1" ;;
esac

say "gochi installer — $PLATFORM"

# --- make -------------------------------------------------------------

if command -v make >/dev/null 2>&1; then
  ok "make: $(make --version | head -n1)"
else
  if [ "$PLATFORM" = macOS ]; then
    say "Installing Xcode Command Line Tools (provides make)…"
    if ! xcode-select -p >/dev/null 2>&1; then
      xcode-select --install || true
      warn "Accept the install dialog, then re-run this script."
      exit 1
    fi
  else
    say "Installing build-essential (provides make)…"
    sudo apt-get update
    sudo apt-get install -y build-essential
  fi
  ok "make installed"
fi

# --- Homebrew (macOS only) -------------------------------------------

if [ "$PLATFORM" = macOS ]; then
  if command -v brew >/dev/null 2>&1; then
    ok "brew: $(brew --version | head -n1)"
  else
    say "Installing Homebrew…"
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # brew puts itself in different places on Intel vs Apple Silicon — pick whichever exists
    if [ -x /opt/homebrew/bin/brew ];   then eval "$(/opt/homebrew/bin/brew shellenv)";   fi
    if [ -x /usr/local/bin/brew ];      then eval "$(/usr/local/bin/brew shellenv)";      fi
    ok "Homebrew installed"
  fi
fi

# --- curl -------------------------------------------------------------

if ! command -v curl >/dev/null 2>&1; then
  if [ "$PLATFORM" = Linux ]; then
    say "Installing curl…"
    sudo apt-get install -y curl
  else
    die "curl is required."
  fi
fi

# --- git --------------------------------------------------------------

if command -v git >/dev/null 2>&1; then
  ok "git: $(git --version)"
else
  say "Installing git…"
  if [ "$PLATFORM" = macOS ]; then brew install git; else sudo apt-get install -y git; fi
  ok "git installed"
fi

# --- arduino-cli ------------------------------------------------------

if command -v arduino-cli >/dev/null 2>&1; then
  ok "arduino-cli: $(arduino-cli version 2>/dev/null | head -n1)"
else
  say "Installing arduino-cli…"
  if [ "$PLATFORM" = macOS ]; then
    brew install arduino-cli
  else
    TMPDIR="$(mktemp -d)"
    ( cd "$TMPDIR" && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh )
    sudo mv "$TMPDIR/bin/arduino-cli" /usr/local/bin/
    rm -rf "$TMPDIR"
  fi
  ok "arduino-cli installed"
fi

# --- bun --------------------------------------------------------------

if command -v bun >/dev/null 2>&1; then
  ok "bun: $(bun --version)"
else
  say "Installing bun…"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  ok "bun installed"
  warn "Add \$HOME/.bun/bin to your shell's PATH (the installer printed the line to add)."
fi

# --- done -------------------------------------------------------------

printf "\n"
say "Toolchain installed. Next steps:"
printf "  1. git clone https://github.com/devfolioco/gochi.git\n"
printf "  2. cd gochi\n"
printf "  3. arduino-cli --config-file firmware/arduino-cli.yaml core update-index\n"
printf "  4. arduino-cli --config-file firmware/arduino-cli.yaml core install esp32:esp32\n"
printf "  5. Plug the ESP32-C3 into USB (red power LED lights up)\n"
printf "  6. make test-led    # blue LED should blink — flashing works\n"
