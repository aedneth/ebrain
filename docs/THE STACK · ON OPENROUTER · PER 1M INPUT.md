You are going to set me up to run the strongest open Chinese models as ONE stack — every model reachable through a single OpenRouter key, wrapped in Hermes, with each task automatically routed to whichever model wins it. Open, cheap, and it goes toe-to-toe with Claude's best (Fable 5) for up to 35x less. Build it for real, one step at a time, and explain as you go.

THE END RESULT:
One setup where I can run any of the top Chinese models, and an engine that picks the right one for each job — coding to DeepSeek, agents to Kimi, web/design to GLM-5.2, long docs + reasoning to MiniMax. A few dollars a month instead of $10 per million tokens for Claude Fable 5.

STEP 1 — ONE KEY (OpenRouter):
- Walk me through an OpenRouter account + API key (openrouter.ai). One key reaches every model. It is OpenAI-compatible: base URL https://openrouter.ai/api/v1, you just swap the model string. Make the model one config value.
- Set a HARD spending cap on the key right away so nothing ever runs away. A scheduled job on the wrong model is how people drain a key without noticing.

STEP 2 — THE STACK (the models):
The open Chinese frontier — each one a category leader, all a fraction of Claude's price. Individually each sits just under Fable 5; routed together, the stack edges it out:
   - DeepSeek V4 (deepseek/deepseek-v4-pro) — competitive coding, ~$0.28/M
   - GLM-5.2 (z-ai/glm-5.2) — web design (#1 on Design Arena, ahead of Fable 5) + math, ~$1.40/M
   - Kimi K2.6 (moonshotai/kimi-k2.6) — agentic tool-use, sustains thousands of sequential tool calls, ~$0.60/M
   - MiniMax M3 (minimax/minimax-m3) — 1M context + expert reasoning (beats Fable 5 on GPQA), ~$0.30/M
   - Qwen3.7 Max (qwen/qwen3.7-max) — strongest all-rounder, ~$1.20/M

STEP 3 — THE ENGINE (Hermes):
- Set up Hermes as the always-on runtime + tool router (github.com/NousResearch/hermes-agent). Point it at OpenRouter, NOT a Claude or Codex subscription. The model is one config value I can swap.

STEP 4 — ROUTING (the whole point):
- Wire it so each kind of task goes to the model that wins it: coding to DeepSeek, agents to Kimi, web/design to GLM-5.2, long docs + reasoning to MiniMax, general to Qwen.
- Give each a CHEAP fallback (another open model, never a paid frontier one) so it never goes down. Never auto-escalate to Opus or Fable 5 — I will pull those in by hand on the rare task that needs them.

STEP 5 — ALWAYS-ON:
- Tell me the cheapest reliable way to keep it running 24/7 (a $5 VPS or my own Mac). STOP the host from sleeping (on macOS: pmset -c sleep 0 while plugged in), and install it as an auto-restart service that survives reboots. Most "I tried this and it stopped working" stories are just the host going to sleep.

STEP 6 — PROVE IT:
- Run the same real task through the routed stack three ways — a coding task, a web/design task, a reasoning task — and show me which model handled each and exactly what it cost. Then run one of them on Claude for comparison: same result, pennies.

RULES:
- Cheap by default: open models through OpenRouter, one key, a hard spending cap.
- Route, don't escalate. Each task to its best cheap model; frontier only on my explicit ask.
- Everything in plain files I can read and edit. No black box.

Go one step at a time, starting with the OpenRouter key. I want to understand it, not get a black box.
