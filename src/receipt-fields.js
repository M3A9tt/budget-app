import {validDate} from './finance-tools.js';
import {parseMoney} from './ledger.js';
import {personalExpense} from './expense-groups.js';

const totalLabel=/^(?:ИТОГ(?:О)?(?:\s+К\s+ОПЛАТЕ)?|ВСЕГО\s+К\s+ОПЛАТЕ|(?:СУММА\s+)?К\s+ОПЛАТЕ|AMOUNT\s+(?:DUE|PAID)|GRAND\s+TOTAL|TOTAL)(?=$|[\s:*=₽0-9])/iu;
const numericToken=/(?<![\d.,])\d+(?:(?:[.,]|[ \u00a0\u202f]+)\d+)*(?![\d.,]|[ \u00a0\u202f]+\d)/gu;
const decimalAmount=/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)[.,]\d{2}$/u;
const groupedAmount=/^\d{1,3}([.,])\d{3}(?:\1\d{3})*([.,])\d{2}$/u;
const currencyMarkers={
  RUB:/₽|\bRUB\b|(?:^|\s)РУБ(?:Л[ЯЬЕЙ]*)?(?=$|[\s.])/iu,
  USD:/\bUSD\b|US\$/iu,
  EUR:/€|\bEUR\b/iu,
  GBP:/£|\bGBP\b/iu,
  CNY:/\bCNY\b/iu,
  TRY:/₺|\bTRY\b/iu,
  GEL:/₾|\bGEL\b/iu,
  KZT:/₸|\bKZT\b/iu,
  AMD:/֏|\bAMD\b/iu,
  BYN:/\bBYN\b/iu
};

function parseReceiptAmount(value) {
  if(decimalAmount.test(value))return parseMoney(value);
  const grouped=groupedAmount.exec(value);
  if(grouped&&grouped[1]!==grouped[2])return parseMoney(value.replaceAll(grouped[1],''));
  return NaN;
}

export function receiptFields(text) {
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const totals=new Set(),dates=new Set(),currencies=new Set();
  for(const [index,line] of lines.entries()) {
    const label=totalLabel.exec(line);
    if(label&&!/^(?:TOTAL\s+(?:TAX|VAT|BEFORE|REFUND)|ИТОГ(?:О)?\s+(?:НДС|НАЛОГ|ВОЗВРАТ))/iu.test(line)) {
      const inline=line.slice(label[0].length).trim();
      const continued=/^[:=*\s]*$/.test(inline);
      const tail=continued?lines[index+1]||'':inline;
      const markers=Object.entries(currencyMarkers).filter(([,marker])=>marker.test(tail));
      const bare=markers.reduce((value,[,marker])=>value.replace(marker,' '),tail).trim();
      let foundAmount=false;
      if(!/[-−–()]\s*\d|\d\s*\)/u.test(tail)) {
        const candidates=continued?[bare]:[...tail.matchAll(numericToken)].map(([token])=>token);
        for(const token of candidates) {
          const amount=parseReceiptAmount(token);
          if(Number.isFinite(amount)&&amount>0) {
            totals.add(amount.toFixed(2));
            foundAmount=true;
          }
        }
      }
      if(foundAmount)for(const [currency] of markers)currencies.add(currency);
    }
    for(const match of line.matchAll(/\b(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})[./](\d{2})[./](\d{4}))\b/g)) {
      const date=match[1]?match[1]+'-'+match[2]+'-'+match[3]:match[6]+'-'+match[5]+'-'+match[4];
      if(date>='1900-01-01'&&validDate(date))dates.add(date);
    }
  }
  const merchant=lines.slice(0,8).map(line=>line.replace(/^(?:ПРОДАВЕЦ|MERCHANT)\s*:\s*/iu,'')).find((line,index)=>
    (/^(?:ООО|ИП|АО|ПАО)\s+/iu.test(line)||line!==lines[index])&&line.length>=2&&line.length<=100&&!/\d{6,}/.test(line)
  )||'';
  return {
    totals:[...totals].slice(0,8), dates:[...dates].slice(0,8),
    currency:currencies.size===1?[...currencies][0]:'', merchant
  };
}

export function receiptDuplicate(transactions,{amount,date,currency}) {
  const parsed=parseMoney(amount);
  return parsed>0&&transactions.some(tx=>personalExpense(tx)&&tx.amount===parsed&&tx.date===date&&(tx.currency||'RUB')===currency);
}
