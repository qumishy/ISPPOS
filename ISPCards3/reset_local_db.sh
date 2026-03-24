#!/data/data/com.termux/files/usr/bin/bash
rm -f .expo/*.db 2>/dev/null || true
rm -f .expo-shared/*.db 2>/dev/null || true
find /data/data/com.termux/files/home -type f \( -name "SQLite.db" -o -name "app.db" -o -name "*.db" \) 2>/dev/null
echo "done"
