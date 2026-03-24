#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "== remove expo temp =="
rm -rf .expo .expo-shared 2>/dev/null || true

echo "== remove metro cache =="
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf $TMPDIR/metro-* 2>/dev/null || true

echo "== start expo clean =="
npx expo start -c
