import {test} from 'node:test';import assert from 'node:assert/strict';
import {SEED_REQUESTS,seedDemo} from '../public/seed.js';
import {FACTS} from '../src/domain.mjs';
import {cleanStories,buildSources} from '../src/town.mjs';

test('seedDemo: adds the demo requests once and never re-adds after the user removes them',()=>{
 const st={requests:[],measurements:[]};
 assert.equal(seedDemo(st),true);assert.equal(st.requests.length,SEED_REQUESTS.length);
 assert.equal(seedDemo(st),false);
 st.requests=[];assert.equal(seedDemo(st),false);assert.equal(st.requests.length,0);
});

test('seed: ids unique, the three listener requests exist, 2019 question stays unanswered',()=>{
 assert.equal(new Set(SEED_REQUESTS.map(r=>r.id)).size,SEED_REQUESTS.length);
 const q=SEED_REQUESTS.map(r=>r.question);
 assert.ok(q.includes('雨の日、提灯はどこで、どう準備すればいいですか？'));
 assert.ok(q.includes('当番の回り方と、祭りの準備に初めて参加するときの流れを知りたい'));
 const typhoon=SEED_REQUESTS.find(r=>r.question==='2019年に台風で中止したとき、誰がどう決めたの？');
 assert.equal(typhoon.status,'requested');assert.ok(!typhoon.card&&typhoon.turns.length===0);
});

test('seed: every stated fact points to a real human turn, and the rain memo has all 6 items',()=>{
 for(const r of SEED_REQUESTS.filter(r=>r.card)){
  const human=new Set(r.turns.filter(t=>t.role==='user').map(t=>t.id));
  for(const [k] of FACTS){const f=r.card.facts[k];if(f.status==='stated')assert.ok(f.sourceIds.length&&f.sourceIds.every(id=>human.has(id)),r.id+':'+k);else assert.equal(f.value,'未確認')}
  assert.ok(r.card.confirmedAt&&r.card.requestId===r.id);
 }
 const rain=SEED_REQUESTS.find(r=>r.id==='seed-1').card;
 assert.ok(FACTS.every(([k])=>rain.facts[k].status==='stated'));
 assert.match(rain.facts.when.value,/前日17時/);assert.match(rain.facts.where.value,/和室/);assert.match(rain.facts.contact.value,/田中はる/);
});

test('seed: confirmed stories become the first sources for the town answer',()=>{
 const stories=cleanStories(SEED_REQUESTS.filter(r=>r.card).map(r=>({requestId:r.id,speaker:'田中はる',title:r.card.title,confirmedAt:r.card.confirmedAt,facts:FACTS.map(([k])=>r.card.facts[k]).filter(f=>f.status==='stated').map(f=>({label:f.label,value:f.value}))})));
 assert.equal(stories.length,4);
 const s=buildSources({place:'青葉地区',stories});
 assert.deepEqual(s.slice(0,4).map(x=>x.citation.id),['card-seed-1','card-seed-2','card-seed-3','card-seed-4']);
 assert.match(s[0].text,/前日17時/);
 assert.ok(!/電話|[0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4}/.test(JSON.stringify(SEED_REQUESTS)),'no phone numbers in seed');
});
