import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright-core';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {moveDate} from '../src/finance-events.js';
import {createPlanned} from '../src/planned-operations.js';
import {paymentDate} from '../src/payment-copy.js';

const out=process.env.PILOT_SCREENSHOT_DIR||'/tmp/burget-finance-pilot';
await mkdir(out,{recursive:true});
const today=todayMoscow(),seed={
  ...structuredClone(EMPTY),
  accounts:[{id:'fictional-card',name:'Карта',balance:1000,currency:'RUB'}],
  settings:{...EMPTY.settings,telemetryEnabled:false,interfaceGuideSeen:true,modules:{lunch:true}}
};
const server=await preview({preview:{host:'127.0.0.1',port:0},logLevel:'error'});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox']});
const origin='http://127.0.0.1:'+server.httpServer.address().port;

try {
  for(const enabled of [false,true]) {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[],requests=[],writes=new Map();
    let data=structuredClone(seed),revision=1,cloudCalls=0,shouldLoseResponse=true;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>requests.push(request.url()));
    // Reproduce the Mini App path with a test Telegram session and no WebGPU.
    await page.addInitScript(()=>{
      window.Telegram={WebApp:{initData:'pilot-fixture'}};
      Object.defineProperty(navigator,'gpu',{value:undefined});
    });
    await page.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
    await page.route('**/api/v1/**',async route=>{
      const request=route.request();
      if(request.url().endsWith('/finance-assistant')) {
        const input=request.postDataJSON();
        assert.equal(request.headers()['x-budget-profile'],'fictional-user');
        assert.equal(input.consent,true);
        assert.equal(input.revision,revision);
        cloudCalls++;
        return cloudCalls===1?route.fulfill({json:{ids:['safe','pace']}}):route.fulfill({status:503,json:{error:'Квота исчерпана'}});
      }
      if(!request.url().endsWith('/state'))return route.fulfill({json:{}});
      if(request.method()==='PUT') {
        const key=request.headers()['idempotency-key'],input=request.postDataJSON();
        assert.ok(key);
        if(writes.has(key)) {
          const prior=writes.get(key);
          assert.deepEqual(prior.input,input);
          return route.fulfill({json:{revision:prior.revision}});
        }
        assert.equal(input.expectedRevision,revision);
        data=input.data;
        revision++;
        writes.set(key,{input,revision});
        if(shouldLoseResponse) {
          shouldLoseResponse=false;
          return route.abort('failed');
        }
        return route.fulfill({json:{revision}});
      }
      return route.fulfill({json:{
        data,revision,userId:'fictional-user',
        ...(enabled?{features:{receipt:true,assistant:true,cloud:true}}:{})
      }});
    });
    const shot=async name=>{
      await page.locator('.mini-toast').waitFor({state:'hidden',timeout:5000});
      await page.screenshot({path:join(out,name+'.png'),fullPage:true});
    };
    const navigate=name=>page.locator('.mini-nav').getByRole('button',{name,exact:true}).click();
    try {
      await page.goto(origin);
      await navigate('Аналитика');
      await page.getByRole('heading',{name:'Здесь будут твои расходы'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Хватит ли на покупку?'}).count(),Number(enabled));
      await shot(enabled?'after-analytics-390':'before-analytics-390');
      await navigate('Записать');
      await page.locator('#amount').waitFor();
      await shot(enabled?'receipt-entry-390':'before-entry-390');
      if(!enabled) {
        assert.equal(await page.getByRole('button',{name:'Распознать чек'}).count(),0);
        continue;
      }
      const image=async currency=>page.evaluate(({date,currency})=>{
        const canvas=document.createElement('canvas');
        canvas.width=1000;
        canvas.height=540;
        const context=canvas.getContext('2d');
        context.fillStyle='white';
        context.fillRect(0,0,1000,540);
        context.fillStyle='black';
        context.font='54px Arial';
        ['ООО МАГАЗИН','КАССОВЫЙ ЧЕК',date,'ПЕЧЕНЬЕ 123,45','ИТОГО 123,45 '+currency].forEach((line,index)=>context.fillText(line,60,90+index*90));
        return canvas.toDataURL('image/png').split(',')[1];
      },{date:today.split('-').reverse().join('.'),currency});
      const file=async currency=>({name:'receipt.png',mimeType:'image/png',buffer:Buffer.from(await image(currency),'base64')});
      const readReceipt=async currency=>{
        const chooser=page.waitForEvent('filechooser');
        await page.getByRole('button',{name:'Распознать чек'}).click();
        await (await chooser).setFiles(await file(currency));
        await page.getByText('Проверь данные чека').waitFor({timeout:45_000});
      };
      const scan=async()=>{
        await readReceipt('RUB');
        assert.equal(await page.getByLabel('Итог чека').inputValue(),'123.45');
        assert.equal(await page.getByLabel('Дата чека').inputValue(),today);
        assert.equal(await page.locator('select[aria-label="Валюта чека"]').inputValue(),'RUB');
      };
      await page.locator('#amount').fill('90');
      await page.reload();
      await page.getByText('Остался незавершённый ввод').waitFor();
      await navigate('Записать');
      assert.equal(await page.locator('#amount').inputValue(),'90');
      assert.equal(await page.getByText('Остался незавершённый ввод').count(),0);
      await readReceipt('GEL');
      await page.getByText(/123\.45 GEL · Валюта чека недоступна/).waitFor();
      assert.equal(await page.getByLabel('Итог чека').inputValue(),'');
      assert.equal(await page.locator('select[aria-label="Валюта чека"]').inputValue(),'');
      assert.equal(await page.getByRole('button',{name:'Перенести в черновик'}).isDisabled(),true);
      await page.getByRole('button',{name:'Отмена',exact:true}).click();
      assert.equal(await page.locator('#amount').inputValue(),'90');
      assert.equal(writes.size,0);
      await scan();
      const receiptImage=page.locator('.receipt-review img');
      await page.getByText('Посмотреть снимок').click();
      await page.waitForFunction(()=>document.querySelector('.receipt-review img').naturalWidth===1000);
      assert.match(await receiptImage.getAttribute('src'),/^blob:/);
      await page.getByText('Посмотреть снимок').click();
      await page.getByLabel('Дата чека').fill(moveDate(today,1));
      await page.getByText('Дата чека в будущем. Укажи фактическую дату покупки.').waitFor();
      assert.equal(await page.getByRole('button',{name:'Перенести в черновик'}).isDisabled(),true);
      await page.getByLabel('Дата чека').fill(today);
      assert.equal(writes.size,0);
      await shot('receipt-review-390');
      await page.getByRole('button',{name:'Перенести в черновик'}).click();
      assert.equal(await page.locator('#amount').inputValue(),'123.45');
      assert.equal(writes.size,0);
      await page.getByRole('button',{name:/^Записать · 123/}).click();
      await page.getByText('Операция сохранена',{exact:true}).waitFor();
      assert.equal(writes.size,1);
      assert.equal(data.transactions.length,1);
      assert.equal(data.accounts[0].balance,876.55);
      assert.equal(data.transactions[0]._receipt,undefined);

      await navigate('Записать');
      await scan();
      await page.getByText(/В истории уже есть расход с такой датой/).waitFor();
      await page.getByRole('button',{name:'Отмена',exact:true}).click();
      assert.equal(writes.size,1);
      await page.getByRole('button',{name:'Назад',exact:true}).click();
      await navigate('Аналитика');
      await page.getByRole('button',{name:'Разобрать расходы'}).click();
      await page.getByText(/За период записано расходов на 123,45/).waitFor();
      await page.getByRole('button',{name:'Хватит ли на покупку?'}).click();
      await page.getByLabel('Сумма покупки, ₽').fill('500');
      await page.getByRole('button',{name:'Рассчитать',exact:true}).click();
      await page.getByText('По прогнозу денег хватит').waitFor();
      assert.equal(cloudCalls,0);
      await shot('purchase-390');
      await page.getByRole('button',{name:'Объяснить в бесплатном облаке'}).click();
      await page.getByRole('button',{name:'Отмена',exact:true}).click();
      assert.equal(cloudCalls,0);
      await page.getByRole('button',{name:'Объяснить в бесплатном облаке'}).click();
      await page.getByRole('button',{name:'Отправить сводку и объяснить'}).click();
      await page.getByText('Проверенное объяснение').waitFor();
      assert.equal(cloudCalls,1);
      await page.getByRole('button',{name:'Рассчитать',exact:true}).click();
      await page.getByRole('button',{name:'Объяснить в бесплатном облаке'}).click();
      await page.getByRole('button',{name:'Отправить сводку и объяснить'}).click();
      await page.getByText('Облачное объяснение сейчас недоступно. Расчёт Бюрджета доступен.').waitFor();
      await page.getByText('По прогнозу денег хватит').waitFor();
      assert.equal(writes.size,1);
      assert.ok(requests.some(url=>url.startsWith(origin+'/ocr/')));
      assert.ok(requests.every(url=>url.startsWith(origin)||url.startsWith('blob:'+origin+'/')||url.startsWith('https://telegram.org/')));

      for(const width of [320,1280]) {
        await page.setViewportSize({width,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        if(width===1280)await shot('purchase-1280');
      }
      await navigate('Операции');
      await page.getByRole('button',{name:'Изменить: ООО МАГАЗИН',exact:true}).click();
      page.once('dialog',dialog=>dialog.accept());
      await page.getByRole('button',{name:'Удалить',exact:true}).click();
      await page.getByText('Операция удалена',{exact:true}).waitFor();
      assert.equal(data.transactions.length,0);
      assert.equal(data.accounts[0].balance,1000);

      const dueDate=moveDate(today,5);
      data=createPlanned(data,{
        id:'fictional-payment',name:'Будущий платёж',type:'expense',amount:'1100',
        startDate:dueDate,accountId:'fictional-card',frequency:'once'
      });
      revision++;
      await page.setViewportSize({width:390,height:844});
      await page.reload();
      await navigate('Аналитика');
      await page.getByRole('button',{name:'Хватит ли на покупку?'}).click();
      await page.getByLabel('Сумма покупки, ₽').fill('1050');
      await page.getByRole('button',{name:'Рассчитать',exact:true}).click();
      const result=page.locator('.finance-pilot-result');
      await result.getByText('Прогноз показывает дефицит').waitFor();
      assert.equal(await result.getByText('Первый дефицит с покупкой',{exact:true}).locator('xpath=following-sibling::dd[1]').textContent(),paymentDate(today));
      assert.equal(await result.getByText('Первый дефицит без покупки',{exact:true}).locator('xpath=following-sibling::dd[1]').textContent(),paymentDate(dueDate));
      assert.equal(await result.getByText('С ожидаемыми доходами',{exact:true}).count(),0);
      await shot('purchase-existing-shortfall-390');
      assert.equal(writes.size,2);

      await navigate('Записать');
      const direction=page.getByRole('group',{name:'Тип операции'});
      await direction.getByRole('button',{name:'Доход',exact:true}).click();
      const expense=direction.getByRole('button',{name:'Расход',exact:true});
      const entryAmount=page.locator('#amount');
      await entryAmount.fill('');
      await entryAmount.focus();
      await page.keyboard.type('-10.01');
      assert.equal(await expense.getAttribute('aria-pressed'),'true');
      assert.equal(await entryAmount.inputValue(),'10.01');
      await page.getByRole('button',{name:'Разделить по категориям'}).click();
      const split=page.getByRole('region',{name:'Распределение покупки'});
      const chooseCategory=async(index,name)=>{
        await split.getByRole('button',{name:'Категория '+index,exact:true}).click();
        await page.getByRole('dialog',{name:'Категория '+index,exact:true}).getByRole('button',{name,exact:true}).click();
      };
      await chooseCategory(2,'Транспорт');
      await split.getByRole('button',{name:'Добавить категорию',exact:true}).click();
      await chooseCategory(3,'Техника');
      await split.getByRole('button',{name:'Проценты',exact:true}).click();
      for(const [index,value] of ['33.33','33.33','33.34'].entries())await split.getByLabel('Процент категории '+(index+1)).fill(value);
      await split.getByText('Вся сумма распределена').waitFor();
      await page.setViewportSize({width:320,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await shot('split-expense-320');
      await split.getByRole('button',{name:'Суммы',exact:true}).click();
      assert.equal(await split.getByLabel('Сумма категории 2').inputValue(),'3.33');
      await page.getByRole('button',{name:/^Записать · 10/}).click();
      await page.getByText('Операция сохранена',{exact:true}).waitFor();
      assert.equal(data.transactions.length,1);
      assert.equal(data.accounts[0].balance,989.99);
      assert.deepEqual(data.transactions[0].categoryAllocations.map(part=>part.minor),[334,333,334]);
      assert.equal(writes.size,3);

      await page.goto(origin+'/?lunch=1');
      await page.getByRole('button',{name:'Периоды без вопросов'}).click();
      await page.getByRole('button',{name:'Добавить период'}).click();
      await page.getByRole('button',{name:'Пауза вопросов',exact:true}).click();
      await page.getByLabel('Конец',{exact:true}).fill(moveDate(today,5));
      await page.getByRole('button',{name:'Сохранить период'}).click();
      await page.getByText('Период сохранён',{exact:true}).waitFor();
      assert.equal(data.lunchPeriods.length,1);
      assert.equal(data.lunchPeriods[0].mode,'pause');
      assert.equal(data.accounts[0].balance,989.99);
      assert.equal(writes.size,4);
      await page.setViewportSize({width:390,height:844});
      await shot('lunch-pause-390');
      assert.deepEqual(errors,[]);
    } catch(error) {
      await shot('failure').catch(()=>{});
      console.error((await page.locator('body').innerText()).slice(0,3500));
      throw error;
    } finally {
      await page.close();
    }
  }
  await writeFile(join(out,'fixture.json'),JSON.stringify({today,data:seed},null,2));
  console.log('OCR and finance pilot passed in Chromium at 320–1280 px.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
