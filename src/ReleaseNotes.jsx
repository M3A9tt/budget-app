import React from 'react';
import {releases} from './release-notes.js';
export default function ReleaseNotes(){return <><h1 className="mini-title">Что нового</h1><p className="mini-subtitle">Коротко о том, что изменилось и стало удобнее.</p>{releases.map(r=><article className="mini-card" key={r.id}><div className="mini-eyebrow">{r.date} · {r.id}</div><h2 style={{fontSize:22}}>{r.title}</h2><ul className="mini-small" style={{paddingLeft:20,lineHeight:1.9}}>{r.changes.map((x,i)=><li key={i}>{x}</li>)}</ul></article>)}</>;}
