#!/usr/bin/env bash
# Wrapper para `npx cap sync` que re-injeta o firebase-ios-sdk no Package.swift
# gerado pelo Capacitor (SPM). O `cap sync` regenera CapApp-SPM/Package.swift a
# cada execução, removendo qualquer dependência que não seja plugin Capacitor —
# por isso o Firebase precisa ser re-injetado aqui.
#
# SEMPRE use `npm run cap:sync`, nunca `npx cap sync` direto.
set -euo pipefail
cd "$(dirname "$0")/.."
npx cap sync "$@"

PACKAGE_SWIFT="ios/App/CapApp-SPM/Package.swift"
if [ -f "$PACKAGE_SWIFT" ] && ! grep -q "firebase-ios-sdk" "$PACKAGE_SWIFT"; then
  echo "[cap-sync] re-injecting firebase-ios-sdk into $PACKAGE_SWIFT"
  # 1) adiciona o package na lista de dependencies (após CapacitorStatusBar)
  /usr/bin/sed -i '' \
    -e 's|\(.package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar")\)|\1,\
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0")|' \
    "$PACKAGE_SWIFT"
  # 2) adiciona o product FirebaseMessaging no target (após CapacitorStatusBar)
  /usr/bin/sed -i '' \
    -e 's|\(.product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")\)|\1,\
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk")|' \
    "$PACKAGE_SWIFT"
fi
