#!/bin/bash
# Runs ESLint on a JS/JSX file the agent just edited and feeds problems back to the agent.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
input=$(cat)
exec node "$(dirname "$0")/lint-after-edit.mjs" <<<"$input"
