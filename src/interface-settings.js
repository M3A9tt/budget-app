// Presentation preferences share the server profile; no parallel financial store.
// Version 1 was also the automatic 4.16 default, so only an explicit
// choice made with the new default in effect should retain the old view.
export const personalInterface=data=>!(data.settings?.interfaceVersion===1&&data.settings?.legacyInterfaceOptIn===true);
export function setInterfaceVersion(data,version){
 if(![1,2].includes(version))throw Error('Неизвестный вид приложения');
 return {...data,settings:{...data.settings,interfaceVersion:version,legacyInterfaceOptIn:version===1}};
}
export function validateInterface(settings){
 if(settings.interfaceVersion!==undefined&&![1,2].includes(settings.interfaceVersion))throw Error('Неизвестный вид приложения');
 for(const key of ['interfaceGuideSeen','interfaceInviteDismissed','legacyInterfaceOptIn'])if(settings[key]!==undefined&&typeof settings[key]!=='boolean')throw Error('Неверная настройка перехода');
}
