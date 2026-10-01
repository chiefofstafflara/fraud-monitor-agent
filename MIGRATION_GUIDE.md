# Gateway Redundancy - Fraud Monitor Proof of Concept

## Overview

This PoC demonstrates containerizing the Hermes Fraud Monitor gateway to prevent cross-fraud_monitor outages.

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

### 1. Copy Existing Fraud Monitor Data
```bash
# Backup existing Fraud Monitor home
sudo cp -a /home/fraud_monitor /home/fraud_monitor.backup
```

### 2. Create Volume for Fraud Monitor's Home
```bash
docker volume create fraud_monitor-home
docker volume create shared-vault
docker volume create ops-logs
```

### 3. Populate Volumes
```bash
# Copy Fraud Monitor's .hermes directory
sudo tar -czf /tmp/fraud_monitor-home.tar.gz /home/fraud_monitor/.hermes/
docker run --rm -v fraud_monitor-home:/home/fraud_monitor -v /tmp:/tmp busybox tar -xzf /tmp/fraud_monitor-home.tar.gz -C /home/fraud_monitor
```

### 4. Configure Environment
```bash
cd /home/ubuntu/fraud-monitor-fraud_monitor
cp .env.example .env
# Edit .env with your Telegram bot token and other settings
```

### 5. Build and Run
```bash
# Build container
docker-compose -f docker-compose.fraud_monitor.yaml build

# Start container (runs alongside systemd)
docker-compose -f docker-compose.fraud_monitor.yaml up -d
```

### 6. Test and Validate
```bash
# Check container status
docker ps | grep fraud_monitor

# View logs
docker logs hermes-gateway-fraud_monitor

# Test messaging
# Send a message to Fraud Monitor via Telegram and verify response
```

### 7. Switch (Optional)

If successful, disable systemd service:
```bash
sudo systemctl disable hermes-gateway-fraud_monitor.service
sudo systemctl stop hermes-gateway-fraud_monitor.service
```

## Rollback Plan

If issues arise:
```bash
# Stop container
docker-compose -f docker-compose.fraud_monitor.yaml down

# Restore systemd
sudo systemctl start hermes-gateway-fraud_monitor.service
```

## Next Steps

1. ✅ **Fraud Monitor PoC** - Build and test
2. ⏹ **Other Fraud Monitors** - Create similar Dockerfiles
3. ⏹ **Central Management** - Single docker-compose for all fraud_monitors
