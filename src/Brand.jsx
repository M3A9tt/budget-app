import React from 'react';
import './brand.css';

export function BrandSymbol(){
 return <img className="burget-symbol" src="/brand/symbol.webp" width="256" height="256" alt="" decoding="async"/>;
}

export default function Brand({src='/brand/lockup-refined-b.webp'}){
 return <span className="burget-brand" role="img" aria-label="Бюрджет">
  <img className="burget-lockup" src={src} width="1024" height="298" alt="" decoding="async"/>
 </span>;
}
