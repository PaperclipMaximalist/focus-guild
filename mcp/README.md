# Focus Guild MCP connector

Lets Claude (Desktop or Code) read your Guild — tracker, chronicle, permafile,
schedule, quests — and add to it. Pair it with Claude's own connectors to do
things the app can't on its own:

- "Pull anything from my Teams mentions this week into my parking lot."
- "Using my permafile and last 30 days, draft my weekly review."
- "My calendar says Thursday is full. Which tracker items should I let go of?"

It talks to the Focus Guild REST API with your personal access token, so it can
never do more than you can in the app.

## What it can do

| Tool | Does |
|---|---|
| `get_tracker` | Tracker as markdown (`compact` / `working` / `full` / `archive`) |
| `get_chronicle` | What happened, grouped by day (1–90 days) |
| `get_permafile` | Who you are and your rules for the AI |
| `get_context_bundle` | All three in one document — best for broad questions |
| `get_schedule` | The current planned day, including calendar blocks |
| `get_quests` | Active quests |
| `add_to_parking_lot` | Capture an idea for triage |
| `append_journal` | Add a line to the chronicle |
| `log_decision` | Append to the decision log |
| `update_permafile` | Replace the permafile (versioned, restorable) |

Writes are additive and reversible on purpose. Nothing here can complete a
quest, drop a tracker item or delete anything — those stay in your hands.

## Setup

1. In Focus Guild: **Settings → Connections → Turn on inbox** to create a
   personal access token. Copy it; it's shown once.
2. Build the connector:

```bash
cd mcp && npm install && npm run build
```

3. Add it to Claude Desktop's config file:
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "focus-guild": {
      "command": "node",
      "args": ["C:\\Users\\User\\projects\\focus-guild\\mcp\\dist\\index.js"],
      "env": {
        "FOCUS_GUILD_URL": "https://focus-guild-production.up.railway.app",
        "FOCUS_GUILD_TOKEN": "fgpat_your_token_here"
      }
    }
  }
}
```

4. Restart Claude Desktop. The tools appear under the connector menu.

For Claude Code instead: `claude mcp add focus-guild --env FOCUS_GUILD_URL=… --env FOCUS_GUILD_TOKEN=… -- node /path/to/mcp/dist/index.js`

Point `FOCUS_GUILD_URL` at `http://127.0.0.1:3000` to work against a local server.

## Notes

- The token is the same one the inbox uses. Making a new one in Connections
  breaks the old everywhere, so update this config too.
- Everything the connector returns is your own data, and the permafile's
  "Rules for the AI" section travels with it, so Claude follows your rules
  wherever you use it.
