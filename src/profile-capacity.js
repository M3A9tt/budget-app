export const MAX_PROFILE_BYTES=1_500_000;
export function profileCapacity(data){const bytes=new TextEncoder().encode(JSON.stringify(data)).length;return {bytes,limit:MAX_PROFILE_BYTES,ratio:bytes/MAX_PROFILE_BYTES,warning:bytes>=MAX_PROFILE_BYTES*.8,full:bytes>MAX_PROFILE_BYTES};}
export function assertProfileCapacity(data){if(profileCapacity(data).full)throw Error('Профиль превышает 1,5 МБ. Импорт не сохранён. Выгрузи резервную копию и обратись к разработчику: история не обрезается автоматически.');return data;}
