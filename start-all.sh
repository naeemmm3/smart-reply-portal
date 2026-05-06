#!/bin/bash

echo "Starting Smart Reply Portal..."

cd ~/ai-chat-portal || exit

echo "Starting backend on port 5000..."
gnome-terminal -- bash -c "cd ~/ai-chat-portal && node server.js; exec bash"

sleep 2

echo "Starting frontend on port 5500..."
gnome-terminal -- bash -c "cd ~/ai-chat-portal && python3 -m http.server 5500 --bind 0.0.0.0; exec bash"

sleep 2

echo "Starting backend Cloudflare tunnel..."
gnome-terminal -- bash -c "cloudflared tunnel --url http://localhost:5000; exec bash"

sleep 2

echo "Starting frontend Cloudflare tunnel..."
gnome-terminal -- bash -c "cloudflared tunnel --url http://localhost:5500; exec bash"

echo ""
echo "All services started."
echo "IMPORTANT:"
echo "1. Copy backend tunnel URL and put it inside index.html as API_BASE."
echo "2. Copy frontend tunnel URL and put it inside MainActivity.kt webView.loadUrl()."
echo "3. Rebuild APK if frontend URL changed."
