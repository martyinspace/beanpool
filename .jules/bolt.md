## 2026-05-11 - [O(N^2) Array Filtering on Relational Data]
**Learning:** In `state-engine.ts`, fetching associated relational data (like photos for posts) was done by running `.filter()` on an entire array of relational objects inside a `.map()` block across all rows. For large datasets, this N+1 in-memory problem creates an O(N^2) complexity that blocks the single-threaded Node.js event loop.
**Action:** When mapping relational rows to nested objects, pre-group the relational arrays using a `Map` structure with the foreign key (e.g., `post_id`) as the key to convert the operation into an O(N) lookup.
## 2026-05-17 - [O(N^2) Array Filtering in Recursive Tree Construction]
**Learning:** In `state-engine.ts`, building the invite tree involved recursively filtering the entire `allMembers` array to find children at each node, resulting in an O(N^2) complexity. This blocked the event loop for large datasets.
**Action:** When constructing hierarchical trees from flat arrays, pre-group the items using a `Map` structure with the parent key (e.g., `invitedBy`) as the key. This converts the repeated linear searches into O(1) lookups, reducing the overall complexity to O(N).
