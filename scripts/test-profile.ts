// Tests for the follow API and Updates aggregation against a mocked Supabase client.
// Run: npm test (wired into the test script)

import {
  amIFollowing,
  followUser,
  unfollowUser,
  fetchFollowCounts,
  fetchUpdates,
} from '../src/lib/profile';
import { _setSupabaseForTests } from '../src/lib/supabase';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}`);
    console.error('  expected:', expected);
    console.error('  actual:  ', actual);
  }
}
async function expectThrow(label: string, run: () => Promise<unknown>, match: RegExp) {
  try {
    await run();
    fail++;
    console.error(`FAIL ${label} — expected throw matching ${match}`);
  } catch (e: any) {
    if (match.test(e?.message ?? '')) pass++;
    else { fail++; console.error(`FAIL ${label} — wrong message: ${e?.message}`); }
  }
}

// --- Fluent fake-query builder ------------------------------------------------
// Each "query" is a thenable that resolves to whatever the registered handler
// returns. eq/in/order/limit/select are no-op chainables that just record
// filters for the handler.

type Op = 'select' | 'insert' | 'update' | 'delete';
type Filter = { col: string; op: 'eq' | 'in' | 'neq'; val: unknown };
interface QueryState {
  table: string;
  op: Op;
  filters: Filter[];
  payload?: unknown;
  single?: 'one' | 'maybe' | null;
}
type Handler = (state: QueryState) => { data: unknown; error: unknown };

function makeClient(opts: {
  user: { id: string } | null;
  handler: Handler;
  inserts?: QueryState[];
  deletes?: QueryState[];
}) {
  const tracker = { inserts: opts.inserts ?? [], deletes: opts.deletes ?? [] };
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from(table: string) {
      const state: QueryState = { table, op: 'select', filters: [], single: null };
      const builder: any = {
        select(_cols?: string) { state.op = state.op === 'insert' || state.op === 'update' ? state.op : 'select'; return builder; },
        insert(payload: unknown) { state.op = 'insert'; state.payload = payload; tracker.inserts.push(state); return runAsync(); },
        update(payload: unknown) { state.op = 'update'; state.payload = payload; return builder; },
        delete() { state.op = 'delete'; tracker.deletes.push(state); return builder; },
        eq(col: string, val: unknown) { state.filters.push({ col, op: 'eq', val }); return builder; },
        in(col: string, val: unknown) { state.filters.push({ col, op: 'in', val }); return builder; },
        neq(col: string, val: unknown) { state.filters.push({ col, op: 'neq', val }); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { state.single = 'maybe'; return runAsync(); },
        single() { state.single = 'one'; return runAsync(); },
        then(resolve: any, rej: any) { return runAsync().then(resolve, rej); },
      };
      function runAsync() {
        return Promise.resolve(opts.handler(state));
      }
      return builder;
    },
  } as any;
}

// --- amIFollowing -------------------------------------------------------------
{
  // Signed out → false, no query
  _setSupabaseForTests(makeClient({
    user: null,
    handler: () => { throw new Error('should not query when signed out'); },
  }));
  check('amIFollowing: signed out → false', await amIFollowing('target'), false);
}

{
  // Following exists → true
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: (s) => {
      check('amIFollowing: queries user_follows', s.table, 'user_follows');
      const fb = s.filters.find((f) => f.col === 'follower_id');
      const fe = s.filters.find((f) => f.col === 'followee_id');
      check('amIFollowing: filters by me', fb?.val, 'me');
      check('amIFollowing: filters by target', fe?.val, 'target');
      return { data: { follower_id: 'me' }, error: null };
    },
  }));
  check('amIFollowing: row found → true', await amIFollowing('target'), true);
}

{
  // No row → false
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: () => ({ data: null, error: null }),
  }));
  check('amIFollowing: no row → false', await amIFollowing('target'), false);
}

// --- followUser ---------------------------------------------------------------
{
  // Not signed in throws
  _setSupabaseForTests(makeClient({
    user: null,
    handler: () => ({ data: null, error: null }),
  }));
  await expectThrow('followUser: signed-out throws', () => followUser('target'), /sign in/i);
}

{
  // Self-follow throws
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: () => ({ data: null, error: null }),
  }));
  await expectThrow('followUser: self-follow throws', () => followUser('me'), /yourself/i);
}

{
  // Happy path inserts
  const inserts: QueryState[] = [];
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: () => ({ data: null, error: null }),
    inserts,
  }));
  await followUser('target');
  check('followUser: 1 insert performed', inserts.length, 1);
  check('followUser: insert payload', inserts[0]?.payload, { follower_id: 'me', followee_id: 'target' });
  check('followUser: insert table', inserts[0]?.table, 'user_follows');
}

{
  // Duplicate error is swallowed (idempotent)
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: () => ({ data: null, error: { message: 'duplicate key violates unique constraint' } }),
  }));
  let threw = false;
  try { await followUser('target'); } catch { threw = true; }
  check('followUser: duplicate is idempotent', threw, false);
}

{
  // Non-duplicate error rethrows
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: () => ({ data: null, error: { message: 'permission denied' } }),
  }));
  await expectThrow('followUser: other error rethrows', () => followUser('target'), /permission/);
}

// --- unfollowUser -------------------------------------------------------------
{
  // Signed out → no-op (returns void, doesn't throw)
  _setSupabaseForTests(makeClient({
    user: null,
    handler: () => { throw new Error('should not query when signed out'); },
  }));
  let threw = false;
  try { await unfollowUser('target'); } catch { threw = true; }
  check('unfollowUser: signed out no-op', threw, false);
}

{
  // Happy path delete
  const deletes: QueryState[] = [];
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: () => ({ data: null, error: null }),
    deletes,
  }));
  await unfollowUser('target');
  check('unfollowUser: 1 delete performed', deletes.length, 1);
  check('unfollowUser: delete table', deletes[0]?.table, 'user_follows');
  const fb = deletes[0]?.filters.find((f) => f.col === 'follower_id');
  const fe = deletes[0]?.filters.find((f) => f.col === 'followee_id');
  check('unfollowUser: filters by me', fb?.val, 'me');
  check('unfollowUser: filters by target', fe?.val, 'target');
}

// --- fetchFollowCounts --------------------------------------------------------
{
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: (s) => {
      check('fetchFollowCounts: reads profile_follow_counts', s.table, 'profile_follow_counts');
      return { data: { follower_count: 12, following_count: 7 }, error: null };
    },
  }));
  check('fetchFollowCounts: shape', await fetchFollowCounts('target'), { followers: 12, following: 7 });
}

{
  // Missing row → zeros
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: () => ({ data: null, error: null }),
  }));
  check('fetchFollowCounts: missing → zeros', await fetchFollowCounts('target'), { followers: 0, following: 0 });
}

// --- fetchUpdates -------------------------------------------------------------
{
  // Signed out → []
  _setSupabaseForTests(makeClient({
    user: null,
    handler: () => ({ data: null, error: null }),
  }));
  check('fetchUpdates: signed out → []', await fetchUpdates(), []);
}

{
  // With likes + followers + no following → 2 events, sorted desc
  const t0 = '2026-05-10T12:00:00Z';
  const t1 = '2026-05-12T12:00:00Z';
  _setSupabaseForTests(makeClient({
    user: { id: 'me' },
    handler: (s) => {
      if (s.table === 'song_likes') {
        return { data: [{
          liked_at: t0,
          user_id: 'fan',
          song: { id: 's1', title: 'My Song', artist: 'Me', owner_id: 'me' },
          profile: { display_name: 'Fan', handle: 'fan' },
        }], error: null };
      }
      if (s.table === 'user_follows' && s.filters.some((f) => f.col === 'followee_id')) {
        // recent new followers (filters by followee_id = me)
        return { data: [{
          followed_at: t1,
          follower: { id: 'newbie', display_name: 'New Friend', handle: 'newbie' },
        }], error: null };
      }
      // "recent songs from people I follow" → no one I follow
      return { data: [], error: null };
    },
  }));
  const events = await fetchUpdates();
  check('fetchUpdates: 2 events combined', events.length, 2);
  check('fetchUpdates: sorted desc (newest first)', events[0]?.kind, 'new_follower');
  check('fetchUpdates: second is like', events[1]?.kind, 'like_on_my_song');
  check('fetchUpdates: like carries song title', (events[1] as any)?.song?.title, 'My Song');
  check('fetchUpdates: follower actor handle', (events[0] as any)?.actor?.handle, 'newbie');
}

_setSupabaseForTests(null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
