#!/bin/bash
set -e

# BeanPool Global Mesh Deploy Script
# Pulls pre-built image from GHCR and deploys to remote nodes
#
# Usage:
#   bash deploy.sh           # Deploy to all nodes
#   bash deploy.sh 1 3       # Deploy to specific nodes by number
#
# The Docker image is auto-built by GitHub Actions on push to main:
#   ghcr.io/martyinspace/beanpool-node:latest

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="ghcr.io/martyinspace/beanpool-node:latest"

# Load .env file for Cloudflare credentials (if it exists)
if [ -f "$SCRIPT_DIR/.env" ]; then
  echo "🔑 Loading .env file..."
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Active nodes: number:name:IP:DNS:user
# Azure nodes use azureuser + SSH key; Debian uses marty + default key
NODES=(
    "1:mullum2:20.211.27.68:mullum2.beanpool.org:azureuser:BeanPool"
  "2:bp-brisbane:20.5.121.158:brisbane.beanpool.org:azureuser:BeanPool"
  "3:mullum1:192.168.1.219:mullum1.beanpool.org:marty:BeanPool"
  "4:review:192.168.1.219:review.beanpool.org:marty:BeanPool-Review"
)

# Package docker-compose.yml + data-preserving deploy config
echo "📦 Packaging deploy config..."
tar -czf /tmp/beanpool-deploy.tar.gz \
    --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='.turbo' \
    --exclude='.next' --exclude='out' --exclude='archive' --exclude='apps/native' --exclude='apps/native.bak' \
    --exclude='*.apk' --exclude='data' --exclude='.env' --exclude='.env.*' \
    -C "$SCRIPT_DIR" .
echo "✅ Package ready: $(du -h /tmp/beanpool-deploy.tar.gz | cut -f1)"

# Determine which nodes to deploy
TARGETS=()
if [ $# -gt 0 ]; then
  for NUM in "$@"; do
    for NODE in "${NODES[@]}"; do
      if [[ "$NODE" == "$NUM:"* ]]; then
        TARGETS+=("$NODE")
      fi
    done
  done
else
  TARGETS=("${NODES[@]}")
fi

echo ""
echo "🌍 Deploying to ${#TARGETS[@]} node(s):"
for NODE in "${TARGETS[@]}"; do
  NAME=$(echo "$NODE" | cut -d: -f2)
  IP=$(echo "$NODE" | cut -d: -f3)
  DNS=$(echo "$NODE" | cut -d: -f4)
  echo "   $NAME ($IP) → $DNS"
done
echo ""

# Deploy each node
for NODE in "${TARGETS[@]}"; do
  NAME=$(echo "$NODE" | cut -d: -f2)
  IP=$(echo "$NODE" | cut -d: -f3)
  DNS=$(echo "$NODE" | cut -d: -f4)
  USER=$(echo "$NODE" | cut -d: -f5)
  DIR=$(echo "$NODE" | cut -d: -f6)
  if [ -z "$DIR" ]; then DIR="BeanPool"; fi
  HOME_DIR="/home/$USER"
  PROJECT_DIR="$HOME_DIR/$DIR"

  # Azure nodes use the lattice SSH key; others use default
  if [ "$USER" = "azureuser" ]; then
    SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -i ~/.ssh/id_azure_lattice"
  else
    SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
  fi

  echo "====================================="
  echo "🚀 Deploying $NAME ($IP) → $DNS"
  echo "====================================="

  # Upload
  scp $SSH_OPTS /tmp/beanpool-deploy.tar.gz $USER@$IP:$HOME_DIR/

  # Stop, preserve data, extract, pull image, start
  ssh $SSH_OPTS $USER@$IP "
    cd $PROJECT_DIR 2>/dev/null && sudo docker compose -p beanpool-\$DIR down 2>/dev/null
    sudo mv $PROJECT_DIR/data $HOME_DIR/beanpool-data-backup-\$DIR 2>/dev/null || true
    sudo rm -rf $PROJECT_DIR
    mkdir -p $PROJECT_DIR
    tar -xzf $HOME_DIR/beanpool-deploy.tar.gz -C $PROJECT_DIR
    sudo mv $HOME_DIR/beanpool-data-backup-\$DIR $PROJECT_DIR/data 2>/dev/null || true
    cd $PROJECT_DIR
    export PUBLIC_IP=\$(curl -s ifconfig.me)
    export CF_API_TOKEN='${CF_API_TOKEN}'
    export CF_ZONE_ID='${CF_ZONE_ID}'
    export CF_RECORD_NAME='${DNS}'
    export ADMIN_PASSWORD='${ADMIN_PASSWORD}'
    echo \"Public IP: \$PUBLIC_IP\"
    echo \"DNS Record: \$CF_RECORD_NAME\"
    # Temporarily building directly on server instead of GHCR pull
    # sudo -E docker compose -p beanpool-\$DIR pull
    sudo docker image prune -f 2>/dev/null || true
    sudo -E docker compose -p beanpool-\$DIR build
    sudo -E docker compose -p beanpool-\$DIR up -d
  " 2>&1

  echo "✅ $NAME deployed!"
  echo ""
done

rm -f /tmp/beanpool-deploy.tar.gz
echo "🎉 All ${#TARGETS[@]} node(s) deployed!"

