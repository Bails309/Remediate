#!/bin/sh
set -e

node /app/scripts/migrate.js

exec npm start
