#!/usr/bin/env bash
# ==============================================================================
# OpenMausBot Linux systemd Service Installation Script
# ==============================================================================
# This script installs OpenMausBot as a systemd service (system-wide or user-level)
# with automatic startup on boot, crash recovery, journald logging, and configurable
# network and authentication parameters.
#
# Prerequisites:
# - Linux OS with systemd (Ubuntu 20.04+, Debian 11+, Fedora 38+, RHEL 9+, Arch, etc.)
# - Node.js 24+ installed and available in PATH
# - OpenMausBot repository or installed package
# - Root/sudo privileges (for system service) or current user session (for --user-mode)
#
# Usage:
#   sudo ./install-service.sh [OPTIONS]
#   ./install-service.sh --user-mode [OPTIONS]
#
# Examples:
#   # Install system service with default settings (port 8799, bind 0.0.0.0)
#   sudo ./install-service.sh
#
#   # Install with secure authentication token
#   sudo ./install-service.sh --auth-token "your-secret-token"
#
#   # Install with custom port, host, and specific service user
#   sudo ./install-service.sh -p 9000 -H 127.0.0.1 --user myuser
#
#   # Install as a systemd user service (no sudo required)
#   ./install-service.sh --user-mode --auth-token "your-token"
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
SERVICE_NAME="openmausbot"
PORT="${OMB_PORT:-8799}"
HOST="${OMB_HOST:-0.0.0.0}"
AUTH_TOKEN="${OMB_AUTH_TOKEN:-}"
CORS_ORIGIN="${OMB_CORS_ORIGIN:-*}"
INSTALL_DIR="${OMB_INSTALL_DIR:-}"
RUN_USER=""
RUN_GROUP=""
NODE_BIN=""
USER_MODE=false
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
OpenMausBot Linux systemd Service Installation

Usage:
  sudo ./install-service.sh [OPTIONS]
  ./install-service.sh --user-mode [OPTIONS]

Options:
  -s, --service-name <name>  systemd service name (default: openmausbot)
  -p, --port <port>          Server port (default: 8799, env: OMB_PORT)
  -H, --host <host>          Bind address (default: 0.0.0.0, env: OMB_HOST)
  -t, --auth-token <token>   Bearer token for API access (required for LAN, env: OMB_AUTH_TOKEN)
  -c, --cors-origin <origin> Allowed CORS origin (default: *, env: OMB_CORS_ORIGIN)
  -d, --install-dir <path>   OpenMausBot installation root directory (auto-detected)
  -u, --user <username>      User to run service as (default: $SUDO_USER or current user)
  -g, --group <groupname>    Group to run service as (default: user's primary group)
      --node-bin <path>      Path to Node.js executable (auto-detected)
      --user-mode            Install as systemd user service (~/.config/systemd/user/)
  -y, --non-interactive      Do not pause for security warnings or confirmations
  -h, --help                 Show this help message and exit

Security Note:
  When binding to 0.0.0.0, always configure an authentication token!
  Generate a secure token:
    openssl rand -hex 32

EOF
    exit 0
}

# Parse command line options
while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--service-name)
            SERVICE_NAME="$2"
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
        -u|--user)
            RUN_USER="$2"
            shift 2
            ;;
        -g|--group)
            RUN_GROUP="$2"
            shift 2
            ;;
        --node-bin)
            NODE_BIN="$2"
            shift 2
            ;;
        --user-mode)
            USER_MODE=true
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

info "Starting OpenMausBot systemd service installation..."

# Check privileges based on installation mode
if [ "$USER_MODE" = true ]; then
    RUN_USER="$(id -un)"
    RUN_GROUP="$(id -gn)"
    USER_HOME="$HOME"
    SYSTEMD_DIR="$USER_HOME/.config/systemd/user"
    SYSTEMCTL_CMD="systemctl --user"
    info "Installing in systemd user mode for user: $RUN_USER"
else
    if [ "$(id -u)" -ne 0 ]; then
        error "System-level installation requires root privileges. Please run with 'sudo' or use '--user-mode'."
        exit 1
    fi
    # Determine the target user (prefer SUDO_USER if invoked via sudo)
    if [ -z "$RUN_USER" ]; then
        RUN_USER="${SUDO_USER:-$(id -un)}"
    fi
    if [ -z "$RUN_GROUP" ]; then
        RUN_GROUP="$(id -gn "$RUN_USER" 2>/dev/null || echo "$RUN_USER")"
    fi
    USER_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6 || echo "/home/$RUN_USER")"
    SYSTEMD_DIR="/etc/systemd/system"
    SYSTEMCTL_CMD="systemctl"
    info "Installing system-wide service running as user: $RUN_USER ($RUN_GROUP)"
fi

# Locate Node.js executable
if [ -z "$NODE_BIN" ]; then
    # Check standard PATH, plus common Node manager locations
    CANDIDATE_PATHS=(
        "$(command -v node 2>/dev/null || true)"
        "/usr/bin/node"
        "/usr/local/bin/node"
        "$USER_HOME/.nvm/versions/node/$(ls "$USER_HOME/.nvm/versions/node/" 2>/dev/null | sort -V | tail -n 1)/bin/node"
        "$USER_HOME/.fnm/current/bin/node"
        "$USER_HOME/.asdf/shims/node"
        "$USER_HOME/.volta/bin/node"
        "/snap/bin/node"
    )

    for cand in "${CANDIDATE_PATHS[@]}"; do
        if [ -n "$cand" ] && [ -x "$cand" ]; then
            NODE_BIN="$cand"
            break
        fi
    done
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
    error "Node.js executable not found. Please install Node.js 24+ or specify with --node-bin."
    exit 1
fi

NODE_VERSION="$("$NODE_BIN" --version 2>/dev/null || echo "unknown")"
success "Found Node.js at $NODE_BIN ($NODE_VERSION)"

# Validate Node.js version (Node 24+ recommended for type-stripping)
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
        "/opt/openmausbot"
        "/opt/OpenMausBot"
        "/usr/local/share/openmausbot"
        "$USER_HOME/openmausbot"
        "$USER_HOME/OpenMausBot"
        "$USER_HOME/.local/share/openmausbot"
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

# Determine the server entry point (source vs pre-built bundle)
ENTRY_POINT=""
NODE_ARGS=()

if [ -f "$INSTALL_DIR/server/index.ts" ]; then
    ENTRY_POINT="$INSTALL_DIR/server/index.ts"
    NODE_ARGS=("--experimental-strip-types" "$ENTRY_POINT")
elif [ -f "$INSTALL_DIR/dist-server/index.js" ]; then
    ENTRY_POINT="$INSTALL_DIR/dist-server/index.js"
    NODE_ARGS=("$ENTRY_POINT")
else
    error "OpenMausBot server entry point not found (checked server/index.ts and dist-server/index.js in $INSTALL_DIR)."
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

# Prepare systemd directory
mkdir -p "$SYSTEMD_DIR"
UNIT_FILE="$SYSTEMD_DIR/${SERVICE_NAME}.service"

# Build PATH environment variable for systemd
NODE_DIR="$(dirname "$NODE_BIN")"
SERVICE_PATH="$NODE_DIR:$USER_HOME/.local/bin:$USER_HOME/.pnpm:$USER_HOME/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

info "Generating systemd unit file at: $UNIT_FILE"

# Construct systemd service unit
if [ "$USER_MODE" = true ]; then
    # User service configuration
    cat > "$UNIT_FILE" << EOF
[Unit]
Description=OpenMausBot Agent Harness
Documentation=https://github.com/milind-soni/OpenMausBot
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN ${NODE_ARGS[*]}
Restart=always
RestartSec=5s
StartLimitIntervalSec=600
StartLimitBurst=5
TimeoutStopSec=10

# Environment Configuration
Environment="NODE_ENV=production"
Environment="HOME=$USER_HOME"
Environment="PATH=$SERVICE_PATH"
Environment="OMB_HOST=$HOST"
Environment="OMB_PORT=$PORT"
EOF
else
    # System-wide service configuration
    cat > "$UNIT_FILE" << EOF
[Unit]
Description=OpenMausBot Agent Harness
Documentation=https://github.com/milind-soni/OpenMausBot
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN ${NODE_ARGS[*]}
Restart=always
RestartSec=5s
StartLimitIntervalSec=600
StartLimitBurst=5
TimeoutStopSec=10

# Security Hardening
PrivateTmp=true
ProtectSystem=full
ProtectHome=false

# Environment Configuration
Environment="NODE_ENV=production"
Environment="HOME=$USER_HOME"
Environment="PATH=$SERVICE_PATH"
Environment="OMB_HOST=$HOST"
Environment="OMB_PORT=$PORT"
EOF
fi

# Append optional environment variables if set
if [ -n "$AUTH_TOKEN" ]; then
    echo "Environment=\"OMB_AUTH_TOKEN=$AUTH_TOKEN\"" >> "$UNIT_FILE"
fi

if [ -n "$CORS_ORIGIN" ]; then
    echo "Environment=\"OMB_CORS_ORIGIN=$CORS_ORIGIN\"" >> "$UNIT_FILE"
fi

# Append logging & install sections
cat >> "$UNIT_FILE" << EOF

# Logging to journald
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=$(if [ "$USER_MODE" = true ]; then echo "default.target"; else echo "multi-user.target"; fi)
EOF

chmod 644 "$UNIT_FILE"
success "Wrote service unit file"

# Reload systemd daemon
info "Reloading systemd daemon..."
$SYSTEMCTL_CMD daemon-reload

# Enable service for automatic startup
info "Enabling service '$SERVICE_NAME'..."
$SYSTEMCTL_CMD enable "${SERVICE_NAME}.service"

# Restart / Start the service
info "Starting service '$SERVICE_NAME'..."
$SYSTEMCTL_CMD restart "${SERVICE_NAME}.service"

# Give the server a moment to spin up
sleep 3

# Verify service status
if $SYSTEMCTL_CMD is-active --quiet "${SERVICE_NAME}.service"; then
    echo ""
    success "Service '${SERVICE_NAME}' is ACTIVE and RUNNING!"
    echo ""
    echo -e "${CYAN}Service Details:${NC}"
    echo -e "  Service Name:  ${BOLD}$SERVICE_NAME${NC}"
    echo -e "  Mode:          ${BOLD}$(if [ "$USER_MODE" = true ]; then echo "User Service"; else echo "System Service ($RUN_USER)"; fi)${NC}"
    echo -e "  Bind Host:     ${BOLD}$HOST${NC}"
    echo -e "  Port:          ${BOLD}$PORT${NC}"
    echo -e "  Auth Token:    ${BOLD}$(if [ -n "$AUTH_TOKEN" ]; then echo "Configured (Bearer Auth Enabled)"; else echo "None (Disabled)"; fi)${NC}"
    echo -e "  Install Dir:   ${BOLD}$INSTALL_DIR${NC}"
    echo -e "  Unit File:     ${BOLD}$UNIT_FILE${NC}"
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
            warn "Health check at $HEALTH_URL did not respond immediately. Check logs with journalctl."
        fi
    fi

    # Display LAN access information if bound to 0.0.0.0
    if [ "$HOST" = "0.0.0.0" ]; then
        PRIMARY_IP=""
        if command -v hostname >/dev/null 2>&1; then
            PRIMARY_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
        fi
        if [ -z "$PRIMARY_IP" ] && command -v ip >/dev/null 2>&1; then
            PRIMARY_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7}')"
        fi

        if [ -n "$PRIMARY_IP" ]; then
            echo -e "${CYAN}LAN Access URL:${NC}"
            echo -e "  ${BOLD}http://${PRIMARY_IP}:${PORT}${NC}"
            if [ -n "$AUTH_TOKEN" ]; then
                echo -e "  ${YELLOW}Auth Token (Bearer):${NC} $AUTH_TOKEN"
                echo -e "  ${YELLOW}Browser Header/Param:${NC} http://${PRIMARY_IP}:${PORT}/?access_token=${AUTH_TOKEN}"
            fi
            echo ""
        fi
    fi
else
    error "Service '${SERVICE_NAME}' failed to start or is not active."
    echo "Check journalctl logs for details:"
    if [ "$USER_MODE" = true ]; then
        echo "  journalctl --user -u ${SERVICE_NAME} -e --no-pager"
    else
        echo "  journalctl -u ${SERVICE_NAME} -e --no-pager"
    fi
    exit 1
fi

echo -e "${CYAN}Useful Management Commands:${NC}"
if [ "$USER_MODE" = true ]; then
    echo "  Status:    systemctl --user status ${SERVICE_NAME}"
    echo "  Logs:      journalctl --user -u ${SERVICE_NAME} -f"
    echo "  Restart:   systemctl --user restart ${SERVICE_NAME}"
    echo "  Stop:      systemctl --user stop ${SERVICE_NAME}"
    echo "  Uninstall: ./scripts/linux/uninstall-service.sh --user-mode -s ${SERVICE_NAME}"
else
    echo "  Status:    sudo systemctl status ${SERVICE_NAME}"
    echo "  Logs:      sudo journalctl -u ${SERVICE_NAME} -f"
    echo "  Restart:   sudo systemctl restart ${SERVICE_NAME}"
    echo "  Stop:      sudo systemctl stop ${SERVICE_NAME}"
    echo "  Uninstall: sudo ./scripts/linux/uninstall-service.sh -s ${SERVICE_NAME}"
fi
echo ""
