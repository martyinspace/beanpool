## 2026-05-11 - [O(N^2) Array Filtering on Relational Data]
**Learning:** In `state-engine.ts`, fetching associated relational data (like photos for posts) was done by running `.filter()` on an entire array of relational objects inside a `.map()` block across all rows. For large datasets, this N+1 in-memory problem creates an O(N^2) complexity that blocks the single-threaded Node.js event loop.
**Action:** When mapping relational rows to nested objects, pre-group the relational arrays using a `Map` structure with the foreign key (e.g., `post_id`) as the key to convert the operation into an O(N) lookup.
## 2026-05-12 - [N+1 SQLite Queries in loops]
**Learning:** In `state-engine.ts`, fetching relational items via SQLite queries inside a `.map()` iteration executes an unnecessary database operation for every item. For example, getting conversation participants by calling `db.prepare(...).all(id)` per conversation triggers N+1 queries to the database.
**Action:** Convert the operation to a single SQL query using the `IN (...)` operator. Collect all keys, perform one query, and group the results via a `Map` for O(N) lookup during the final object mappings.
