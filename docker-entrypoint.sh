#!/bin/sh
set -e

echo "=== Greet Bootstrap ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ─────────────────────────────────────────────────────────────
# Step 1: Pull .env config file from S3
# ─────────────────────────────────────────────────────────────
# The .env file on S3 contains non-secret configuration:
#   NODE_ENV, PORT, PEN_TEST_MODE, LOG_LEVEL, EMAIL_FROM, etc.
# Secrets (API keys, DB credentials) are NOT in this file.
#
# Required env vars for this step (set in ECS task definition):
#   ENV_S3_BUCKET   — S3 bucket name (e.g., greet-config)
#   ENV_S3_KEY      — S3 object key (e.g., production/.env)
#   AWS_REGION      — AWS region (default: us-west-2)
#
# Set SKIP_S3_ENV=true to skip (local dev, or if config is
# injected via ECS task definition directly).
# ─────────────────────────────────────────────────────────────

if [ "${SKIP_S3_ENV:-false}" = "false" ] && command -v aws > /dev/null 2>&1; then
  if [ -n "$ENV_S3_BUCKET" ] && [ -n "$ENV_S3_KEY" ]; then
    S3_REGION="${AWS_REGION:-us-west-2}"
    echo "Step 1: Pulling .env from s3://${ENV_S3_BUCKET}/${ENV_S3_KEY}"

    aws s3 cp "s3://${ENV_S3_BUCKET}/${ENV_S3_KEY}" /tmp/.env \
      --region "$S3_REGION" \
      --quiet || {
      echo "FATAL: Failed to download .env from S3"
      echo "  Bucket: $ENV_S3_BUCKET  Key: $ENV_S3_KEY  Region: $S3_REGION"
      echo "  Check IAM role permissions: s3:GetObject on arn:aws:s3:::${ENV_S3_BUCKET}/${ENV_S3_KEY}"
      exit 1
    }

    # Source the .env file — sets non-secret vars
    # Only set vars that aren't already defined (env vars take precedence)
    while IFS='=' read -r key value; do
      # Skip comments and empty lines
      case "$key" in
        \#*|"") continue ;;
      esac
      # Strip surrounding quotes from value
      value=$(echo "$value" | sed 's/^["'\'']\(.*\)["'\''"]$/\1/')
      eval existing=\$$key
      if [ -z "$existing" ]; then
        export "$key=$value"
        echo "  Loaded: $key"
      fi
    done < /tmp/.env

    rm -f /tmp/.env
    echo "  .env config loaded from S3"
  else
    echo "Step 1: SKIP — ENV_S3_BUCKET or ENV_S3_KEY not set"
  fi
elif [ "${SKIP_S3_ENV:-false}" = "false" ]; then
  echo "Step 1: SKIP — aws CLI not available"
else
  echo "Step 1: SKIP — SKIP_S3_ENV=true"
fi

echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-5000}"

# ─────────────────────────────────────────────────────────────
# Step 2: Pull secrets from AWS Systems Manager Parameter Store
# ─────────────────────────────────────────────────────────────
# SSM Parameter Store holds the actual secrets (API keys, DB creds).
# Stored as SecureString type, encrypted at rest via KMS.
# This replaces AWS Secrets Manager (no per-secret cost).
#
# Parameters are stored under a prefix:
#   /greet/production/DATABASE_URL
#   /greet/production/SESSION_SECRET
#   /greet/production/ANTHROPIC_API_KEY
#   etc.
#
# Required env vars for this step:
#   SSM_PREFIX  — path prefix (default: /greet/${NODE_ENV})
#   AWS_REGION  — AWS region (default: us-west-2)
#
# Set SKIP_SSM=true to skip (local dev).
# ─────────────────────────────────────────────────────────────

if [ "${SKIP_SSM:-false}" = "false" ] && command -v aws > /dev/null 2>&1; then
  SSM_PREFIX="${SSM_PREFIX:-/greet/${NODE_ENV:-production}}"
  SSM_REGION="${AWS_REGION:-us-west-2}"
  echo "Step 2: Pulling secrets from SSM: ${SSM_PREFIX}/*"

  params=$(aws ssm get-parameters-by-path \
    --path "$SSM_PREFIX" \
    --with-decryption \
    --region "$SSM_REGION" \
    --query "Parameters[*].[Name,Value]" \
    --output text 2>/dev/null) || {
    echo "FATAL: Failed to fetch parameters from SSM (prefix: $SSM_PREFIX)"
    echo "  Check IAM role permissions: ssm:GetParametersByPath on arn:aws:ssm:${SSM_REGION}:*:parameter${SSM_PREFIX}/*"
    exit 1
  }

  if [ -z "$params" ]; then
    echo "  WARNING: No parameters found at $SSM_PREFIX"
  else
    echo "$params" | while IFS=$(printf '\t') read -r name value; do
      # Extract var name from path: /greet/production/DATABASE_URL → DATABASE_URL
      var_name=$(echo "$name" | awk -F'/' '{print $NF}')
      # Only set if not already defined (env/S3 vars take precedence)
      eval existing=\$$var_name
      if [ -z "$existing" ]; then
        export "$var_name=$value"
        echo "  Loaded: $var_name"
      else
        echo "  Skipped: $var_name (already set)"
      fi
    done
    echo "  Secrets loaded from SSM"
  fi
elif [ "${SKIP_SSM:-false}" = "false" ]; then
  echo "Step 2: SKIP — aws CLI not available"
else
  echo "Step 2: SKIP — SKIP_SSM=true"
fi

# ─────────────────────────────────────────────────────────────
# Step 3: Validate required environment variables
# ─────────────────────────────────────────────────────────────

echo "Step 3: Validating required env vars"
missing=""
for var in DATABASE_URL SESSION_SECRET CREDENTIAL_ENCRYPTION_KEY; do
  eval val=\$$var
  if [ -z "$val" ]; then
    missing="$missing $var"
  fi
done

if [ -n "$missing" ]; then
  echo "FATAL: Missing required environment variables:$missing"
  echo "  These should be in SSM at ${SSM_PREFIX:-/greet/production}/VAR_NAME"
  exit 1
fi
echo "  All required vars present"

# ─────────────────────────────────────────────────────────────
# Step 4: Wait for database to be reachable
# ─────────────────────────────────────────────────────────────

echo "Step 4: Checking database connectivity"
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_PORT=${DB_PORT:-5432}

retries=0
max_retries=30
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null || [ $retries -ge $max_retries ]; do
  retries=$((retries + 1))
  echo "  DB not ready (attempt $retries/$max_retries)..."
  sleep 2
done

if [ $retries -ge $max_retries ]; then
  echo "FATAL: Database not reachable at $DB_HOST:$DB_PORT after $max_retries attempts"
  exit 1
fi
echo "  Database reachable at $DB_HOST:$DB_PORT"

# ─────────────────────────────────────────────────────────────
# Step 5: Run database migrations
# ─────────────────────────────────────────────────────────────

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Step 5: Running database migrations"
  npx drizzle-kit push --force
  echo "  Migrations complete"
else
  echo "Step 5: SKIP — RUN_MIGRATIONS=false"
fi

# ─────────────────────────────────────────────────────────────
# Step 6: Start the application
# ─────────────────────────────────────────────────────────────

echo "=== Starting Greet ==="
exec "$@"
