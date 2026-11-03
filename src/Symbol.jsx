import React from 'react';
import Icon from './mini-icons.jsx';
import {isIcon} from './icon-catalog.js';
export default function Symbol({value={},fallback='other',size=20}){
 return value.emoji?<span className="symbol-emoji" aria-hidden="true">{value.emoji}</span>:<Icon name={isIcon(value.icon)?value.icon:fallback} size={size}/>;
}
