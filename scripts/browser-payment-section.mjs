// Keep old audit revisions reproducible while current management lives in a disclosure.
export async function selectPaymentSection(page,name){
 const menu=page.locator('.payments-management');
 if(await menu.count()&&await menu.getAttribute('open')===null)await menu.locator('summary').click();
 const scoped=page.locator('.payments-sections').getByRole('button',{name,exact:true});
 await (await scoped.count()?scoped:page.getByRole('button',{name,exact:true})).click();
}
