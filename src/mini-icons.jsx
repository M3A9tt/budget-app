import React from 'react';
import {hasIconShape,iconShape} from './mini-icon-shapes.js';

export default function Icon({name,size=20,...props}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon={hasIconShape(name)?name:'other'} {...props} dangerouslySetInnerHTML={{__html:iconShape(name)}}/>;
}
