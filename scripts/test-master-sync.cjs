const assert = require('node:assert/strict');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
let now = new Date(2026, 0, 1, 9).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
async function run() {
 const h = fixture('android', Clock); h.online(true);
 await h.storage().saveItem(makeItem({ id: 'master', repeat: 'daily', startAt: new Clock(2026, 0, 1, 12).toISOString() }));
 await h.sync().syncItems();
 for(let day=1;day<=365;day++) {
   now = new Clock(2026, 0, 1+day, 9).getTime();
   h.online(false); await h.storage().getItems();
   let state=await h.queue().readItemSyncState('A');
   assert.equal(state.items.length,1); assert.ok(state.queue.every(op=>op.type==='update'));
   h.online(true); await h.sync().syncItems();
   assert.equal(h.rows.size,1); assert.equal((await h.queue().readItemSyncState('A')).queue.length,0);
 }
 assert.equal(h.calls.filter(call=>call.method==='POST').length,1);
 const local=(await h.storage().getItems())[0], r=h.load('utils/dailyRecurrence.ts');
 const remote={...local,completed:true,status:'Done',completionNote:'Phone B',completedAt:new Clock().toISOString()};
 const merged=r.mergeSeriesState(local,remote);
 assert.equal(merged.completed,true); assert.equal(merged.completionNote,'Phone B');
 assert.equal(r.mergeSeriesState(local,{...remote,dailySeries:{...remote.dailySeries,template:{...remote.dailySeries.template,title:'Different rule'}}}),undefined);
 await assert.rejects(h.storage().toggleComplete('master','stale dialog',new Clock(2026,0,1,12).toISOString()));
 h.online(false);
 const stop = h.load('services/itemSyncRuntime.ts').startItemSyncRuntime();
 for(let n=0;n<8;n++) await new Promise(resolve=>setImmediate(resolve));
 const callsBefore = h.calls.length;
 h.foreground('background'); now += 86400000; h.foreground('active');
 for(let n=0;n<12;n++) await new Promise(resolve=>setImmediate(resolve));
 const resumed=(await h.queue().readItemSyncState('A')).items[0];
 assert.equal(new Date(resumed.startAt).getDate(),new Clock().getDate());
 assert.equal(h.calls.length,callsBefore,'offline foreground activation makes no network request');
 stop();
 h.select('B'); assert.equal((await h.storage().getItems()).length,0);
 console.log('PASS master sync: 365 offline rollovers/reconnects, one document, one POST, update-only outbox, merge, stale completion, offline foreground and account isolation');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
