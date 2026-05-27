## 2026-05-11 - [O(N^2) Array Filtering on Relational Data]
**Learning:** In `state-engine.ts`, fetching associated relational data (like photos for posts) was done by running `.filter()` on an entire array of relational objects inside a `.map()` block across all rows. For large datasets, this N+1 in-memory problem creates an O(N^2) complexity that blocks the single-threaded Node.js event loop.
**Action:** When mapping relational rows to nested objects, pre-group the relational arrays using a `Map` structure with the foreign key (e.g., `post_id`) as the key to convert the operation into an O(N) lookup.
## 2026-05-18 - [O(N^2) Nested Filtering in Invite Tree Generation]
**Learning:** In `apps/server/src/state-engine.ts`, the `getInviteTree` function previously filtered the entire `allMembers` array for every node recursively (`O(N^2)` complexity). This is a known performance anti-pattern in the codebase that can block the Node.js event loop with large datasets.
**Action:** When performing nested array associations (like building trees from flat lists), pre-compute a lookup `Map` grouping items by their parent key (e.g. `invitedBy`) to convert nested filtering into `O(N)` key lookups.

## 2026-05-21 - [N+1 Query on Profile Endpoint]
**Learning:** The administrative data endpoint `/api/local/admin/data` previously fetched all member profiles using `.map(m => getProfile(m.publicKey))` after retrieving all members. This triggered N+1 separate SQLite queries. For large member registries, this results in significant database roundtrips and blocks the Node.js event loop.
**Action:** Implemented `getAllProfiles()` in `state-engine.ts`, which fetches all member profiles via a single batch query (`SELECT * FROM members`) and applies contact visibility settings in-memory. Replaced the N+1 loop with this batch helper in the admin data controller.

## 2026-05-21 - [Array Allocations and O(N) Database Lookups in Social Recovery]
**Learning:** In `createRecoveryRequest()`, validating guardian guess callsigns was previously done by mapping the guardian public keys to member profiles, filtering out empty profiles, and then executing `.some()` against the resulting array. This led to unnecessary allocations (`.map()` and `.filter()`) and executed database lookups for all guardians even if a match was found in the first element.
**Action:** Refactored the lookups using `guardians.some(...)` with hoisted, pre-normalized callsign comparison. This enables short-circuiting database reads and completely avoids intermediate array allocations.


## 2024-05-18 - [Pagination Find Anti-Pattern]
**Learning:** Found instances where \`getMarketplaceTransactions(pubkey).find(t => t.id === id)\` was used to retrieve a specific transaction by ID. This is a severe anti-pattern because the \`getMarketplaceTransactions\` query inherently has a \`LIMIT 50\` applied. If the desired transaction has fallen out of the top 50, it silently fails and returns undefined causing bugs and crashing. Additionally, fetching and constructing 50 models only to pick 1 is massively inefficient (O(N) data load for an O(1) target).
**Action:** Always fetch the target by its specific primary key directly from the database instead of applying \`.find()\` over a collection getter that could be paginated.
