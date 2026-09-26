#!/bin/sh
# Photograph today's ranking as images for posting.
#
#   sh tools/snap-cards.sh            writes share/rank-post-<date>.png (1080x1350,
#                                     the portrait size a feed shows largest) and
#                                     assets/share/og-rank.png (1200x630, the link
#                                     preview named in data/atlas.json)
#
# Rebuild first (python3 build-data.py) so the page carries the latest news.
# Needs Google Chrome; runs it headless against the built index.html.
set -e
cd "$(dirname "$0")/.."
CH="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
D=$(date +%Y-%m-%d)
mkdir -p share assets/share
"$CH" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 \
  --window-size=1080,1350 --force-device-scale-factor=1 \
  --screenshot="share/rank-post-$D.png" "file://$PWD/index.html#card=post" 2>/dev/null
"$CH" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 \
  --window-size=1200,630 --force-device-scale-factor=1 \
  --screenshot="assets/share/og-rank.png" "file://$PWD/index.html#card=og" 2>/dev/null
echo "share/rank-post-$D.png"
echo "assets/share/og-rank.png"
