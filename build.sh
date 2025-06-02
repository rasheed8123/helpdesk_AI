#!/bin/bash

# Update package manager
apt-get update

# Install system dependencies
apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev

# Install npm packages
npm install

# Download face-api models
node scripts/downloadModels.js 