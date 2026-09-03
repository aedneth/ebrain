---
description: Store one durable learning in eBrain's shared, cross-agent memory.
argument-hint: <the learning, in one self-contained sentence>
---
Store a durable learning in eBrain memory.

Learning to store: {{ARGUMENTS}}

If nothing was given above, distill the single most reusable thing this session established — a
fix and its root cause, a decision and its reason, a constraint that is not obvious from the code —
and state it in one self-contained sentence or short paragraph. Include the why, not only the what.
Keep the language the user is working in.

Then run, from the shell:

    ebrain remember "<the learning>"

Rules:

- One learning per call. Do not store the session, a transcript, or facts already in the repository.
- Never include a credential of any kind. The command refuses them; so must you.
- If the command refuses (denied repository, credential-shaped text), report that and stop. Do not
  retry with a rewording that hides the problem.
- Report the confirmation line the command prints.
