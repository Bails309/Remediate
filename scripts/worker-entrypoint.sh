#!/bin/sh
set -e

# Wait for migrations (migrate.js handles this)
node /app/scripts/migrate.js

# Run database optimizations (Views, Maintenance)
# tsx is a production dependency, so its binary is present in the runtime tree.
/app/node_modules/.bin/tsx /app/scripts/optimize-db.ts

# Start the background worker. Invoked directly rather than via `npm run
# worker` so npm is not required at runtime and SIGTERM reaches the worker.
exec /app/node_modules/.bin/tsx /app/scripts/worker.ts
