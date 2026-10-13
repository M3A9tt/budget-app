import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{moscowDate,periodSummary} from '../server/worker.js';
test('Telegram and report dates use Moscow across UTC midnight',()=>assert.equal(moscowDate(new Date('2026-10-12T22:00:00Z')),'2026-10-13'));
test('API fails closed without a token or secrets',async()=>{const r=await worker.fetch(new Request('https://example.org/api/v1/state'),{});assert.equal(r.status,401);});
test('Telegram webhook fails closed without its secret',async()=>{const r=await worker.fetch(new Request('https://example.org/telegram/webhook',{method:'POST',body:'{}'}),{});assert.equal(r.status,401);});
test('Reports separate lunches and real expenses',()=>{const text=periodSummary({transactions:[{type:'expense',cat:'food',date:'2026-10-12',amount:100,amountRub:100},{type:'lunch',cat:'lunch',date:'2026-10-12',amount:379,amountRub:379}],accounts:[{balance:500,currency:'RUB'}],rates:{RUB:1},customCats:[]},'2026-10-12','2026-10-12','Итог');assert.match(text,/Расходы: 100 ₽/);assert.match(text,/компании: 379 ₽/);assert.match(text,/счетах: 500 ₽/);});
