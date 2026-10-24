export const EXPENSE_GROUPS=[
 {id:'purchase',name:'Обычные покупки'},
 {id:'regular',name:'Платежи по плану'},
 {id:'installment',name:'Сплиты и кредиты'},
 {id:'debt',name:'Возвраты долгов'}
];
export const personalExpense=t=>t.type==='expense'&&t.cat!=='lunch';
export function expenseGroup(t){
 if(!personalExpense(t))return null;
 return t.debtId?'debt':t.installmentPaymentId?'installment':t.recurringId||(t.tags||[]).includes('постоянный')?'regular':'purchase';
}
export const fixedExpense=t=>personalExpense(t)&&expenseGroup(t)!=='purchase';
