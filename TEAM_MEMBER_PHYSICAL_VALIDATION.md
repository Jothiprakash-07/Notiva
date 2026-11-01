# Team physical and API validation after disk/MongoDB fix

Date: 2026-10-31 (Asia/Calcutta).

Team validation: PASS. Environment precheck caveat: the existing authenticated Owner session worked throughout, but a fresh password sign-in on Vivo was not performed because no Owner credentials were supplied. Login/session regression tests passed. This report does not count a fresh physical login as validated.

| # | Requested result | Evidence and outcome |
| --- | --- | --- |
| 1 | Environment health | C: initially 8,108,523,520 bytes free (7.55 GiB), approximately 6.81 GiB near completion. MongoDB service Running and port 27017 listening. Backend health returned success on 5000 and completed live database mutations. Metro listening on 8081; existing development client running on Vivo V2432, serial 10MF82FB1R0007D. Vivo loaded and mutated server data over LAN. Initial USB disconnection was resolved by reconnecting. Existing Owner session healthy; fresh password sign-in not exercised. |
| 2 | Owner team creation | PASS on Vivo: Organization → Teams → Create Team created Sales and Development in VivoOrgVerified20261030. One active record per name, correct organization and Owner creator. Switched from VivoOrgClean20261030 because that organization had no approved Member. |
| 3 | Duplicate-name protection | PASS: lowercase sales rejected on Vivo with “An active team already uses this name.” Live API sales and SALES returned 409 TEAM_NAME_TAKEN; no duplicate records. |
| 4 | Team edit | PASS on Vivo: Development → Development Team retained ID 6ae5bea8d716edfc45884b07. The team initially had no memberships. After assignment, a further live name update preserved the membership document exactly. |
| 5 | Member assignment | PASS on Vivo: approved Member join_vivo_62752367 assigned to Sales once. Database confirmed one logical row, correct organization, actor, and timestamp. Original organization membership and personal data unchanged. |
| 6 | Multiple-team membership | PASS on Vivo and MongoDB: same Member assigned to Development Team while Sales remained active. Repeated Development assignment through API preserved the same row and original audit fields. |
| 7 | Member-team navigation | PASS: Organization Members → View teams: Vivo Join Second User showed Sales and Development Team exactly once. A pre-existing Admin Permission Validation team was also present and preserved. |
| 8 | Remove from one team | PASS on Vivo: Sales removal marked only its row removed; Development Team remained active. Final Member teams screen and API excluded Sales. Organization membership and personal data unchanged. |
| 9 | Admin permission result | PASS via permitted live API fallback, using an existing disposable approval-test identity and its active session. Both permissions allowed create/edit/assign/remove. Removing manage_teams immediately denied create/edit with 403 while assignment still worked. Removing assign_team_members immediately denied assign/remove with 403. Same access token used throughout; no relogin. Identity restored to its original Member role and permissions through Owner API; role-change audit timestamps remain as expected. |
| 10 | Self-assignment protection | PASS: normal approved Member self-assignment and self-removal API requests returned 403. Member controls also covered in frontend regression. |
| 11 | Cross-org protection | PASS: Member access to foreign organization team/list returned 403 without team data. Mixed organization/team paths for reads, edit, assign, and directory returned 404 without team/member data. Assignment of a user belonging only to another organization returned 400. Mixed organizationId creation payload returned 400. Foreign probe team archived after validation. |
| 12 | Archive result | PASS on Vivo with explicit Confirm archive: disposable team archived and removed from active list. Its active link became removed with Owner actor/time; historical row and team retained. New assignment and edit returned 409. Organization member and personal data preserved. |
| 13 | MongoDB validation | PASS: Team and TeamMember IDs/organization IDs match, unique Sales and Development Team records, no duplicate logical links. Sales link removed, Development link active, disposable team archived with removal history. Existing historical Admin team/link preserved. |
| 14 | Bugs found/fixed | No product bug found; no product implementation changed. USB interruption was environmental. One archive assertion initially ran before the asynchronous device request completed; settled UI/database and rerun passed. |
| 15 | Files changed this resumed task | TEAM_MEMBER_PHYSICAL_VALIDATION.md updated; backend/team-physical-validation.mjs added. Ignored .build-tools/team-physical-result.json and three PNG evidence files generated. All prior uncommitted work preserved. |
| 16 | Tests passed | 63 backend checks in teams.test.js, organizations.test.js, organizationCreation.test.js; 10 sessions.test.js checks; test-team-ui.cjs; test-admin-permissions-ui.cjs; test-organization-join-ui.cjs; TypeScript; lint with zero errors and five pre-existing warnings; 32 live API assertions plus MongoDB snapshot/final invariants; validation script syntax check. |
| 17 | Native changed? | No in this resumed task. Pre-existing native changes in the workspace were untouched. |
| 18 | APK rebuild required? | No for this validation task; existing development client successfully exercised the JS Team UI. This does not assess rebuild requirements of unrelated pre-existing changes. |

## Database identities and retained state

- Organization: VivoOrgVerified20261030, 6ae489400c5c35d54687c7e0.
- Owner: 6ae487760edd352ea30d0897.
- Approved Member: 6ae48b400fbeb45bb61a6e0b.
- Sales: 6ae5be98d716edfc45884b06, active; approved Member link removed with audit history.
- Development Team: 6ae5bea8d716edfc45884b07, active; approved Member link active.
- Disposable Admin/archive team: 6ae5c02f0b57481498e37ad2, archived; link removed and history preserved.
- Foreign-org probe team: archived; its ID is recorded in the ignored JSON evidence.
- Pre-existing Admin Permission Validation team and membership remain active.

The approved Member's full User document and personal items were hashed before mutations and compared afterward; both hashes match. Its full OrganizationMember document also matches the baseline. No account deletion, personal-data editing, session clearing, password resetting, or direct database permission mutation was performed.

## Evidence and implementation notes

- .build-tools/team-physical-result.json: baseline hashes, organization membership baseline, database snapshots, 32 live HTTP checks, final state. Access tokens are not written to this evidence.
- .build-tools/team-member-navigation.png: both Sales and Development Team shown once before removal.
- .build-tools/team-archive-result.png: successful archive and active Teams list.
- .build-tools/team-member-final.png: final Member teams list retaining Development Team, excluding Sales and archived disposable team.
- backend/team-physical-validation.mjs: one-off fixture-specific validation harness. Run from backend with baseline, snapshot, security, archive-check, or final phases. The security phase mutates disposable live test state and should not be rerun casually. API fallback signs short-lived access tokens for existing, unrevoked database sessions, following the prior Admin validation method; it does not prove password login.

Expo SDK 54 source documentation was read before writing the validation harness. The requested public version URL redirects to latest; the sdk-54 versioned repository source was used to resolve that redirect.

No Git commit. No Git push.
