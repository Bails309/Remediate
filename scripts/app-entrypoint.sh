#!/bin/sh
set -e

# Run migrations on startup (safe due to advisory locks)
node /app/scripts/migrate.js

# Start the Next.js application
exec npm start
