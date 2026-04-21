#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="http://127.0.0.1:9800"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "=== Claude API Hub - Plugin Installer ==="
echo ""

# Check gateway is built
if [ ! -f "$PROJECT_ROOT/dist/index.js" ]; then
  echo "Gateway not built. Run 'npm run build' in $PROJECT_ROOT first."
  exit 1
fi

# Prompt for API keys
read -rp "MOONSHOT_API_KEY (Kimi, leave blank to skip): " MOONSHOT_API_KEY
read -rp "MINIMAX_API_KEY (MiniMax, leave blank to skip): " MINIMAX_API_KEY
read -rp "ZHIPUAI_API_KEY (GLM, leave blank to skip): " ZHIPUAI_API_KEY

# Export keys to shell profile if provided
PROFILE_FILE="$HOME/.bashrc"
[ -f "$HOME/.zshrc" ] && PROFILE_FILE="$HOME/.zshrc"

{
  echo ""
  echo "# claude-api-hub API keys"
  [ -n "$MOONSHOT_API_KEY" ]  && echo "export MOONSHOT_API_KEY=\"$MOONSHOT_API_KEY\""
  [ -n "$MINIMAX_API_KEY" ]   && echo "export MINIMAX_API_KEY=\"$MINIMAX_API_KEY\""
  [ -n "$ZHIPUAI_API_KEY" ]   && echo "export ZHIPUAI_API_KEY=\"$ZHIPUAI_API_KEY\""
} >> "$PROFILE_FILE"

echo "API keys written to $PROFILE_FILE"

# Update ~/.claude/settings.json to set ANTHROPIC_BASE_URL
mkdir -p "$HOME/.claude"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Use node to safely merge the env var into settings.json
node - "$SETTINGS_FILE" "$GATEWAY_URL" <<'EOF'
const fs = require('fs');
const [,, settingsPath, gatewayUrl] = process.argv;
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
settings.env = settings.env || {};
settings.env.ANTHROPIC_BASE_URL = gatewayUrl;
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('Updated', settingsPath, '-> ANTHROPIC_BASE_URL =', gatewayUrl);
EOF

# Install the plugin
if command -v claude &>/dev/null; then
  echo "Installing plugin via 'claude plugin add'..."
  claude plugin add "$(dirname "$0")"
  echo "Plugin installed."
else
  echo "Warning: 'claude' CLI not found. Install Claude Code, then run:"
  echo "  claude plugin add $(dirname "$0")"
fi

echo ""
echo "Done. Start the gateway with:"
echo "  cd $PROJECT_ROOT && npm start"
