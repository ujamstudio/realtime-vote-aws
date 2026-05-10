#!/usr/bin/env bash
# Builds the SPA and pushes it to S3, then invalidates CloudFront.
# Run after `terraform apply` (which creates the bucket + distribution).
set -euo pipefail

cd "$(dirname "$0")"
TF_DIR="../infrastructure/terraform"

BUCKET=$(terraform -chdir="$TF_DIR" output -raw site_bucket)
DIST_ID=$(terraform -chdir="$TF_DIR" output -raw cloudfront_distribution_id)
SITE_URL=$(terraform -chdir="$TF_DIR" output -raw site_url)

echo "→ building..."
npm run build

echo "→ syncing hashed assets (long cache)..."
aws s3 sync dist/ "s3://${BUCKET}/" \
    --delete \
    --exclude "index.html" \
    --cache-control "public,max-age=31536000,immutable"

echo "→ uploading index.html (no cache)..."
aws s3 cp dist/index.html "s3://${BUCKET}/index.html" \
    --cache-control "public,max-age=0,must-revalidate" \
    --content-type "text/html; charset=utf-8"

echo "→ invalidating CloudFront..."
aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/index.html" >/dev/null

echo "✅ deployed: ${SITE_URL}"
