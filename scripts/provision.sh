#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Alpo — Server Provisioning Script
# =============================================================================
# Provisions a fresh Ubuntu 24.04 droplet for alpo deployment.
# Run as root: curl ... | bash  OR  bash scripts/provision.sh
#
# What it does:
#   1. System update
#   2. Install Docker Engine + Compose plugin
#   3. Configure UFW firewall (SSH, HTTP, HTTPS only)
#   4. Create /opt/alpo deployment directory
#
# Idempotent: safe to re-run on an already-provisioned server.
# =============================================================================

DEPLOY_DIR="/opt/alpo"

echo "==> Alpo server provisioning starting..."
echo ""

# -----------------------------------------------------------------------------
# 1. System update
# -----------------------------------------------------------------------------
echo "==> Updating system packages..."
apt-get update -y
apt-get upgrade -y

# -----------------------------------------------------------------------------
# 2. Docker Engine + Compose plugin
# -----------------------------------------------------------------------------
if command -v docker &>/dev/null; then
  echo "==> Docker already installed: $(docker --version)"
else
  echo "==> Installing Docker Engine..."

  # Prerequisites
  apt-get install -y ca-certificates curl gnupg

  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Add Docker apt repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y

  # Install Docker Engine, CLI, containerd, and Compose plugin
  apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  echo "==> Docker installed: $(docker --version)"
fi

# Ensure Docker is enabled and running
systemctl enable docker
systemctl start docker

# Verify docker compose (v2, space syntax) works
echo "==> Docker Compose version: $(docker compose version)"

# -----------------------------------------------------------------------------
# 3. UFW firewall
# -----------------------------------------------------------------------------
echo "==> Configuring UFW firewall..."

apt-get install -y ufw

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow only SSH, HTTP, HTTPS — Postgres (5432) stays Docker-internal
ufw allow 22   # SSH
ufw allow 80   # HTTP
ufw allow 443  # HTTPS

# Enable firewall (--force skips interactive prompt)
ufw --force enable

echo "==> UFW status:"
ufw status verbose

# -----------------------------------------------------------------------------
# 4. Deployment directory
# -----------------------------------------------------------------------------
if [ -d "$DEPLOY_DIR" ]; then
  echo "==> Deployment directory already exists: $DEPLOY_DIR"
else
  echo "==> Creating deployment directory: $DEPLOY_DIR"
  mkdir -p "$DEPLOY_DIR"
fi

# -----------------------------------------------------------------------------
# Summary & next steps
# -----------------------------------------------------------------------------
echo ""
echo "============================================================"
echo " Alpo server provisioning complete!"
echo "============================================================"
echo ""
echo " Docker:    $(docker --version)"
echo " Compose:   $(docker compose version)"
echo " Firewall:  UFW active (22/SSH, 80/HTTP, 443/HTTPS)"
echo " Deploy to: $DEPLOY_DIR"
echo ""
echo " Next steps:"
echo "   1. Clone the repo:"
echo "      git clone https://github.com/YOUR_ORG/alpo.git $DEPLOY_DIR"
echo ""
echo "   2. Copy .env.production.template → .env and fill in secrets:"
echo "      cp $DEPLOY_DIR/.env.production.template $DEPLOY_DIR/.env"
echo ""
echo "   3. Start the app:"
echo "      cd $DEPLOY_DIR && docker compose up --build -d"
echo ""
echo "   4. For subsequent deploys (CI/CD does this automatically):"
echo "      cd $DEPLOY_DIR && git fetch origin main && git reset --hard origin/main"
echo "      docker compose up --build -d"
echo ""
echo "============================================================"
