#!/bin/sh
# Photograph today's ranking as images for posting.
#
#   sh tools/snap-cards.sh            writes share/rank-post-<date>.png (1080x1350, light;
#                                     rank-post-dark-<date>.png is the dark one,
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
# a profile of its own, kept between runs (a fresh one is slow to start):
# a background Chrome update can hold the default one and hang a headless
# run. Each shot is also killed after a minute.
PROFILE="${TMPDIR:-/tmp}/wwan-snap-profile"
mkdir -p "$PROFILE"
shot(){
  # Chrome writes the picture and then, while its updater runs, may not exit:
  # wait for the file, then close it
  out=$(printf '%s\n' "$@" | sed -n 's/^--screenshot=//p'); rm -f "$out"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --disable-component-update --user-data-dir="$PROFILE" --virtual-time-budget=6000 --force-device-scale-factor=1 "$@" >/dev/null 2>&1 &
  pid=$!; n=0
  while [ ! -s "$out" ] && [ $n -lt 90 ]; do sleep 1; n=$((n+1)); done
  sleep 1; kill $pid 2>/dev/null; wait $pid 2>/dev/null
  [ -s "$out" ] || echo "snapshot failed: $out" >&2
}
mkdir -p share assets/share
shot --window-size=1080,1350 --screenshot="share/rank-post-$D.png" "file://$PWD/index.html#card=post"
shot --window-size=1080,1350 --screenshot="share/rank-post-dark-$D.png" "file://$PWD/index.html#card=post-dark"
shot --window-size=1200,630 --screenshot="assets/share/og-rank.png" "file://$PWD/index.html#card=og"
echo "share/rank-post-$D.png"
echo "share/rank-post-dark-$D.png"
echo "assets/share/og-rank.png"
