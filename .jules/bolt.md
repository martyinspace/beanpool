## 2026-05-11 - [O(N^2) Array Filtering on Relational Data]
**Learning:** In `state-engine.ts`, fetching associated relational data (like photos for posts) was done by running `.filter()` on an entire array of relational objects inside a `.map()` block across all rows. For large datasets, this N+1 in-memory problem creates an O(N^2) complexity that blocks the single-threaded Node.js event loop.
**Action:** When mapping relational rows to nested objects, pre-group the relational arrays using a `Map` structure with the foreign key (e.g., `post_id`) as the key to convert the operation into an O(N) lookup.
## 2026-05-14 - [O(N) Query Explosion in State Lookups]
**Learning:** In `state-engine.ts`, mapping over arrays and doing individual `db.prepare(...).get()` or `db.prepare(...).all()` inside the `.map()` loop creates an N+1 query problem, which can severely block the Node.js event loop when the array is large (like fetching conversations).
**Action:** Extract the IDs from the array, run a single batch query using an `IN (...)` clause, process the results into a `Map` keyed by ID, and do an O(1) Map lookup inside the `map()` loop instead.
