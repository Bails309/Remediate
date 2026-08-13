#!/bin/sh
set -e

# Run migrations on startup (safe due to advisory locks)
node /app/scripts/migrate.js

# Invoke the Next binary directly rather than via `npm start`. npm is removed
# from the runtime image (see Dockerfile), and exec'ing without the npm wrapper
# makes this the container's main process, so SIGTERM reaches Next on shutdown
# instead of being swallowed by an intermediate npm.
exec /app/node_modules/.bin/next start
