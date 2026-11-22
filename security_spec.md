# Security Specification — 3AS Single-Account Study Competition (Firestore Rules)

## 1. Data Invariants
1. **Strict Single-Account Ownership:** A user (`request.auth.uid`) can only create or update their own `/users/{userId}/private/profile` and their own `/participants/{participantId}` where `participantId == request.auth.uid` and `incoming().uid == request.auth.uid`. Nobody can edit another student's progress or points.
2. **PII Isolation:** Verified email addresses live exclusively in `/users/{userId}/private/profile`, readable and writable only by `userId == request.auth.uid`. `/participants/{participantId}` documents contain zero emails or phone numbers.
3. **Leaderboard Visibility Gate (`allow list`):** Listing `/participants` is explicitly gated on `resource.data.visibility == 'public_competition'` for verified signed-in users (`email_verified == true`), with zero `get()` lookups in `list`.
4. **Immutable Identity & Server Timestamps:** `uid`, `visibility`, and `createdAt` cannot be mutated after creation. `createdAt` and `updatedAt` must equal `request.time`.
5. **Verified Accounts Only:** Unauthenticated or unverified-email requests (`email_verified != true`) are rejected on all operations.
6. **Bounded Maps & Lists:** All study progress maps (`completedStages`, `lessonReviews`, `completedMorningPackets`, `completedBlocks`, `masteredCards`, `cardReviews`, `solvedExercises`) and arrays (`activityDates`, `recentDuels`, `recentActivities`) have strict size caps.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Leaderboard Read:** Unauthenticated `get(/participants/farouk_uid)` or `list(/participants)`.
2. **Unverified Email Spoof:** Authenticated user with `email_verified: false` attempting `create` on `/participants/farouk_uid`.
3. **Cross-Account Progress Tampering:** User A (`farouk_uid`) attempting `update` on `/participants/saeed_uid`.
4. **UID Spoofing on Participant Create:** User A attempting `create` at `/participants/farouk_uid` with payload `{ uid: 'saeed_uid' }`.
5. **Path vs Auth UID Mismatch:** User A attempting `create` at `/participants/someone_else_uid`.
6. **Shadow Ghost Field Injection:** User A sending `{ ...validParticipant, isAdmin: true }` on `/participants/farouk_uid`.
7. **PII Blanket Scraping:** User B (`saeed_uid`) attempting `get` on `/users/farouk_uid/private/profile`.
8. **Invalid Visibility List Bypass:** Attempting `create` on `/participants/farouk_uid` with `visibility: 'private_admin'` or bypassing `visibility == 'public_competition'`.
9. **ID Poisoning:** User A attempting `create` on `/participants/invalid$id!` or a 200-char ID.
10. **Immutable UID / Visibility Mutation:** User A attempting `update` on `/participants/farouk_uid` changing `uid` or `visibility`.
11. **Client Timestamp Forgery:** User A attempting `create` or `update` with `updatedAt: new Date(0)` instead of `serverTimestamp()`.
12. **Unbounded Array Resource Poisoning:** User A sending `activityDates` with 80 strings (`> 40` cap) or `recentActivities` with 50 items (`> 25` cap).
