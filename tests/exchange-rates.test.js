import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCbrRates} from '../server/exchange-rates.js';

const quote=(code,nominal,value)=>'<Valute ID="test"><CharCode>'+code+'</CharCode><Nominal>'+nominal+'</Nominal><Value>'+value+'</Value></Valute>';
test('Official exchange rates preserve the source date and normalize quoted currency lots',()=>{
 const result=parseCbrRates('<ValCurs Date="04.11.2026">'+quote('USD',1,'81,6699')+quote('EUR',1,'94,12')+quote('JPY',100,'51,7553')+'</ValCurs>');
 assert.equal(result.date,'2026-11-04');
 assert.equal(result.rates.RUB,1);
 assert.equal(result.rates.USD,81.6699);
 assert(Math.abs(result.rates.JPY-0.517553)<1e-10);
 assert.equal(result.source,'Банк России');
});
test('A partial or invalid provider response cannot become a current rate snapshot',()=>{
 assert.throws(()=>parseCbrRates('<html>Unavailable</html>'));
 assert.throws(()=>parseCbrRates('<ValCurs Date="04.11.2026">'+quote('USD',1,'81,6699')+'</ValCurs>'));
 assert.throws(()=>parseCbrRates('<ValCurs Date="04.11.2026">'+quote('USD',0,'81,6699')+quote('EUR',1,'94,12')+'</ValCurs>'));
});
