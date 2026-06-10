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


## 2026-06-08 - [O(N) Array Filtering for Indexed Primary Key Lookups]
**Learning:** In the federation protocol and HTTPS server HTTP handlers, searching for individual member properties was historically performed using `getMembers().find(...)`. This fetched all members from SQLite into memory as an array and iterated over them for a single record lookup, wasting memory and creating O(N) complexity for something that should be an O(1) primary key query.
**Action:** Replaced instances of `getMembers().find(m => m.publicKey === ...)` with `getMember(publicKey)` which executes a direct, fast O(1) indexed SQL lookup on the database.
