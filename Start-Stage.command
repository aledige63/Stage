#!/bin/bash
# Stage launcher (macOS): starts the local server if needed and opens Stage in Chrome.
# Avvio di Stage (macOS): avvia il server locale se serve e apre Stage in Chrome.
cd "$(dirname "$0")/app" || exit 1
URL="http://localhost:5173"

pause_and_exit() {
  read -n 1 -s -r -p "Premi un tasto per chiudere / Press any key to close..."
  echo
  exit "$1"
}

# Node.js installato con l'installer ufficiale o con Homebrew
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato / not found: https://nodejs.org (LTS)"
  pause_and_exit 1
fi

open_browser() {
  if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL"
  else
    echo "Chrome non trovato, apro il browser predefinito / Chrome not found, opening the default browser"
    open "$URL"
  fi
}

# Server gia' attivo / server already running
if curl -s -o /dev/null "$URL"; then
  open_browser
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Prima installazione delle dipendenze / Installing dependencies (first run)..."
  npm install || { echo "Installazione non riuscita / Install failed"; pause_and_exit 1; }
fi

echo "Avvio di Stage / Starting Stage — chiudi questa finestra per fermarlo / close this window to stop it"
npm run dev -- --port 5173 --strictPort &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

for _ in $(seq 1 40); do
  sleep 1
  if curl -s -o /dev/null "$URL"; then
    open_browser
    break
  fi
done
wait $SERVER
