/* ===== MARIONETE — agente de IA conduzido pelos dedos (cursor/toque) =====
   Inspirado no vídeo "AI Agentic Coding": fios dourados saindo das pontas dos dedos,
   robô pendurado, HUD de status e terminal rodando tarefas. Sem webcam: a "mão" é o cursor. */
(function(){
  const st=document.getElementById('pup'); if(!st) return;
  const cv=st.querySelector('.pup-cv'), cx=cv.getContext('2d');
  const hud=st.querySelector('.pup-hud'), stEl=st.querySelector('.pup-st'), bar=st.querySelector('.pup-bar i');
  const log=st.querySelector('.pup-log'), wait=st.querySelector('.pup-term-wait');
  const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W=0,H=0,S=1,dpr=1,mob=false,raf=0,last=performance.now();

  function size(){
    const r=st.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2);
    W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0);
    mob=W<760; S=mob?Math.min(W/430,1):Math.min(W,H*1.15)/640;
  }
  const base=()=>mob?{x:W*.42,y:H*.27}:{x:W*.27,y:H*.5};
  const restHand=()=>mob?{x:W*.7,y:H*.1}:{x:W*.48,y:H*.28};

  const hand={x:0,y:0,tx:0,ty:0};let ptrAt=-1e9,E=0;
  const FAN=[[-62,8],[-34,-30],[-4,-44],[27,-34],[52,-6]];
  const fing=FAN.map(()=>({x:0,y:0,vx:0,vy:0}));
  function setPtr(e){const r=st.getBoundingClientRect();hand.tx=e.clientX-r.left;hand.ty=e.clientY-r.top;ptrAt=performance.now();st.classList.add('on')}
  st.addEventListener('pointermove',setPtr,{passive:true});
  st.addEventListener('pointerdown',setPtr,{passive:true});
  st.addEventListener('pointerleave',()=>{ptrAt=performance.now()-2000});

  const R={x:0,y:0,tilt:0,head:{x:0,y:0},lh:{x:0,y:0},rh:{x:0,y:0},lk:{x:0,y:0},rk:{x:0,y:0},lf:{x:0,y:0},rf:{x:0,y:0}};
  let inited=false;
  function init(){const b=base(),h=restHand();hand.x=hand.tx=h.x;hand.y=hand.ty=h.y;R.x=b.x;R.y=b.y;
    R.lf={x:b.x-30*S,y:b.y+200*S};R.rf={x:b.x+30*S,y:b.y+200*S};
    fing.forEach((f,i)=>{f.x=h.x+FAN[i][0]*S;f.y=h.y+FAN[i][1]*S;f.vx=f.vy=0});inited=true}

  const pulses=[];
  const lerp=(a,b,k)=>a+(b-a)*k, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function ik(ax,ay,tx,ty,l1,l2,bend){
    const dx=tx-ax,dy=ty-ay,d=Math.hypot(dx,dy)||1, dm=Math.min(d,l1+l2-.01);
    const a=Math.acos(clamp((l1*l1+dm*dm-l2*l2)/(2*l1*dm),-1,1)), ang=Math.atan2(dy,dx)+a*bend;
    return {ex:ax+Math.cos(ang)*l1,ey:ay+Math.sin(ang)*l1,hx:ax+dx/d*dm,hy:ay+dy/d*dm};
  }

  function step(t,dt){
    const tt=t/1000, idle=t-ptrAt>2200, h0=restHand();
    if(idle){ // mão "fantasma" conduzindo sozinha quando ninguém mexe
      const sp=RM?.35:1;
      hand.tx=h0.x+Math.sin(tt*.9*sp)*70*S+Math.sin(tt*2.3*sp)*18*S;
      hand.ty=h0.y+Math.cos(tt*1.3*sp)*38*S+Math.sin(tt*3.1*sp)*10*S;
      if(t-ptrAt>6000)st.classList.remove('on');
    }
    const k=1-Math.pow(.001,dt*(idle?1.4:6));
    const px=hand.x,py=hand.y; hand.x=lerp(hand.x,hand.tx,k);hand.y=lerp(hand.y,hand.ty,k);
    const sp=Math.hypot(hand.x-px,hand.y-py)/Math.max(dt,.001)/S;
    E=lerp(E,clamp(sp/900,0,1),1-Math.pow(.02,dt)); if(idle)E=Math.max(E,.12+.1*Math.sin(tt*.7));
    fing.forEach((f,i)=>{ // dedos: mola com atraso + dedilhado
      const wig=(5+14*E)*S, tx=hand.x+FAN[i][0]*S+Math.sin(tt*(3.1+i*.7)+i)*wig*.5,
            ty=hand.y+FAN[i][1]*S+Math.sin(tt*(4.3+i*.9)+i*2)*wig;
      f.vx+=(tx-f.x)*180*dt; f.vy+=(ty-f.y)*180*dt; const damp=Math.pow(.0005,dt); f.vx*=damp; f.vy*=damp;
      f.x+=f.vx*dt; f.y+=f.vy*dt;
    });
    const b=base(), dx=hand.x-h0.x, dy=hand.y-h0.y, kb=1-Math.pow(.02,dt);
    R.x=lerp(R.x,b.x+clamp(dx*.16,-60*S,60*S),kb);
    R.y=lerp(R.y,b.y+clamp(dy*.22,-50*S,40*S)+Math.sin(tt*1.6)*4*S,kb);
    R.tilt=lerp(R.tilt,clamp((fing[4].y-fing[0].y)*.004/S+dx*.0006/S,-.35,.35),kb);
    const pull=(i,g)=>({x:(fing[i].x-(h0.x+FAN[i][0]*S))*g,y:(fing[i].y-(h0.y+FAN[i][1]*S))*g});
    const kj=1-Math.pow(.005,dt), mv=(o,p)=>{o.x=lerp(o.x,p.x,kj);o.y=lerp(o.y,p.y,kj)};
    mv(R.lh,pull(0,.42)); mv(R.lk,pull(1,.3)); mv(R.head,pull(2,.12)); mv(R.rk,pull(3,.3)); mv(R.rh,pull(4,.42));
    if(!RM&&Math.random()<dt*(2+E*26))pulses.push({i:(Math.random()*5)|0,p:0,v:.7+Math.random()*.9});
    for(let j=pulses.length-1;j>=0;j--){pulses[j].p+=pulses[j].v*dt*(1+E*1.5);if(pulses[j].p>1)pulses.splice(j,1)}
  }

  function world(lx,ly){const c=Math.cos(R.tilt),s=Math.sin(R.tilt);return{x:R.x+lx*c-ly*s,y:R.y+lx*s+ly*c}}
  function limb(ax,ay,bx,by,w){
    const g=cx.createLinearGradient(ax-w,ay-w,bx+w,by+w);g.addColorStop(0,'#cbc6ff');g.addColorStop(.5,'#7d72e6');g.addColorStop(1,'#3f3794');
    cx.strokeStyle=g;cx.lineWidth=w;cx.lineCap='round';cx.beginPath();cx.moveTo(ax,ay);cx.lineTo(bx,by);cx.stroke();
    cx.strokeStyle='rgba(255,255,255,.35)';cx.lineWidth=w*.18;cx.beginPath();cx.moveTo(ax-w*.2,ay-w*.2);cx.lineTo(bx-w*.2,by-w*.2);cx.stroke();
  }
  function joint(x,y,r,glow){cx.fillStyle='#262150';cx.beginPath();cx.arc(x,y,r,0,7);cx.fill();
    cx.fillStyle=glow?'rgba(124,255,57,.9)':'#9d94ff';cx.beginPath();cx.arc(x,y,r*.45,0,7);cx.fill()}
  function rrect(x,y,w,h,r){cx.beginPath();if(cx.roundRect)cx.roundRect(x,y,w,h,r);else cx.rect(x,y,w,h)}

  function drawRobot(tt){
    const s=S, sh=[world(-40*s,-8*s),world(40*s,-8*s)], hp=[world(-22*s,62*s),world(22*s,62*s)];
    const LH=world(-70*s+R.lh.x,40*s+R.lh.y), RH=world(70*s+R.rh.x,40*s+R.rh.y);
    const LK=world(-26*s+R.lk.x,112*s+R.lk.y), RK=world(26*s+R.rk.x,112*s+R.rk.y);
    const a1=ik(sh[0].x,sh[0].y,LH.x,LH.y,42*s,42*s,1), a2=ik(sh[1].x,sh[1].y,RH.x,RH.y,42*s,42*s,-1);
    const l1=ik(hp[0].x,hp[0].y,LK.x,LK.y,48*s,1,0), l2=ik(hp[1].x,hp[1].y,RK.x,RK.y,48*s,1,0);
    R.lf.x=lerp(R.lf.x,l1.hx-6*s,.15);R.lf.y=lerp(R.lf.y,l1.hy+50*s,.15);R.rf.x=lerp(R.rf.x,l2.hx+6*s,.15);R.rf.y=lerp(R.rf.y,l2.hy+50*s,.15);
    const fix=(k,f)=>{const d=Math.hypot(f.x-k.hx,f.y-k.hy)||1;return{x:k.hx+(f.x-k.hx)/d*48*s,y:k.hy+(f.y-k.hy)/d*48*s}};
    const LF=fix(l1,R.lf),RF=fix(l2,R.rf);
    cx.fillStyle='rgba(124,255,57,.06)';cx.beginPath();cx.ellipse(R.x,R.y+205*s,95*s,14*s,0,0,7);cx.fill();
    limb(hp[0].x,hp[0].y,l1.hx,l1.hy,20*s);limb(l1.hx,l1.hy,LF.x,LF.y,17*s);
    limb(hp[1].x,hp[1].y,l2.hx,l2.hy,20*s);limb(l2.hx,l2.hy,RF.x,RF.y,17*s);
    [[LF,-1],[RF,1]].forEach(([f,d])=>{cx.fillStyle='#4b43a8';rrect(f.x-16*s+d*4*s,f.y-4*s,32*s,13*s,5*s);cx.fill()});
    joint(l1.hx,l1.hy,10*s,true);joint(l2.hx,l2.hy,10*s,true);
    cx.save();cx.translate(R.x,R.y);cx.rotate(R.tilt);
    let g=cx.createLinearGradient(-50*s,-30*s,50*s,70*s);g.addColorStop(0,'#d6d2ff');g.addColorStop(.45,'#8478ee');g.addColorStop(1,'#2f2878');
    cx.fillStyle=g;rrect(-46*s,-26*s,92*s,80*s,16*s);cx.fill();
    cx.fillStyle='#231e4d';rrect(-24*s,52*s,48*s,18*s,6*s);cx.fill();
    const pr=(10+4*Math.sin(tt*6)*E)*s;cx.shadowColor='#7CFF39';cx.shadowBlur=24*s*(.4+E);
    cx.fillStyle='#7CFF39';cx.beginPath();cx.arc(0,12*s,pr,0,7);cx.fill();cx.shadowBlur=0;
    cx.fillStyle='#0b1a06';cx.font='700 '+(9*s)+'px ui-monospace,Consolas,monospace';cx.textAlign='center';cx.fillText('DR',0,15*s);
    cx.fillStyle='rgba(255,255,255,.25)';rrect(-38*s,-20*s,30*s,5*s,3*s);cx.fill();
    cx.translate(R.head.x*.6,-46*s+R.head.y*.6);cx.rotate(clamp(R.head.x*.01/s,-.3,.3));
    cx.fillStyle='#3b3490';rrect(-6*s,8*s,12*s,14*s,3*s);cx.fill();
    g=cx.createLinearGradient(-34*s,-36*s,34*s,10*s);g.addColorStop(0,'#e2deff');g.addColorStop(1,'#5a50c8');
    cx.fillStyle=g;rrect(-34*s,-36*s,68*s,48*s,13*s);cx.fill();
    cx.fillStyle='#0a0c16';rrect(-26*s,-26*s,52*s,24*s,8*s);cx.fill();
    const blink=(Math.sin(tt*1.7)>.985)?.15:1, look=clamp((hand.x-R.x)/W*14,-6,6)*s;
    cx.shadowColor='#7CFF39';cx.shadowBlur=14*s;cx.fillStyle='#7CFF39';
    rrect(-17*s+look,-19*s,11*s,10*s*blink,3*s);cx.fill();rrect(6*s+look,-19*s,11*s,10*s*blink,3*s);cx.fill();cx.shadowBlur=0;
    cx.strokeStyle='#9d94ff';cx.lineWidth=3*s;cx.beginPath();cx.moveTo(0,-36*s);cx.lineTo(0,-48*s);cx.stroke();
    cx.fillStyle=E>.35?'#ffb04a':'#7CFF39';cx.beginPath();cx.arc(0,-50*s,4*s,0,7);cx.fill();
    cx.restore();
    limb(sh[0].x,sh[0].y,a1.ex,a1.ey,18*s);limb(a1.ex,a1.ey,a1.hx,a1.hy,15*s);
    limb(sh[1].x,sh[1].y,a2.ex,a2.ey,18*s);limb(a2.ex,a2.ey,a2.hx,a2.hy,15*s);
    joint(sh[0].x,sh[0].y,11*s);joint(sh[1].x,sh[1].y,11*s);joint(a1.ex,a1.ey,9*s,true);joint(a2.ex,a2.ey,9*s,true);
    [a1,a2].forEach(a=>{cx.fillStyle='#b9b2ff';cx.beginPath();cx.arc(a.hx,a.hy,10*s,0,7);cx.fill()});
    const headTop=world(R.head.x*.6,-86*s+R.head.y*.6);
    return [{x:a1.hx,y:a1.hy},{x:l1.hx,y:l1.hy},headTop,{x:l2.hx,y:l2.hy},{x:a2.hx,y:a2.hy}];
  }

  function bez(a,b,i,tt){const d=Math.hypot(b.x-a.x,b.y-a.y);
    return {x:(a.x+b.x)/2+Math.sin(tt*1.3+i)*10*S, y:(a.y+b.y)/2+d*.14+Math.cos(tt*1.1+i)*6*S}}
  function qp(a,c,b,t){const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y}}
  const STR=[[9,'rgba(255,150,40,.07)'],[4,'rgba(255,170,60,.22)'],[1.4,'rgba(255,214,150,.95)']];

  function draw(t){
    const tt=t/1000;cx.clearRect(0,0,W,H);
    cx.fillStyle='rgba(255,255,255,.035)';const gs=34*S;
    for(let x=(tt*6)%gs;x<W;x+=gs)for(let y=0;y<H;y+=gs)cx.fillRect(x,y,1.2,1.2);
    const att=drawRobot(tt);
    cx.lineCap='round';cx.globalCompositeOperation='lighter';
    fing.forEach((a,i)=>{
      const b=att[i],c=bez(a,b,i,tt);
      STR.forEach(([w,col])=>{cx.strokeStyle=col;cx.lineWidth=w*S*(1+E*.4);cx.beginPath();cx.moveTo(a.x,a.y);cx.quadraticCurveTo(c.x,c.y,b.x,b.y);cx.stroke()});
      cx.strokeStyle='rgba(255,190,110,.35)';cx.lineWidth=.8*S;cx.beginPath();cx.moveTo(a.x+3*S,a.y);cx.quadraticCurveTo(c.x+9*S,c.y+6*S,b.x+2*S,b.y);cx.stroke();
      cx.fillStyle='rgba(255,190,110,.9)';cx.beginPath();cx.arc(b.x,b.y,2.6*S,0,7);cx.fill();
    });
    pulses.forEach(p=>{const f=fing[p.i],b=att[p.i],q=qp(f,bez(f,b,p.i,tt),b,p.p);
      const gr=cx.createRadialGradient(q.x,q.y,0,q.x,q.y,10*S);gr.addColorStop(0,'rgba(255,240,200,.95)');gr.addColorStop(1,'rgba(255,150,40,0)');
      cx.fillStyle=gr;cx.beginPath();cx.arc(q.x,q.y,10*S,0,7);cx.fill()});
    fing.forEach(f=>{const gr=cx.createRadialGradient(f.x,f.y,0,f.x,f.y,16*S);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(.35,'rgba(255,200,130,.35)');gr.addColorStop(1,'rgba(255,150,40,0)');
      cx.fillStyle=gr;cx.beginPath();cx.arc(f.x,f.y,16*S,0,7);cx.fill();cx.fillStyle='#fff';cx.beginPath();cx.arc(f.x,f.y,4.2*S,0,7);cx.fill()});
    cx.globalCompositeOperation='source-over';
    cx.strokeStyle='rgba(255,255,255,.12)';cx.lineWidth=1;cx.beginPath();cx.arc(hand.x,hand.y+26*S,22*S,0,7);cx.stroke();
    hud.style.transform='translate('+((R.x-10*S)|0)+'px,'+((att[2].y-14*S)|0)+'px) translate(-50%,-100%)';
  }

  // terminal: tarefas do ERP; quanto mais você mexe, mais rápido o agente trabalha
  const TASKS=[['i','IDEIA 14: fila de pedidos como coreografia'],['r','rodando conferir_estoque --loja 1'],['d','pronto · 1.284 itens conferidos em 2,1s'],
    ['r','rodando emitir_nf --lote 12'],['b',''],['d','pronto · 12 notas emitidas em 3,4s'],['i','IDEIA 15: cobrar quem venceu ontem'],
    ['r','rodando cobranca_whatsapp'],['d','pronto · 38 lembretes enviados'],['r','levantando: conciliar caixa (R$ 18.240,00)'],['b',''],
    ['d','pronto · caixa bate com o banco'],['r','rodando atender_cliente --whatsapp'],['d','pronto · 7 orçamentos respondidos'],
    ['i','IDEIA 16: chamar cliente que sumiu há 30 dias'],['r','levantando: reposição de 46 itens'],['d','pronto · pedido de compra gerado'],
    ['r','rodando rota_entregas --frota 3'],['b',''],['d','pronto · 21 entregas em 3 rotas'],['r','rodando fechamento_do_dia'],['d','pronto · relatório no seu WhatsApp']];
  let ti=0,nextLog=0,bi=0;
  function tick(t){
    if(t<nextLog)return; nextLog=t+lerp(1500,240,E);
    const it=TASKS[ti++%TASKS.length], c=it[0], el=document.createElement('div'); el.className=c==='b'?'r':c;
    if(c==='b'){bi=(bi+1)%5;el.textContent='█'.repeat(2+bi)+'░'.repeat(6-bi)+' '+(8+bi*8)+'/40 lotes'}
    else el.textContent=(c==='i'?'▸ ':c==='d'?'✓ ':'· ')+it[1];
    log.appendChild(el); while(log.children.length>14)log.firstChild.remove();
    wait.textContent=E>.35?'trabalhando pesado':E>.08?'executando':'aguardando comando';
  }
  function status(){const busy=E>.35;hud.classList.toggle('busy',busy);
    stEl.textContent=busy?'TRABALHANDO PESADO':E>.08?'EXECUTANDO':'OCIOSA';bar.style.width=(8+E*92).toFixed(0)+'%'}

  function loop(t){const dt=Math.min((t-last)/1000,.05);last=t;step(t,dt);draw(t);tick(t);status();raf=requestAnimationFrame(loop)}
  function start(){if(raf)return;size();if(!inited)init();last=performance.now();raf=requestAnimationFrame(loop)}
  function stop(){cancelAnimationFrame(raf);raf=0}
  new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?start():stop()),{rootMargin:'120px'}).observe(st);
  addEventListener('resize',()=>{const was=mob;size();if(was!==mob)init()});
})();
