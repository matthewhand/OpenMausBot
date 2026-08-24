#!/usr/bin/env bash
# ==============================================================================
# OpenMausBot Linux systemd Service Uninstallation Script
# ==============================================================================
# This script stops, disables, and removes the OpenMausBot systemd service.
#
# Prerequisites:
# - Root/sudo privileges (for system service) or current user session (for --user-mode)
#
# Usage:
#   sudo ./uninstall-service.sh [OPTIONS]
#   ./uninstall-service.sh --user-mode [OPTIONS]
#
# Examples:
#   # Remove default system service
#   sudo ./uninstall-service.sh
#
#   # Remove user-mode service
#   ./uninstall-service.sh --user-mode
#
#   # Remove custom named service and skip confirmation prompts
#   sudo ./uninstall-service.sh -s openmausbot-prod -y
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
USER_MODE=false
CLEAN_DATA=false
NON_INTERACTIVE=false

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
OpenMausBot Linux systemd Service Uninstallation

Usage:
  sudo ./uninstall-service.sh [OPTIONS]
  ./uninstall-service.sh --user-mode [OPTIONS]

Options:
  -s, --service-name <name>  systemd service name to uninstall (default: openmausbot)
      --user-mode            Uninstall systemd user service (~/.config/systemd/user/)
      --clean-data           Prompt to delete data directory (~/.openmausbot)
  -y, --non-interactive      Non-interactive mode (do not prompt for confirmations)
  -h, --help                 Show this help message and exit

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
        --user-mode)
            USER_MODE=true
            shift
            ;;
        --clean-data)
            CLEAN_DATA=true
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

info "Starting OpenMausBot systemd service uninstallation..."

# Configure paths and systemctl commands based on mode
if [ "$USER_MODE" = true ]; then
    USER_HOME="$HOME"
    SYSTEMD_DIR="$USER_HOME/.config/systemd/user"
    SYSTEMCTL_CMD="systemctl --user"
    DATA_DIR="$USER_HOME/.openmausbot"
    info "Targeting systemd user service: $SERVICE_NAME"
else
    if [ "$(id -u)" -ne 0 ]; then
        error "System-level uninstallation requires root privileges. Please run with 'sudo' or use '--user-mode'."
        exit 1
    fi
    TARGET_USER="${SUDO_USER:-$(id -un)}"
    USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6 || echo "/home/$TARGET_USER")"
    SYSTEMD_DIR="/etc/systemd/system"
    SYSTEMCTL_CMD="systemctl"
    DATA_DIR="$USER_HOME/.openmausbot"
    info "Targeting system service: $SERVICE_NAME"
fi

UNIT_FILE="$SYSTEMD_DIR/${SERVICE_NAME}.service"

# Check if unit file exists
if [ ! -f "$UNIT_FILE" ]; then
    warn "Unit file $UNIT_FILE does not exist. Checking systemctl status..."
fi

# Stop the service if active
if $SYSTEMCTL_CMD is-active --quiet "${SERVICE_NAME}.service" 2>/dev/null; then
    info "Stopping service '$SERVICE_NAME'..."
    $SYSTEMCTL_CMD stop "${SERVICE_NAME}.service" || true
    success "Service stopped"
else
    info "Service '$SERVICE_NAME' is not currently active."
fi

# Disable the service
if $SYSTEMCTL_CMD is-enabled --quiet "${SERVICE_NAME}.service" 2>/dev/null; then
    info "Disabling service '$SERVICE_NAME'..."
    $SYSTEMCTL_CMD disable "${SERVICE_NAME}.service" || true
    success "Service disabled"
fi

# Remove the unit file
if [ -f "$UNIT_FILE" ]; then
    info "Removing unit file: $UNIT_FILE"
    rm -f "$UNIT_FILE"
    success "Unit file removed"
fi

# Reload daemon and reset failed states
info "Reloading systemd daemon..."
$SYSTEMCTL_CMD daemon-reload
$SYSTEMCTL_CMD reset-failed 2>/dev/null || true

success "Service '$SERVICE_NAME' has been successfully uninstalled!"

# Handle data directory cleanup if requested
if [ "$CLEAN_DATA" = true ] && [ -d "$DATA_DIR" ]; then
    echo ""
    info "OpenMausBot data directory found at: $DATA_DIR"
    DO_CLEAN=false
    if [ "$NON_INTERACTIVE" = true ]; then
        DO_CLEAN=true
    else
        read -r -p "Do you want to permanently delete the data directory and all configurations? [y/N]: " response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            DO_CLEAN=true
        fi
    fi

    if [ "$DO_CLEAN" = true ]; then
        rm -rf "$DATA_DIR"
        success "Data directory $DATA_DIR deleted."
    else
        info "Data directory preserved at $DATA_DIR"
    fi
fi

echo ""
