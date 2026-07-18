# Migration Concepts

eBrain does not offer an automatic raw-transcript or arbitrary-directory import. Durable memory
must be bounded, scrubbed, provenance-bearing, and reviewable.

The current migration proof is internal and fixture-only. It verifies that a deterministic synthetic
record can recover after an interrupted ledger write without overwriting history or duplicating a
changed fixture. It does not read personal repositories, discover files, expose an import command,
or claim that legacy data was moved.

A future public import/export format requires its own privacy contract, user confirmation, clean
installation documentation, and independent review. Until then, use `remember`, reviewed context
packs, and workflow ingestion through the supported interfaces.
