#!/usr/bin/env bash
# ==============================================================================
# OpenMausBot macOS launchd Service Installation Script
# ==============================================================================
# This script installs OpenMausBot as a macOS launchd service (LaunchAgent for
# user sessions, or LaunchDaemon for system-wide background operation).
#
# Features:
# - Automatic start on user login / system boot
# - Automatic restart on process crash
# - Standard logging to ~/Library/Logs/OpenMausBot/ (or /Library/Logs/OpenMausBot/)
# - Configurable environment variables (OMB_HOST, OMB_PORT, OMB_AUTH_TOKEN, OMB_CORS_ORIGIN)
# - Preserves user environment and agent CLI access (claude, codex, grok, etc.)
#
# Prerequisites:
# - macOS 12 Monterey, 13 Ventura, 14 Sonoma, 15 Sequoia (Apple Silicon or Intel)
# - Node.js 24+ installed (Homebrew, official pkg, or node manager)
# - OpenMausBot repository or installed application
#
# Usage:
#   ./install-service.sh [OPTIONS]                # Install as user LaunchAgent (Recommended)
#   sudo ./install-service.sh --daemon [OPTIONS]   # Install as system LaunchDaemon
#
# Examples:
#   # Install user LaunchAgent with default settings (port 8799, bind 0.0.0.0)
#   ./install-service.sh
#
#   # Install with secure authentication token
#   ./install-service.sh --auth-token "your-secret-token"
#
#   # Install with custom port and localhost only
#   ./install-service.sh -p 9000 -H 127.0.0.1
#
#   # Install system LaunchDaemon with custom service label
#   sudo ./install-service.sh --daemon -s com.openmausbot.custom
# ==============================================================================

set -euo pipefail

# ANSI color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Default configuration values
SERVICE_LABEL="com.openmausbot.server"
PORT="${OMB_PORT:-8799}"
HOST="${OMB_HOST:-0.0.0.0}"
AUTH_TOKEN="${OMB_AUTH_TOKEN:-}"
CORS_ORIGIN="${OMB_CORS_ORIGIN:-*}"
INSTALL_DIR="${OMB_INSTALL_DIR:-}"
NODE_BIN=""
IS_DAEMON=false
NON_INTERACTIVE=false

# Helper functions for formatted output
info() {
    echo -e "${CYAN}==>${NC} ${BOLD}$*${NC}"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

warn() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $*"
}

error() {
    echo -e "${RED}❌ ERROR:${NC} $*" >&2
}

show_help() {
    cat << 'EOF'
OpenMausBot macOS launchd Service Installation

Usage:
  ./install-service.sh [OPTIONS]                # User LaunchAgent (Recommended)
  sudo ./install-service.sh --daemon [OPTIONS]   # System LaunchDaemon

Options:
  -s, --service-name <label> Service label (default: com.openmausbot.server)
  -p, --port <port>          Server port (default: 8799, env: OMB_PORT)
  -H, --host <host>          Bind address (default: 0.0.0.0, env: OMB_HOST)
  -t, --auth-token <token>   Bearer token for API access (required for LAN, env: OMB_AUTH_TOKEN)
  -c, --cors-origin <origin> Allowed CORS origin (default: *, env: OMB_CORS_ORIGIN)
  -d, --install-dir <path>   OpenMausBot installation directory (auto-detected)
      --node-bin <path>      Path to Node.js executable (auto-detected)
      --daemon               Install as system LaunchDaemon (/Library/LaunchDaemons)
  -y, --non-interactive      Do not pause for security warnings or confirmations
  -h, --help                 Show this help message and exit

Security Note:
  When binding to 0.0.0.0, always configure an authentication token!
  Generate a secure token:
    openssl rand -hex 32

EOF
    exit 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--service-name)
            SERVICE_LABEL="$2"
            shift 2
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -H|--host)
            HOST="$2"
            shift 2
            ;;
        -t|--auth-token)
            AUTH_TOKEN="$2"
            shift 2
            ;;
        -c|--cors-origin)
            CORS_ORIGIN="$2"
            shift 2
            ;;
        -d|--install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --node-bin)
            NODE_BIN="$2"
            shift 2
            ;;
        --daemon)
            IS_DAEMON=true
            shift
            ;;
        -y|--non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            error "Unknown option: $1"
            echo "Run '$0 --help' for usage."
            exit 1
            ;;
    esac
done

info "Starting OpenMausBot macOS launchd service installation..."

# Determine installation scope and target directories
CURRENT_UID="$(id -u)"
CURRENT_USER="$(id -un)"

if [ "$IS_DAEMON" = true ]; then
    if [ "$CURRENT_UID" -ne 0 ]; then
        error "System LaunchDaemon installation requires root privileges. Please run with sudo."
        exit 1
    fi
    TARGET_USER="${SUDO_USER:-root}"
    USER_HOME="$(eval echo "~$TARGET_USER")"
    PLIST_DIR="/Library/LaunchDaemons"
    LOG_DIR="/Library/Logs/OpenMausBot"
    info "Installing system LaunchDaemon at $PLIST_DIR (User: $TARGET_USER)"
else
    if [ "$CURRENT_UID" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
        TARGET_USER="$SUDO_USER"
        USER_HOME="$(eval echo "~$TARGET_USER")"
        PLIST_DIR="$USER_HOME/Library/LaunchAgents"
        LOG_DIR="$USER_HOME/Library/Logs/OpenMausBot"
        info "Installing user LaunchAgent for user: $TARGET_USER"
    else
        TARGET_USER="$CURRENT_USER"
        USER_HOME="$HOME"
        PLIST_DIR="$USER_HOME/Library/LaunchAgents"
        LOG_DIR="$USER_HOME/Library/Logs/OpenMausBot"
        info "Installing user LaunchAgent in $PLIST_DIR"
    fi
fi

# Locate Node.js executable on macOS
if [ -z "$NODE_BIN" ]; then
    CANDIDATE_PATHS=(
        "$(command -v node 2>/dev/null || true)"
        "/opt/homebrew/bin/node"
        "/usr/local/bin/node"
        "/opt/homebrew/opt/node/bin/node"
        "/usr/local/opt/node/bin/node"
        "$USER_HOME/.nvm/versions/node/$(ls "$USER_HOME/.nvm/versions/node/" 2>/dev/null | sort -V | tail -n 1)/bin/node"
        "$USER_HOME/.fnm/current/bin/node"
        "$USER_HOME/.asdf/shims/node"
        "$USER_HOME/.volta/bin/node"
        "$USER_HOME/.proto/bin/node"
    )

    for cand in "${CANDIDATE_PATHS[@]}"; do
        if [ -n "$cand" ] && [ -x "$cand" ]; then
            NODE_BIN="$cand"
            break
        fi
    done
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
    error "Node.js executable not found. Please install Node.js 24+ via Homebrew ('brew install node') or specify with --node-bin."
    exit 1
fi

NODE_VERSION="$("$NODE_BIN" --version 2>/dev/null || echo "unknown")"
success "Found Node.js at $NODE_BIN ($NODE_VERSION)"

NODE_MAJOR="$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"
if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && [ "$NODE_MAJOR" -lt 24 ]; then
    warn "Node.js version is $NODE_VERSION. Node.js 24+ is recommended for optimal TypeScript execution."
fi

# Auto-detect OpenMausBot installation directory
if [ -z "$INSTALL_DIR" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    POSSIBLE_DIRS=(
        "$(cd "$SCRIPT_DIR/../.." && pwd)"
        "$PWD"
        "/Applications/OpenMausBot.app/Contents/Resources/app"
        "$USER_HOME/Applications/OpenMausBot.app/Contents/Resources/app"
        "$USER_HOME/OpenMausBot"
        "$USER_HOME/.openmausbot"
    )

    for dir in "${POSSIBLE_DIRS[@]}"; do
        if [ -f "$dir/package.json" ] && grep -q '"name": *"openmausbot"' "$dir/package.json" 2>/dev/null; then
            INSTALL_DIR="$dir"
            break
        fi
    done
fi

if [ -z "$INSTALL_DIR" ] || [ ! -f "$INSTALL_DIR/package.json" ]; then
    error "Could not auto-detect OpenMausBot installation directory. Please specify with -d or --install-dir."
    exit 1
fi

info "Using OpenMausBot installation directory: $INSTALL_DIR"

# Determine server entry point
ENTRY_POINT=""
USE_STRIP_TYPES=false

if [ -f "$INSTALL_DIR/server/index.ts" ]; then
    ENTRY_POINT="$INSTALL_DIR/server/index.ts"
    USE_STRIP_TYPES=true
elif [ -f "$INSTALL_DIR/dist-server/index.js" ]; then
    ENTRY_POINT="$INSTALL_DIR/dist-server/index.js"
    USE_STRIP_TYPES=false
else
    error "OpenMausBot server entry point not found in $INSTALL_DIR."
    exit 1
fi

success "Detected server entry point: $ENTRY_POINT"

# Security warning when exposing to 0.0.0.0 without authentication
if [ "$HOST" = "0.0.0.0" ] && [ -z "$AUTH_TOKEN" ]; then
    echo ""
    warn "****************************************************************"
    warn "⚠️   SECURITY WARNING: UNPROTECTED LAN BINDING"
    warn "You are binding the server to 0.0.0.0 (all network interfaces)"
    warn "without an authentication token. Anyone on your local network"
    warn "can access your agent harness, execute commands, and view data!"
    warn ""
    warn "It is STRONGLY RECOMMENDED to set an authentication token."
    warn "Generate one with:"
    warn "  openssl rand -hex 32"
    warn ""
    warn "Then rerun this script with: --auth-token \"<generated-token>\""
    warn "****************************************************************"
    echo ""
    if [ "$NON_INTERACTIVE" = false ]; then
        echo -e "${YELLOW}Press Ctrl+C to abort, or waiting 10 seconds to continue anyway...${NC}"
        sleep 10
    fi
fi

# Prepare directories
mkdir -p "$PLIST_DIR"
mkdir -p "$LOG_DIR"

if [ "$IS_DAEMON" = true ]; then
    chown -R "$TARGET_USER" "$LOG_DIR" 2>/dev/null || true
fi

PLIST_PATH="$PLIST_DIR/${SERVICE_LABEL}.plist"
NODE_DIR="$(dirname "$NODE_BIN")"
MACOS_PATH="$NODE_DIR:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$USER_HOME/.local/bin:$USER_HOME/.cargo/bin"

info "Generating launchd property list at: $PLIST_PATH"

# Build ProgramArguments XML tags
PROG_ARGS="        <string>$NODE_BIN</string>\n"
if [ "$USE_STRIP_TYPES" = true ]; then
    PROG_ARGS="${PROG_ARGS}        <string>--experimental-strip-types</string>\n"
fi
PROG_ARGS="${PROG_ARGS}        <string>$ENTRY_POINT</string>"

# Build EnvironmentVariables XML tags
ENV_VARS="        <key>NODE_ENV</key>\n        <string>production</string>\n"
ENV_VARS="${ENV_VARS}        <key>HOME</key>\n        <string>$USER_HOME</string>\n"
ENV_VARS="${ENV_VARS}        <key>PATH</key>\n        <string>$MACOS_PATH</string>\n"
ENV_VARS="${ENV_VARS}        <key>OMB_HOST</key>\n        <string>$HOST</string>\n"
ENV_VARS="${ENV_VARS}        <key>OMB_PORT</key>\n        <string>$PORT</string>"

if [ -n "$AUTH_TOKEN" ]; then
    ENV_VARS="${ENV_VARS}\n        <key>OMB_AUTH_TOKEN</key>\n        <string>$AUTH_TOKEN</string>"
fi

if [ -n "$CORS_ORIGIN" ]; then
    ENV_VARS="${ENV_VARS}\n        <key>OMB_CORS_ORIGIN</key>\n        <string>$CORS_ORIGIN</string>"
fi

USER_KEY=""
if [ "$IS_DAEMON" = true ] && [ "$TARGET_USER" != "root" ]; then
    USER_KEY="    <key>UserName</key>\n    <string>$TARGET_USER</string>\n"
fi

# Write the LaunchAgent / LaunchDaemon plist
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$SERVICE_LABEL</string>
$(echo -e "$USER_KEY")    <key>ProgramArguments</key>
    <array>
$(echo -e "$PROG_ARGS")
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
$(echo -e "$ENV_VARS")
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>Crashed</key>
        <true/>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/service-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/service-stderr.log</string>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"
success "Wrote launchd configuration plist"

# Unload existing service if already active
info "Reloading service via launchctl..."
TARGET_UID="$(id -u "$TARGET_USER" 2>/dev/null || id -u)"

if [ "$IS_DAEMON" = true ]; then
    launchctl bootout "system/$SERVICE_LABEL" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
    sleep 1
    launchctl bootstrap system "$PLIST_PATH" 2>/dev/null || launchctl load -w "$PLIST_PATH"
else
    launchctl bootout "gui/$TARGET_UID/$SERVICE_LABEL" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
    sleep 1
    launchctl bootstrap "gui/$TARGET_UID" "$PLIST_PATH" 2>/dev/null || launchctl load -w "$PLIST_PATH"
fi

# Kickstart service to ensure immediate start
if [ "$IS_DAEMON" = true ]; then
    launchctl kickstart -k "system/$SERVICE_LABEL" 2>/dev/null || true
else
    launchctl kickstart -k "gui/$TARGET_UID/$SERVICE_LABEL" 2>/dev/null || true
fi

# Give the server a moment to spin up
sleep 3

# Verify service status
SERVICE_CHECK="$(launchctl list 2>/dev/null | grep "$SERVICE_LABEL" || true)"

if [ -n "$SERVICE_CHECK" ] || [ -f "$LOG_DIR/service-stdout.log" ]; then
    echo ""
    success "Service '${SERVICE_LABEL}' is configured and active in launchd!"
    echo ""
    echo -e "${CYAN}Service Details:${NC}"
    echo -e "  Service Label: ${BOLD}$SERVICE_LABEL${NC}"
    echo -e "  Scope:         ${BOLD}$(if [ "$IS_DAEMON" = true ]; then echo "LaunchDaemon (System)"; else echo "LaunchAgent (User: $TARGET_USER)"; fi)${NC}"
    echo -e "  Bind Host:     ${BOLD}$HOST${NC}"
    echo -e "  Port:          ${BOLD}$PORT${NC}"
    echo -e "  Auth Token:    ${BOLD}$(if [ -n "$AUTH_TOKEN" ]; then echo "Configured (Bearer Auth Enabled)"; else echo "None (Disabled)"; fi)${NC}"
    echo -e "  Logs Directory:${BOLD}$LOG_DIR${NC}"
    echo -e "  Plist Path:    ${BOLD}$PLIST_PATH${NC}"
    echo ""

    # Test health endpoint locally
    HEALTH_HOST="$HOST"
    if [ "$HOST" = "0.0.0.0" ]; then
        HEALTH_HOST="127.0.0.1"
    fi

    if command -v curl >/dev/null 2>&1; then
        HEALTH_URL="http://${HEALTH_HOST}:${PORT}/api/health"
        if curl -s -f -m 4 "$HEALTH_URL" >/dev/null 2>&1; then
            success "Health check passed at $HEALTH_URL"
        else
            warn "Health check at $HEALTH_URL did not respond immediately. Check logs at: $LOG_DIR/service-stderr.log"
        fi
    fi

    # Display LAN access info if bound to 0.0.0.0
    if [ "$HOST" = "0.0.0.0" ]; then
        LAN_IP=""
        for iface in en0 en1 en2 en3; do
            IP_CAND="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
            if [ -n "$IP_CAND" ]; then
                LAN_IP="$IP_CAND"
                break
            fi
        done

        if [ -n "$LAN_IP" ]; then
            echo -e "${CYAN}LAN Access URL:${NC}"
            echo -e "  ${BOLD}http://${LAN_IP}:${PORT}${NC}"
            if [ -n "$AUTH_TOKEN" ]; then
                echo -e "  ${YELLOW}Auth Token (Bearer):${NC} $AUTH_TOKEN"
                echo -e "  ${YELLOW}Browser Header/Param:${NC} http://${LAN_IP}:${PORT}/?access_token=${AUTH_TOKEN}"
            fi
            echo ""
        fi
    fi
else
    error "Service '${SERVICE_LABEL}' failed to load into launchctl."
    echo "Check logs at: $LOG_DIR/service-stderr.log"
    exit 1
fi

echo -e "${CYAN}Useful Management Commands:${NC}"
if [ "$IS_DAEMON" = true ]; then
    echo "  Status:    sudo launchctl list | grep $SERVICE_LABEL"
    echo "  Logs:      tail -f '$LOG_DIR/service-stdout.log' '$LOG_DIR/service-stderr.log'"
    echo "  Restart:   sudo launchctl kickstart -k system/$SERVICE_LABEL"
    echo "  Stop:      sudo launchctl bootout system/$SERVICE_LABEL"
    echo "  Uninstall: sudo ./scripts/macos/uninstall-service.sh --daemon -s $SERVICE_LABEL"
else
    echo "  Status:    launchctl list | grep $SERVICE_LABEL"
    echo "  Logs:      tail -f '$LOG_DIR/service-stdout.log' '$LOG_DIR/service-stderr.log'"
    echo "  Restart:   launchctl kickstart -k gui/$TARGET_UID/$SERVICE_LABEL"
    echo "  Stop:      launchctl bootout gui/$TARGET_UID/$SERVICE_LABEL"
    echo "  Uninstall: ./scripts/macos/uninstall-service.sh -s $SERVICE_LABEL"
fi
echo ""
