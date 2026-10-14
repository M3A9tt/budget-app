import releases from './releases.json' with {type:'json'};
export {releases};
export const latestRelease=releases[0];
export function releaseText(release=latestRelease){return `Budget · обновление ${release.id}\n${release.title}\n\n${release.changes.map(x=>'• '+x).join('\n')}\n\nПодробности — в приложении: «Что нового».`;}
export function validateReleases(items){
 if(!Array.isArray(items)||!items.length)throw Error('Нужен патчноут');
 const ids=new Set();for(const r of items){if(!/^[a-zA-Z0-9._-]{1,80}$/.test(r.id||'')||ids.has(r.id))throw Error('Уникальный ID выпуска обязателен');ids.add(r.id);if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')||Number.isNaN(Date.parse(r.date))||new Date(r.date+'T12:00:00Z').toISOString().slice(0,10)!==r.date)throw Error('Неверная дата патчноута');if(typeof r.title!=='string'||!r.title.trim()||r.title.length>100||!Array.isArray(r.changes)||!r.changes.length||r.changes.some(x=>typeof x!=='string'||!x.trim()||x.length>350)||releaseText(r).length>3500)throw Error('Патчноут должен быть коротким и содержательным');}
 return items;
}
