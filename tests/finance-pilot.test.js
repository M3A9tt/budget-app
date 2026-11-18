import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptFields,receiptDuplicate} from '../src/receipt-fields.js';
import {assistantPrompt,financeAnalysis,verifyAssistantSelection} from '../src/finance-assistant.js';
import {cloudFinanceAssistant,pilotFeatures} from '../server/finance-assistant.js';
import {spendingReport} from '../src/analytics-report.js';
import {forecast} from '../src/finance-tools.js';
import {createPlanned} from '../src/planned-operations.js';
import {moveDate} from '../src/finance-events.js';
import {EMPTY,todayMoscow} from '../src/mini-model.js';

const today='2026-11-18';
const account={id:'private-id',name:'Название личного счёта',currency:'RUB',balance:1000.01};
const fixture=()=>({...structuredClone(EMPTY),accounts:[account,{id:'reserve',name:'Резерв',currency:'USD',balance:10000,accType:'savings'}]});

test('receipt review recognizes only plausible total lines and leaves ambiguous fields for review',()=>{
  const fields=receiptFields('ООО ПРОДУКТЫ\n18.11.2026\nНДС 199,99\nИТОГО К ОПЛАТЕ: 1 200,05 руб.\nНАЛИЧНЫМИ 2 000,00\nСДАЧА 799,95');
  assert.deepEqual(fields,{totals:['1200.05'],dates:[today],currency:'RUB',merchant:'ООО ПРОДУКТЫ'});
  const ambiguous=receiptFields('Merchant: Bakery\n2026-11-18\n2026-11-19\nTOTAL TAX: 10.00 USD\nAMOUNT DUE:\n123.45 USD\nTOTAL 234.56 EUR');
  assert.deepEqual(ambiguous,{totals:['123.45','234.56'],dates:[today,'2026-11-19'],currency:'',merchant:'Bakery'});
  assert.deepEqual(receiptFields('VAT 20.00\n30.02.2026'),{totals:[],dates:[],currency:'',merchant:''});
  const tx={type:'expense',cat:'food',date:today,amount:1200.05,currency:'RUB'};
  const candidate={date:today,amount:'1 200,05',currency:'RUB'};
  assert.equal(receiptDuplicate([tx],candidate),true);
  assert.equal(receiptDuplicate([{...tx,type:'income'}],candidate),false);
  assert.equal(receiptDuplicate([tx],{...candidate,currency:'USD'}),false);
});

test('assistant spending reconciles against the selected report and omits private identifiers from the prompt',()=>{
  const data=fixture(),range={period:'month',accountId:account.id};
  data.transactions=[
    {id:'txn',type:'expense',cat:'food',date:today,amount:10,currency:'USD',amountRub:910.25,accountId:account.id,note:'Секретный комментарий'},
    {id:'old',type:'expense',cat:'food',date:'2026-10-09',amount:500.12,currency:'RUB',accountId:account.id},
    {id:'lunch',type:'lunch',cat:'lunch',date:today,amount:500,currency:'RUB',accountId:account.id}
  ];
  const report=spendingReport(data,today,range);
  const analysis=financeAnalysis(data,today,{mode:'spending',range});
  assert.deepEqual(analysis.facts.find(fact=>fact.id==='spent'),{id:'spent',amount:91025,count:report.count});
  assert.deepEqual(analysis.facts.find(fact=>fact.id==='comparison'),{id:'comparison',amount:41013,previous:50012});
  const prompt=JSON.stringify(assistantPrompt(analysis));
  for(const privateData of [account.id,account.name,'Секретный комментарий','2026-11-18'])assert.ok(!prompt.includes(privateData));
  assert.deepEqual(verifyAssistantSelection('{"ids":["comparison","category"]}',analysis),['comparison','category']);
  for(const response of [{ids:['safe']},{ids:['category']},{ids:['spent','spent']},{ids:['spent'],total:500},'invented'])assert.equal(verifyAssistantSelection(response,analysis),null);
  const empty=financeAnalysis(fixture(),today,{mode:'spending'});
  assert.equal(empty.comparisonAvailable,false);
  assert.equal(verifyAssistantSelection({ids:['comparison']},empty),null);
});

test('purchase scenario projects each day in cents without using reserves or committing a transaction',()=>{
  const plan=(data,id,type,amount,startDate,variable=false)=>createPlanned(data,{id,name:id,type,amount,startDate,accountId:account.id,frequency:'once',variable});
  let data=plan(fixture(),'due','expense','350.02',today);
  data=plan(data,'salary','income','500.03',moveDate(today,5));
  data=plan(data,'unknown','expense','1.00',moveDate(today,10),true);
  const original=structuredClone(data),base=forecast(data,today);
  const analyze=(amount,date)=>financeAnalysis(data,today,{mode:'purchase',amount,date});
  const now=analyze('700.01',today);
  assert.equal(now.baselineShortfall,null);
  assert.equal(now.safe.balanceOnPurchase,-5002);
  assert.equal(now.safe.minimum,-5002);
  assert.equal(now.safe.shortfall,today);
  assert.equal(now.expected.shortfall,today);
  assert.equal(now.unknown,1);
  const end=analyze('700.01',moveDate(today,30));
  assert.equal(end.safe.shortfall,moveDate(today,30));
  assert.equal(end.safe.minimum,Math.round(base.points.at(-1).balance*100)-70001);
  assert.equal(end.expected.shortfall,null);
  assert.equal(end.expected.balanceOnPurchase,45001);
  assert.throws(()=>analyze('0',today),/сумму/);
  assert.throws(()=>analyze('10.01',moveDate(today,31)),/30 дней/);
  assert.deepEqual(data,original);
});

test('cloud pilot requires verified Free configuration, consent and the current financial revision',async()=>{
  const data=fixture(),calls=[];
  const env={
    TELEGRAM_OWNER_ID:'1',FINANCE_ASSISTANT_PILOT:'on',FINANCE_ASSISTANT_WORKERS_FREE:'confirmed',
    AI:{run:async(model,input)=>{calls.push({model,input});return {response:{ids:['safe','pace']}};}}
  };
  const readState=async()=>({revision:7,data});
  const input={consent:true,revision:7,mode:'purchase',amount:'50.01',date:todayMoscow(),asOf:todayMoscow()};
  assert.deepEqual(pilotFeatures(env,'2'),{receipt:false,assistant:false,cloud:false});
  await assert.rejects(cloudFinanceAssistant({...env,FINANCE_ASSISTANT_WORKERS_FREE:''},'1',input,readState),{status:503});
  await assert.rejects(cloudFinanceAssistant(env,'1',{...input,consent:false},readState),{status:400});
  await assert.rejects(cloudFinanceAssistant(env,'1',{...input,revision:6},readState),{status:409});
  assert.equal(calls.length,0);
  assert.deepEqual(await cloudFinanceAssistant(env,'1',input,readState),{ids:['safe','pace']});
  assert.equal(calls.length,1);
  assert.ok(!JSON.stringify(calls).includes(account.name));
  env.AI.run=async()=>{throw Object.assign(Error('quota'),{status:429});};
  await assert.rejects(cloudFinanceAssistant(env,'1',input,readState),{status:503});
});

test('Worker rejects mismatched browser profiles and gives consented analysis a read-only financial snapshot',async()=>{
  const {default:worker}=await import('../server/worker.js');
  const selects=[];
  const env={
    TELEGRAM_OWNER_ID:'1',FINANCE_ASSISTANT_PILOT:'on',FINANCE_ASSISTANT_WORKERS_FREE:'confirmed',
    DB:{prepare(sql){
      assert.match(sql,/^SELECT /);
      return {bind:(...args)=>({first:async()=>{
        selects.push({sql,args});
        return sql.includes('user_web_sessions')?{user_id:'1'}:{revision:7,data:JSON.stringify(fixture())};
      }})};
    }},
    AI:{run:async()=>({response:{ids:['safe']}})}
  };
  const run=(profile,consent,origin='https://example.org')=>worker.fetch(new Request('https://example.org/api/v1/finance-assistant',{
    method:'POST',headers:{Cookie:'__Host-budget_session=fictional',Origin:origin,'X-Budget-Profile':profile},
    body:JSON.stringify({consent,revision:7,mode:'purchase',amount:'50.01',date:todayMoscow(),asOf:todayMoscow()})
  }),env);
  assert.equal((await run('2',true)).status,403);
  assert.equal((await run('1',true,'https://different.example.org')).status,403);
  assert.equal((await run('1',false)).status,400);
  assert.equal(selects.filter(row=>row.sql.includes('user_finance_state')).length,0);
  const response=await run('1',true);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{ids:['safe']});
  assert.deepEqual(selects.filter(row=>row.sql.includes('user_finance_state')).flatMap(row=>row.args),['1']);
});

test('OCR leaves tax, change, refunds and unreadable totals for manual review',()=>{
  for(const tail of ['НДС 12,34 RUB','СДАЧА 12,34 RUB','КАРТА 12,34 RUB','- 12,34 RUB','−12,34 RUB','(12,34) RUB','12,345 RUB','0,00 RUB','1000000000000,01 RUB']) {
    assert.deepEqual(receiptFields('ИТОГО\n'+tail).totals,[],tail);
  }
  for(const tail of ['−12,34 RUB','(12,34) RUB','- 12,34 RUB']) {
    assert.deepEqual(receiptFields('ИТОГО '+tail).totals,[],tail);
  }
  assert.deepEqual(receiptFields('ИТОГО ВОЗВРАТА 12,34 RUB\nTOTAL REFUND 12.34 EUR').totals,[]);
  assert.deepEqual(receiptFields('ИТОГО\n1 234,56 ₽\n29.02.2024\n29.02.2025'),{
    totals:['1234.56'],dates:['2024-02-29'],currency:'RUB',merchant:''
  });
  assert.deepEqual(receiptFields('TOTAL 99.99 EUR\nTOTAL TAX 1.00 USD\nTOTAL 99.99 EUR').totals,['99.99']);
});

test('purchase boundary preserves exact cents and rejects invalid values without changing the profile',()=>{
  const date='2028-02-29',data=fixture();
  data.accounts=[{...account,balance:0.01}];
  const original=structuredClone(data);
  const analyze=(amount,when=date)=>financeAnalysis(data,date,{mode:'purchase',amount,date:when});
  assert.equal(analyze('0,01').safe.minimum,0);
  assert.equal(analyze('0.01').safe.shortfall,null);
  assert.equal(analyze('0.02').safe.minimum,-1);
  assert.equal(analyze('0.02',moveDate(date,30)).safe.shortfall,moveDate(date,30));
  for(const amount of ['-0','-0.01','0.001','1e3','∞','NaN','1,2.3','１００','1000000000000.01',null]) {
    assert.throws(()=>analyze(amount),/сумму/);
  }
  for(const when of ['2028-02-30','2028-02-28','2028-3-01','2028-03-01T00:00:00Z',moveDate(date,31)]) {
    assert.throws(()=>analyze('1',when),/30 дней/);
  }
  assert.deepEqual(data,original);
});

test('receipt supports common foreign currencies and grouping without guessing malformed totals',()=>{
  for(const [line,amount,currency] of [
    ['ИТОГО 1.234,56 ₾','1234.56','GEL'],
    ['TOTAL:\n1,234.56 GEL','1234.56','GEL'],
    ['TOTAL 1,234,567.89 USD','1234567.89','USD'],
    ['TOTAL 123.45 ₸','123.45','KZT'],
    ['TOTAL 123.45 ֏','123.45','AMD'],
    ['TOTAL 123.45 BYN','123.45','BYN'],
  ])assert.deepEqual(receiptFields(line),{totals:[amount],dates:[],currency,merchant:''});
  for(const line of ['TOTAL 12 34.56 USD','TOTAL .123.45 USD','TOTAL 1,234,56 USD','TOTAL 1,23.45 USD']) {
    assert.deepEqual(receiptFields(line).totals,[],line);
  }
  const mixed=receiptFields('TOTAL 12.34 USD / 56.78 EUR');
  assert.deepEqual(mixed.totals,['12.34','56.78']);
  assert.equal(mixed.currency,'');
});

test('purchase calculation distinguishes existing and accelerated shortfalls',()=>{
  const dueDate=moveDate(today,5);
  const data=createPlanned(fixture(),{
    id:'due',name:'Платёж',type:'expense',amount:'1100',startDate:dueDate,accountId:account.id,frequency:'once'
  });
  const later=financeAnalysis(data,today,{mode:'purchase',amount:'50',date:moveDate(today,7)});
  assert.equal(later.baselineShortfall,dueDate);
  assert.equal(later.safe.shortfall,dueDate);
  const now=financeAnalysis(data,today,{mode:'purchase',amount:'1050',date:today});
  assert.equal(now.baselineShortfall,dueDate);
  assert.equal(now.safe.shortfall,today);
});

test('model validator rejects malformed and inapplicable claims even on very small balances',()=>{
  const analysis=financeAnalysis(fixture(),today,{mode:'purchase',amount:'0.01',date:today});
  for(const response of [
    '{"ids":["safe"]} trailing','```json\n{"ids":["safe"]}\n```',' '.repeat(1001),
    'null','[{"ids":["safe"]}]',{ids:[]},{ids:['safe',null]},
    {ids:['safe','__proto__']},{ids:['safe','unknown']},{ids:['income']},
    {ids:['safe'],amount:1},{ids:'safe'}
  ])assert.equal(verifyAssistantSelection(response,analysis),null);
  assert.deepEqual(verifyAssistantSelection({ids:['safe','pace']},analysis),['safe','pace']);
});
