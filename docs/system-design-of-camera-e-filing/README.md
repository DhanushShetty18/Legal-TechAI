# System Design of Camera E-Filing

Where `docs/camera-filing-explained/` teaches you *what each file does*,
this folder teaches you *why the system is shaped the way it is* — the
architecture, the trade-offs, the failure handling, and general software
design lessons this one feature happens to be a good teaching example of.

Read `docs/camera-filing-explained/` first if you haven't — everything here
assumes you already know what `extract_from_document`, `stream_document`,
and `useDeedGeneration` do. This folder is about the shape of the forest,
not the trees.

## Read in this order

1. **[01-architecture-overview.md](./01-architecture-overview.md)** — the
   layers of this system, drawn as a diagram, and the rule each layer
   follows about what it is and isn't allowed to know.
2. **[02-microservices-concepts-via-this-code.md](./02-microservices-concepts-via-this-code.md)**
   — this codebase is a *monolith*, not a microservices system, but it is
   internally organised the way a well-designed microservices system is.
   This document teaches the real concepts (API gateways, service
   boundaries, REST contracts, multi-tenancy, high-throughput design) using
   this code as the running example, and is explicit about where the
   analogy holds and where it doesn't.
3. **[03-design-decisions-and-tradeoffs.md](./03-design-decisions-and-tradeoffs.md)**
   — the specific engineering calls this feature makes, organised by theme,
   with the reasoning and the accepted cost of each.
4. **[04-failure-modes-and-resilience.md](./04-failure-modes-and-resilience.md)**
   — for every major dependency this feature has (the AI model, the
   network, the backend's own uptime), what happens when it fails, and
   exactly which line of code is responsible for that behaviour.
5. **[05-rebuild-from-memory-blueprint.md](./05-rebuild-from-memory-blueprint.md)**
   — if this feature vanished tomorrow, here is the order to rebuild it in,
   the decisions you'd need to re-make, and a self-check for each piece
   so you can verify you actually reconstructed the real design rather
   than a plausible-looking one.
