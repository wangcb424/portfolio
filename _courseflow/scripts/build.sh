#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
(cd frontend && npm ci --no-audit --no-fund && npm run build)
mkdir -p backend/src/main/resources/static
cp -R frontend/dist/. backend/src/main/resources/static/
(cd backend && sh ./mvnw -B -ntp verify)
mkdir -p release
cp backend/target/courseflow-0.2.0.jar release/courseflow.jar
printf '%s\n' 'Run: java -jar release/courseflow.jar --spring.profiles.active=demo'
