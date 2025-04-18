# Build Script

This directory contains a simple build script for the project.

## build.sh

Checks if the project builds successfully:
- Installs dependencies
- Runs the build process

Usage:
```bash
npm run build-check
```

## GitHub Workflows

The project includes GitHub Actions workflows that automatically run this script:

1. `pr-build.yml` - Runs when a PR is raised against the main branch
2. `main-merge.yml` - Runs when changes are pushed to the main branch (after a PR is merged) 