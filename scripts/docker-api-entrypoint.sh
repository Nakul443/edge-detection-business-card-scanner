#!/bin/sh
set -e

echo "Applying database migrations..."
npm --workspace apps/api run db:migrate

if [ "${SEED_SAMPLE_DATA:-true}" = "true" ]; then
  echo "Loading sample data if the database is empty..."
  npm run db:seed:if-empty
fi

echo "Starting API..."
npm --workspace apps/api run start:prod
