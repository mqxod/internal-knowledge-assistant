#!/usr/bin/env bash
# One-time host setup for Ubuntu 24.04 LTS on EC2. Run as the default `ubuntu` user:
#   curl -fsSL <raw-url>/deploy/ec2-setup.sh | bash     (or copy the file and run it)
set -euo pipefail

echo "==> Installing Docker Engine + Compose plugin from Docker's official repository"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git certbot
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "==> Adding 2 GB swap (Next.js production builds need headroom on small instances)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Enabling unattended security updates"
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "Done. Log out and back in (for docker group membership), then follow docs/DEPLOYMENT.md."
