## 2026-05-11 - [O(N^2) Array Filtering on Relational Data]
**Learning:** In `state-engine.ts`, fetching associated relational data (like photos for posts) was done by running `.filter()` on an entire array of relational objects inside a `.map()` block across all rows. For large datasets, this N+1 in-memory problem creates an O(N^2) complexity that blocks the single-threaded Node.js event loop.
**Action:** When mapping relational rows to nested objects, pre-group the relational arrays using a `Map` structure with the foreign key (e.g., `post_id`) as the key to convert the operation into an O(N) lookup.
## 2024-05-14 - [In-render Computation]
**Learning:** In React components like `MarketplacePage`, computations that involve running calculations over arrays inside the JSX return block via IIFE run on every single render. This blocks the main thread during component renders even if dependencies like `posts` haven't changed.
**Action:** Extract large filtering or calculating logic to the top level of the component and wrap it in a `useMemo` hook with strict dependencies. Avoid placing logic in an IIFE in the JSX return block.
