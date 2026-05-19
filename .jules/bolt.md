## 2026-05-11 - [O(N^2) Array Filtering on Relational Data]
**Learning:** In `state-engine.ts`, fetching associated relational data (like photos for posts) was done by running `.filter()` on an entire array of relational objects inside a `.map()` block across all rows. For large datasets, this N+1 in-memory problem creates an O(N^2) complexity that blocks the single-threaded Node.js event loop.
**Action:** When mapping relational rows to nested objects, pre-group the relational arrays using a `Map` structure with the foreign key (e.g., `post_id`) as the key to convert the operation into an O(N) lookup.
## 2026-05-11 - [N+1 Query in Collection Mapping]
**Learning:** The admin endpoint '/api/local/admin/data' called `getProfile()` (which issues a DB query) inside a `.map()` iteration over all members, creating an N+1 query vulnerability.
**Action:** Always use batched fetches (e.g. `getAllProfiles()`) rather than iterating single-record fetches over collections.
