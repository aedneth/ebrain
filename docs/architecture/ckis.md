# eBrain and CKIS

CKIS is related knowledge infrastructure: authoring, source organization, graph tooling, and
optional federated knowledge workflows. eBrain is the developer runtime and control plane: daemon,
MCP bridges, agent onboarding, workspaces, sessions, routing, token telemetry, and terminal UI.

The projects can integrate, but neither public quickstart requires private CKIS data. A clean eBrain
installation starts with local stores. Developers may opt into compatible federation after they
understand its source and privacy boundaries.

This distinction matters for portability: a new user should be able to install eBrain without
copying someone else's vault, operating procedures, source permissions, or agent memory.
