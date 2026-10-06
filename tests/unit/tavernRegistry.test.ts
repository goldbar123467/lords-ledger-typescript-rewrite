import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {BARD_STATE_COMMENTS,MARTA_MARKET_TIPS,MARTA_OFFERS,ALDRIC_TRAINING_OFFERS} from '../../src/data/tavern.ts';

test('all 28 Tavern initializers preserve baseline content with the exact-ledger predicate extension',()=>{
 const source=readFileSync(new URL('../../src/data/tavern.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const file=ts.createSourceFile('tavern.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),printer=ts.createPrinter();
 const entries:Array<[string,string]>=[];
 for(const node of file.statements)if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations){
  if(declaration.initializer){
   const name=declaration.name.getText(file);let initializer=printer.printNode(ts.EmitHint.Expression,declaration.initializer,file);
   if(name==='WALL_DYNAMIC_CONDITIONS'){
    // Only this predicate gains exact large-integer support; compare all remaining content verbatim.
    const extended='tavernLedgerAtLeast(s.tavern?.gambitTotalWins, 3)';assert.equal(initializer.split(extended).length-1,1);
    initializer=initializer.replace(extended,'(s.tavern?.gambitTotalWins ?? 0) >= 3');
   }
   entries.push([name,initializer]);
  }
 }
 assert.equal(entries.length,28);
 // Captured from e867a37 before conversion, including prose and callback bodies.
 assert.equal(createHash('sha256').update(JSON.stringify(entries)).digest('hex'),'e7448dbd42b73b7333269196a18523217601518dad054d97359d3fdb296fdc42');
});

test('historical narrative names and nullable advice fallbacks retain their runtime behavior',()=>{
 const state={denarii:100,food:100,population:100,garrison:5,turn:1};
 for(const name of ['school','market'] as const){
  const comment=BARD_STATE_COMMENTS.find(entry=>entry.text.startsWith(name==='school'?'A school!':'A market!'));assert.ok(comment);
  assert.equal(comment.condition(state),undefined);
  assert.equal(comment.condition({...state,buildings:[name]}),true);
  assert.equal(comment.condition({...state,buildings:[{type:name}]}),true);
  assert.equal(comment.condition({...state,buildings:['coal_pit']}),false);
 }
 const inventoryAdvice=MARTA_MARKET_TIPS[2];assert.ok(typeof inventoryAdvice==='function');
 assert.match(inventoryAdvice({inventory:null,inventoryCapacity:0}),/inventory is 0% full/);
 assert.match(inventoryAdvice({inventory:{grain:30},inventoryCapacity:300}),/inventory is 10% full/);
});

test('one-time storage and referral eligibility retain independent money and capacity boundaries',()=>{
 const storage=MARTA_OFFERS.find(offer=>offer.id==='storage_deal'),referral=ALDRIC_TRAINING_OFFERS.find(offer=>offer.id==='recruit_referral');assert.ok(storage&&referral);
 const state={denarii:50,population:100,garrison:5};
 assert.equal(storage.canAccept({...state,denarii:49}),false);assert.equal(storage.canAccept(state),true);
 assert.equal(storage.canAccept({...state,tavern:{martaStoragePurchased:true}}),false);
 assert.equal(referral.canAccept({...state,denarii:39}),false);assert.equal(referral.canAccept({...state,denarii:40}),true);
 assert.equal(referral.canAccept({...state,garrison:25}),false);
 assert.equal(referral.canAccept({...state,population:8}),false);
 assert.equal(referral.canAccept({...state,garrison:10,military:{garrison:{levy:0,menAtArms:10,knights:0}}}),false);
});
