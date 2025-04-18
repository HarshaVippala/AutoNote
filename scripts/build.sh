#!/bin/bash
set -e

echo "Running build check..."

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build
echo "🏗️  Building the project..."
npm run build

echo "✅ Build completed successfully!" 