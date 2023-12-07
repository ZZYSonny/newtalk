#!/bin/bash

SERVER=$(cat src/common/defaults_private.ts | grep defaultServerURL | cut -d \" -f2)
ROLE=$1
NOGUI=$2

FLAGS=""
if [ "$NOGUI" == "nogui" ]; then
    FLAGS="--no-sandbox --headless=new --disable-gpu --ozone-platform=headless"
fi

chromium $FLAGS "$SERVER/test.html?room=SPEED&role=$ROLE"