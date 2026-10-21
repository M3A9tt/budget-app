import React from 'react';

// A failed lazy chunk or render must leave a recovery action instead of a blank screen.
export default class AppErrorBoundary extends React.Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  return <main role="alert" style={{maxWidth:440,margin:'10vh auto',padding:24,fontFamily:'system-ui',lineHeight:1.6,color:'#eef2f0',background:'#15181d',borderRadius:20}}>
   <h1 style={{fontSize:24}}>Не удалось открыть экран</h1>
   <p>Обнови приложение, чтобы загрузить его заново. Если ошибка повторится, сообщи, после какого действия она появилась.</p>
   <p>Обновление страницы не удаляет бюджет или сохранённые копии.</p>
   <button type="button" onClick={()=>window.location.reload()} style={{minHeight:48,padding:'12px 20px',border:0,borderRadius:12,background:'#b8dec4',color:'#15231b',font:'inherit',cursor:'pointer'}}>Обновить приложение</button>
  </main>;
 }
}
