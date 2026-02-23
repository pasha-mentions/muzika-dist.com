#!/bin/bash
set -e

CHROMIUM_WRAPPER=$(which chromium 2>/dev/null || echo "")
if [ -z "$CHROMIUM_WRAPPER" ]; then
  echo "WARNING: chromium not found on PATH during build"
  exit 0
fi

REAL_CHROMIUM=$(grep -oP 'exec "\K[^"]+' "$CHROMIUM_WRAPPER" 2>/dev/null || echo "")
if [ -z "$REAL_CHROMIUM" ]; then
  echo "WARNING: could not extract real chromium path from wrapper"
  exit 0
fi

LD_LIBS=$(grep -oP "LD_LIBRARY_PATH.*?\".*?\K/nix/store[^\"]*" "$CHROMIUM_WRAPPER" 2>/dev/null | tr '\n' ':' || echo "")

FFMPEG_STATIC="$(pwd)/node_modules/ffmpeg-static/ffmpeg"

cat > dist/binary-paths.json << EOF
{
  "chromiumPath": "$REAL_CHROMIUM",
  "chromiumLdLibraryPath": "$LD_LIBS",
  "ffmpegPath": "$FFMPEG_STATIC",
  "chromiumWrapperPath": "$CHROMIUM_WRAPPER"
}
EOF

echo "Build-time binary resolution:"
echo "  Chromium wrapper: $CHROMIUM_WRAPPER"
echo "  Chromium real: $REAL_CHROMIUM"
echo "  LD_LIBRARY_PATH: $LD_LIBS"
echo "  ffmpeg-static: $FFMPEG_STATIC"
echo "  Saved to dist/binary-paths.json"
