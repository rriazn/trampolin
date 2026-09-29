#!/bin/bash

set -e

GITLEAKS_VERSION="8.30.1"
INSTALL_DIR="${1:-$HOME/.local/bin}"

mkdir -p "$INSTALL_DIR"
curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
  | tar -xz -C "$INSTALL_DIR" gitleaks

"$INSTALL_DIR/gitleaks" version
