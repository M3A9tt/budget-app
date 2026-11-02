import React from 'react';
import './brand.css';

export function BrandSymbol(){
 return <img className="burget-symbol" src="/brand/symbol.webp" width="256" height="256" alt="" decoding="async"/>;
}

export default function Brand(){
 return <span className="burget-brand" role="img" aria-label="Бюрджет">
  <BrandSymbol/>
  <img className="burget-wordmark" src="/brand/wordmark.webp" width="1024" height="269" alt="" decoding="async"/>
 </span>;
}
