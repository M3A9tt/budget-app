// Only public, versioned app assets. Never fetch URLs supplied by a profile.
export async function reportAssets(env){
 if(!env.ASSETS?.fetch)throw Error('Report assets unavailable');
 const read=async(path,type,max)=>{
  const r=await env.ASSETS.fetch(new Request('https://assets.internal'+path));
  if(!r.ok)throw Error('Report asset unavailable');
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(!bytes.length||bytes.length>max)throw Error('Invalid report asset');
  let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return 'data:'+type+';base64,'+btoa(raw);
 };
 const [logo,font]=await Promise.all([read('/brand/lockup-refined-b.webp','image/webp',200000),read('/fonts/commissioner-variable.ttf','font/ttf',1000000)]);
 return {logo,font};
}
