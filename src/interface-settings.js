// Presentation preferences share the server profile; no parallel financial store.
export const personalInterface=data=>data.settings?.interfaceVersion===2;
export function setInterfaceVersion(data,version){if(![1,2].includes(version))throw Error('Неизвестный вид приложения');return {...data,settings:{...data.settings,interfaceVersion:version}};}
export function validateInterface(settings){if(settings.interfaceVersion!==undefined&&![1,2].includes(settings.interfaceVersion))throw Error('Неизвестный вид приложения');for(const key of ['interfaceGuideSeen','interfaceInviteDismissed'])if(settings[key]!==undefined&&typeof settings[key]!=='boolean')throw Error('Неверная настройка перехода');}
