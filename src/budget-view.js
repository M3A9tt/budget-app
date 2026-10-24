// Presentation shared by the main screen, bot and generated summaries.
export function budgetState(s){
 const shortfall=s.free<0;
 const heading=s.unknown?(shortfall?'По известным суммам не хватает':'Остаток по известным суммам'):shortfall?(s.balance<0?'Нехватка по текущему плану':'На платежи не хватает'):'Можно потратить';
 return {shortfall,heading,amount:Math.abs(s.free),context:shortfall?'Если новых поступлений не будет, текущих денег не хватит на известные платежи.':'После известных платежей эта сумма остаётся на остальные покупки.'};
}
