// Inspect the actual screenshot, not merely an <img> node in the HTML.
export async function checkReportLogo(browser,bytes){
 const page=await browser.newPage();try{
  await page.setContent('<canvas></canvas>');
  const result=await page.evaluate(async src=>{
   const image=new Image();image.src=src;await image.decode();
   const scale=image.naturalWidth/640,canvas=document.querySelector('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   const pixels=ctx.getImageData(Math.round(38*scale),Math.round(28*scale),Math.round(220*scale),Math.round(85*scale)).data;
   let green=0,purple=0;for(let i=0;i<pixels.length;i+=4){const [r,g,b,a]=pixels.slice(i,i+4);if(a>200&&g>r+25&&g>b+10)green++;if(a>200&&b>r+25&&b>g+35)purple++;}
   return {green,purple,logoVisible:green>30&&purple>30};
  },'data:image/png;base64,'+Buffer.from(bytes).toString('base64'));
  if(!result.logoVisible)throw Error('Report logo is absent from screenshot pixels');return result;
 }finally{await page.close();}
}
