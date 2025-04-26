#!/bin/bash

# ------------------------------------------------------
# Run script for AgentAssist on macOS
# ------------------------------------------------------
# Features:
# - Starts the app with system default audio I/O
# - Hides from dock
# - Runs in background
# ------------------------------------------------------

# Change to the directory containing this script
cd "$(dirname "$0")"

# Check if we need to build first
if [ ! -d "node_modules" ]; then
  echo "First run detected. Installing dependencies..."
  npm install
fi

# Build the Next.js app if needed
if [ ! -d ".next" ]; then
  echo "Building Next.js app..."
  npm run build
fi

# Set environment variables for audio
export AUDIODEV=default  # Use system default audio device
export AUDIODRIVER=coreaudio  # Use CoreAudio driver on macOS

# Start Next.js server in the background
echo "Starting Next.js server..."
npm run start &
NEXT_PID=$!

# Wait for Next.js server to start (10 seconds)
echo "Waiting for Next.js server to initialize..."
sleep 10

# Set Electron to use system default audio
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_ENABLE_STACK_DUMPING=1

# Launch Electron app
echo "Starting Electron app..."
electron . &
ELECTRON_PID=$!

# Trap Ctrl+C to clean up
trap cleanup INT
function cleanup() {
  echo "Shutting down..."
  kill $ELECTRON_PID 2>/dev/null
  kill $NEXT_PID 2>/dev/null
  exit 0
}

# Keep script running to maintain background processes
echo "AgentAssist is running."
echo "Press Ctrl+C to quit."
echo "------------------------------"
echo "Window keyboard shortcuts:"
echo "Ctrl+B / Cmd+B: Toggle window visibility"
echo "Ctrl+[ / Cmd+[: Decrease opacity"
echo "Ctrl+] / Cmd+]: Increase opacity"
echo "Ctrl+Arrow keys: Move window"
echo "Ctrl+T / Cmd+T: Toggle click-through mode"
echo "Ctrl+H / Cmd+H: Take screenshot"
echo "------------------------------"

# Keep script running
while true; do
  sleep 1
  # Check if processes are still running
  if ! ps -p $ELECTRON_PID > /dev/null; then
    echo "Electron process ended. Shutting down..."
    kill $NEXT_PID 2>/dev/null
    break
  fi
  if ! ps -p $NEXT_PID > /dev/null; then
    echo "Next.js server ended. Shutting down..."
    kill $ELECTRON_PID 2>/dev/null
    break
  fi
done

echo "AgentAssist has been stopped." 