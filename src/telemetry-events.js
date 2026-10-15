export const TELEMETRY_EVENTS=['page_view','entry_open','entry_save','entry_error','entry_repeat','entry_delete','history_filter','account_add','account_transfer','account_reconcile','category_choose','account_choose','entry_details','import_open'];
export const TELEMETRY_SCREENS=['overview','add','history','stats','lunch','accounts','goals','payments','settings','updates','feedback'];
export const eventLabels={page_view:'Открытие раздела',entry_open:'Начало записи',entry_save:'Сохранение записи',entry_error:'Ошибка записи',entry_repeat:'Повтор покупки',entry_delete:'Удаление записи',history_filter:'Фильтр истории',account_add:'Новый счёт',account_transfer:'Перевод',account_reconcile:'Сверка',category_choose:'Выбор категории',account_choose:'Выбор счёта',entry_details:'Детали записи',import_open:'Импорт'};
export const screenLabels={overview:'Главная',add:'Запись',history:'История',stats:'Анализ',lunch:'Обеды',accounts:'Счета',goals:'Цели',payments:'Платежи',settings:'Настройки',updates:'Обновления',feedback:'Обратная связь'};
export function validateTelemetry(input){
 if(!input||Object.keys(input).some(k=>!['id','events'].includes(k))||!/^[a-f0-9-]{36}$/.test(input.id||'')||!Array.isArray(input.events)||!input.events.length||input.events.length>40)throw Error('Неверный пакет телеметрии');
 for(const e of input.events)if(!e||Object.keys(e).some(k=>!['event','screen','device'].includes(k))||!TELEMETRY_EVENTS.includes(e.event)||!TELEMETRY_SCREENS.includes(e.screen)||!['mobile','desktop','bot'].includes(e.device))throw Error('Неверное событие телеметрии');
 return input;
}
