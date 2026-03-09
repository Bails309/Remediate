#!/bin/sh
set -e

# Wait for migrations (migrate.js handles this)
node /app/scripts/migrate.js

# Run database optimizations (Views, Maintenance)
# Note: we use tsx as it is available in the runner's node_modules
npx tsx /app/scripts/optimize-db.ts

# Start the background worker
exec npm run worker
