#!/data/data/com.termux/files/usr/bin/bash
set -e

pkill -f "expo" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true

rm -rf .expo .expo-shared 2>/dev/null || true
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf $TMPDIR/metro-* 2>/dev/null || true

echo "STARTING EXPO CLEAN..."
npx expo start -c
