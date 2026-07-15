#!/bin/sh
set -e
node dist/src/db/migrate.js
exec "$@"
