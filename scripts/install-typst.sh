#!/bin/bash

set -e

TYPST_VERSION="0.15.1"
INSTALL_DIR="${1:-$HOME/.local/bin}"

case "$(uname -m)" in
  x86_64)
    TARGET="x86_64-unknown-linux-musl"
    SHA256="a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c"
    ;;
  aarch64)
    TARGET="aarch64-unknown-linux-musl"
    SHA256="5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee"
    ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

ARCHIVE="$(mktemp)"
trap 'rm -f "$ARCHIVE"' EXIT

curl -sSL -o "$ARCHIVE" "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${TARGET}.tar.xz"
echo "${SHA256}  ${ARCHIVE}" | sha256sum -c --quiet -

mkdir -p "$INSTALL_DIR"
tar -xJ -C "$INSTALL_DIR" --strip-components=1 -f "$ARCHIVE" "typst-${TARGET}/typst"

"$INSTALL_DIR/typst" --version
