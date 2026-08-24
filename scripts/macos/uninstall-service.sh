#!/usr/bin/env bash
# ==============================================================================
# OpenMausBot macOS launchd Service Uninstallation Script
# ==============================================================================
# This script stops, unloads, and removes the OpenMausBot launchd service
# (LaunchAgent or LaunchDaemon).
#
# Usage:
#   ./uninstall-service.sh [OPTIONS]                # Uninstall user LaunchAgent
#   sudo ./uninstall-service.sh --daemon [OPTIONS]   # Uninstall system LaunchDaemon
#
# Examples:
#   # Remove default user LaunchAgent
#   ./uninstall-service.sh
#
#   # Remove system LaunchDaemon
#   sudo ./uninstall-service.sh --daemon
#
#   # Remove service and clean up log files
#   ./uninstall-service.sh --clean-logs
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
IS_DAEMON=false
CLEAN_LOGS=false
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
OpenMausBot macOS launchd Service Uninstallation

Usage:
  ./uninstall-service.sh [OPTIONS]
  sudo ./uninstall-service.sh --daemon [OPTIONS]

Options:
  -s, --service-name <label> Service label to uninstall (default: com.openmausbot.server)
      --daemon               Uninstall system LaunchDaemon (/Library/LaunchDaemons)
      --clean-logs           Prompt to delete log directory (~/Library/Logs/OpenMausBot)
  -y, --non-interactive      Non-interactive mode (do not prompt for confirmations)
  -h, --help                 Show this help message and exit

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
        --daemon)
            IS_DAEMON=true
            shift
            ;;
        --clean-logs)
            CLEAN_LOGS=true
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

info "Starting OpenMausBot macOS launchd service uninstallation..."

CURRENT_UID="$(id -u)"
CURRENT_USER="$(id -un)"

if [ "$IS_DAEMON" = true ]; then
    if [ "$CURRENT_UID" -ne 0 ]; then
        error "System LaunchDaemon uninstallation requires root privileges. Please run with sudo."
        exit 1
    fi
    PLIST_PATH="/Library/LaunchDaemons/${SERVICE_LABEL}.plist"
    LOG_DIR="/Library/Logs/OpenMausBot"
    info "Targeting system LaunchDaemon: $SERVICE_LABEL"
else
    TARGET_USER="${SUDO_USER:-$CURRENT_USER}"
    USER_HOME="$(eval echo "~$TARGET_USER")"
    PLIST_PATH="$USER_HOME/Library/LaunchAgents/${SERVICE_LABEL}.plist"
    LOG_DIR="$USER_HOME/Library/Logs/OpenMausBot"
    TARGET_UID="$(id -u "$TARGET_USER" 2>/dev/null || id -u)"
    info "Targeting user LaunchAgent: $SERVICE_LABEL"
fi

# Unload from launchctl
info "Unloading service from launchctl..."
if [ "$IS_DAEMON" = true ]; then
    launchctl bootout "system/$SERVICE_LABEL" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
else
    launchctl bootout "gui/$TARGET_UID/$SERVICE_LABEL" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi
success "Service unloaded"

# Remove plist file
if [ -f "$PLIST_PATH" ]; then
    info "Removing plist configuration: $PLIST_PATH"
    rm -f "$PLIST_PATH"
    success "Plist file removed"
else
    warn "Plist file $PLIST_PATH not found (may have already been removed)."
fi

success "Service '$SERVICE_LABEL' uninstalled successfully!"

# Handle log directory cleanup if requested
if [ "$CLEAN_LOGS" = true ] && [ -d "$LOG_DIR" ]; then
    echo ""
    info "Log files found at: $LOG_DIR"
    DO_CLEAN=false
    if [ "$NON_INTERACTIVE" = true ]; then
        DO_CLEAN=true
    else
        read -r -p "Do you want to delete log files at $LOG_DIR? [y/N]: " response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            DO_CLEAN=true
        fi
    fi

    if [ "$DO_CLEAN" = true ]; then
        rm -rf "$LOG_DIR"
        success "Log directory deleted."
    else
        info "Log directory preserved at $LOG_DIR"
    fi
fi

echo ""
