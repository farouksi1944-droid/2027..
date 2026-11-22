# Security Specification — 3AS Study Competition (Firestore Rules)

## 1. Data Invariants
1. **Strict Account Ownership:** A user (`request.auth.uid`) can only create or update their own `/users/{userId}/private/profile` and their own `/rooms/{roomCode}/members/{memberId}` where `memberId == request.auth.uid` and `incoming().uid == request.auth.uid`. Farouk can never modify Saeed's progress, and Saeed can never modify Farouk's progress.
2. **PII Isolation:** Verified email addresses live exclusively in `/users/{userId}/private/profile`, readable and writable only by `userId == request.auth.uid`. Room and member documents contain zero emails or phone numbers.
3. **Two-Competitor Room Cap & Membership Gate:** A room `/rooms/{roomCode}` holds at most two slots (`player1Uid` and `player2Uid`). Once `player2Uid != ''`, a third stranger cannot read, join, or read `/members/{memberId}` under that room.
4. **Master Gate on Subcollections:** Reads (`get`) and writes (`create`, `update`) on `/rooms/{roomCode}/members/{memberId}` fetch parent `/rooms/{roomCode}` to confirm `request.auth.uid == room.player1Uid || request.auth.uid == room.player2Uid`.
5. **Immutable Identity & Server Timestamps:** `uid`, `roomCode`, `role`, `ownerId`, and `createdAt` cannot be mutated after creation. `createdAt` and `updatedAt` must equal `request.time`.
6. **Verified Accounts Only:** Unauthenticated or unverified-email requests (`email_verified != true`) are rejected on all operations.
7. **Bounded Scientific Exercise Progress:** `solvedExercises` is a map capped at 100 entries inside each member's own document, strictly writable only by `memberId == request.auth.uid`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Room Read:** Unauthenticated `get(/rooms/BAC-1001)`.
2. **Unverified Email Spoof:** Authenticated user with `email_verified: false` attempting `create` on `/rooms/BAC-1001`.
3. **Cross-Account Progress Tampering:** User A (`faroukUid`) attempting `update` on `/rooms/BAC-1001/members/{saeedUid}`.
4. **UID Spoofing on Member Create:** User A attempting `create` at `/rooms/BAC-1001/members/{faroukUid}` with payload `{ uid: saeedUid }`.
5. **Third-Stranger Room Intrusion:** User C attempting `get` or `update` (join) on `/rooms/BAC-1001` when `player2Uid` is already claimed by Saeed.
6. **Shadow Ghost Field Injection:** User A sending `{ ...validMember, isAdmin: true }` on `/rooms/BAC-1001/members/{faroukUid}`.
7. **PII Blanket Scraping:** User B (`saeedUid`) attempting `get` on `/users/{faroukUid}/private/profile`.
8. **Blanket Room Listing:** Authenticated user attempting `list(/rooms)` without filtering by `player1Uid == uid` or `player2Uid == uid`.
9. **ID Poisoning:** User A attempting `create` on `/rooms/invalid$room*id!!` or a 200-char room ID.
10. **Role Escalation / Mutation:** User B (`player2`) attempting `update` on `/rooms/BAC-1001/members/{saeedUid}` changing `role` from `'player2'` to `'player1'`.
11. **Client Timestamp Forgery:** User A attempting `create` or `update` with `updatedAt: new Date(0)` instead of `serverTimestamp()`.
12. **Unbounded Array Resource Poisoning:** User A sending `activityDates` with 100 strings (`> 40` cap) or `recentActivities` with 50 items (`> 20` cap).
