#!/bin/sh
# Check the npm install block on the VPS.
# The block lives in /home/frog/.bash_profile.
# Run: sh check-npm-block.sh
set -e

blocked=$(bash -lc "npm install" 2>&1 || true)
case "$blocked" in
  *"IDIOT, read the docs first!!"*)
    echo "PASS: npm install is blocked"
    ;;
  *)
    echo "FAIL: npm install is not blocked"
    exit 1
    ;;
esac

other=$(bash -lc "npm run" 2>&1 || true)
case "$other" in
  *"IDIOT, read the docs first!!"*)
    echo "FAIL: a normal npm command was blocked too"
    exit 1
    ;;
  *)
    echo "PASS: normal npm commands pass through"
    ;;
esac

echo "OK: the npm install block works on this VPS"
