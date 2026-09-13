#!/bin/sh
set -eu

until mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; do
  echo "Waiting for MinIO..."
  sleep 2
done

mc mb --ignore-existing "local/$MINIO_BUCKET"
echo "Bucket $MINIO_BUCKET is ready."
