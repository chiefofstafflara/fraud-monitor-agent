# Gateway Redundancy - Bruce Proof of Concept

## Overview

This PoC demonstrates containerizing the Bruce gateway to prevent cross-agent outages.

## Prerequisites

```bash
# Install Docker/Podman
sudo apt update && sudo apt install -y docker.io docker-compose

# For Podman (alternative)
sudo apt install -y podman podman-compose

# Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker
```

## Setup Steps

### 1. Copy Existing Bruce Data
```bash
# Backup existing Bruce home
sudo cp -a /home/bruce /home/bruce.backup
```

### 2. Create Volume for Bruce's Home
```bash
docker volume create bruce-home
docker volume create shared-vault
docker volume create ops-logs
```

### 3. Populate Volumes
```bash
# Copy Bruce's .hermes directory
sudo tar -czf /tmp/bruce-home.tar.gz /home/bruce/.hermes/
docker run --rm -v bruce-home:/home/bruce -v /tmp:/tmp busybox tar -xzf /tmp/bruce-home.tar.gz -C /home/bruce
```

### 4. Configure Environment
```bash
cd /home/ubuntu/fraud-monitor-agent
cp .env.example .env
# Edit .env with your Telegram bot token and other settings
```

### 5. Build and Run
```bash
# Build container
docker-compose -f docker-compose.bruce.yaml build

# Start container (runs alongside systemd)
docker-compose -f docker-compose.bruce.yaml up -d
```

### 6. Test and Validate
```bash
# Check container status
docker ps | grep bruce

# View logs
docker logs hermes-gateway-bruce

# Test messaging
# Send a message to Bruce via Telegram and verify response
```

### 7. Switch (Optional)

If successful, disable systemd service:
```bash
sudo systemctl disable hermes-gateway-bruce.service
sudo systemctl stop hermes-gateway-bruce.service
```

## Rollback Plan

If issues arise:
```bash
# Stop container
docker-compose -f docker-compose.bruce.yaml down

# Restore systemd
sudo systemctl start hermes-gateway-bruce.service
```

## Next Steps

1. ✅ **Bruce PoC** - Build and test
2. ⏹ **Other Agents** - Create similar Dockerfiles
3. ⏹ **Central Management** - Single docker-compose for all agents
