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
  /* ---- Mascote DOS REIS: armadura preta com filete neon, olhos amarelos, fones e coroa dourados, capa verde ---- */
  const NEON='#7CFF39', logo=new Image(); logo.src='assets/logo-mark.webp';
  let capeV=0;
  function line(ax,ay,bx,by){cx.beginPath();cx.moveTo(ax,ay);cx.lineTo(bx,by);cx.stroke()}
  function rrect(x,y,w,h,r){cx.beginPath();if(cx.roundRect)cx.roundRect(x,y,w,h,r);else cx.rect(x,y,w,h)}
  function gold(x0,y0,x1,y1){const g=cx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'#fff4b0');g.addColorStop(.35,'#f2c444');g.addColorStop(.7,'#c88a1c');g.addColorStop(1,'#7a4c0c');return g}
  function limb(ax,ay,bx,by,w){
    cx.lineCap='round';
    cx.strokeStyle='#020302';cx.lineWidth=w+3*S;line(ax,ay,bx,by);
    const g=cx.createLinearGradient(ax-w,ay-w,bx+w,by+w);g.addColorStop(0,'#3c403c');g.addColorStop(.45,'#131513');g.addColorStop(1,'#050605');
    cx.strokeStyle=g;cx.lineWidth=w;line(ax,ay,bx,by);
    const dx=bx-ax,dy=by-ay,d=Math.hypot(dx,dy)||1,nx=-dy/d*w*.3,ny=dx/d*w*.3;
    cx.shadowColor=NEON;cx.shadowBlur=8*S;cx.strokeStyle=NEON;cx.lineWidth=Math.max(1.3,w*.11);line(ax+nx,ay+ny,bx+nx,by+ny);cx.shadowBlur=0;
    cx.strokeStyle='rgba(255,255,255,.2)';cx.lineWidth=w*.13;line(ax-nx*.6,ay-ny*.6,bx-nx*.6,by-ny*.6);
  }
  function joint(x,y,r){cx.fillStyle='#0a0b0a';cx.beginPath();cx.arc(x,y,r,0,7);cx.fill();
    cx.shadowColor=NEON;cx.shadowBlur=10*S;cx.strokeStyle=NEON;cx.lineWidth=1.6*S;cx.beginPath();cx.arc(x,y,r*.62,0,7);cx.stroke();cx.shadowBlur=0}
  function glove(x,y,r,ang){
    const g=cx.createRadialGradient(x-r*.4,y-r*.4,r*.1,x,y,r*1.2);g.addColorStop(0,'#d9dbd9');g.addColorStop(.55,'#8d908d');g.addColorStop(1,'#3d403d');
    cx.fillStyle='#050605';cx.beginPath();cx.arc(x,y,r+1.5*S,0,7);cx.fill();
    cx.fillStyle=g;cx.beginPath();cx.arc(x,y,r,0,7);cx.fill();
    cx.beginPath();cx.ellipse(x+Math.cos(ang)*r*.9,y+Math.sin(ang)*r*.9,r*.42,r*.3,ang,0,7);cx.fill();
    cx.strokeStyle=NEON;cx.lineWidth=2.2*S;cx.shadowColor=NEON;cx.shadowBlur=8*S;cx.beginPath();cx.arc(x,y,r*1.02,ang+2.2,ang+4.1);cx.stroke();cx.shadowBlur=0;
  }
  function boot(x,y,d){
    cx.fillStyle='#050605';rrect(x-21*S+d*5*S,y-12*S,42*S,24*S,9*S);cx.fill();
    const g=cx.createLinearGradient(x,y-12*S,x,y+8*S);g.addColorStop(0,'#3a3d3a');g.addColorStop(1,'#0b0c0b');
    cx.fillStyle=g;rrect(x-19*S+d*5*S,y-11*S,38*S,18*S,8*S);cx.fill();
    cx.shadowColor=NEON;cx.shadowBlur=12*S;cx.fillStyle=NEON;rrect(x-20*S+d*5*S,y+6*S,40*S,5*S,2.5*S);cx.fill();cx.shadowBlur=0;
  }

  function drawRobot(tt){
    const s=S, sh=[world(-42*s,-12*s),world(42*s,-12*s)], hp=[world(-20*s,66*s),world(20*s,66*s)];
    const LH=world(-72*s+R.lh.x,40*s+R.lh.y), RH=world(72*s+R.rh.x,40*s+R.rh.y);
    const LK=world(-24*s+R.lk.x,114*s+R.lk.y), RK=world(24*s+R.rk.x,114*s+R.rk.y);
    const a1=ik(sh[0].x,sh[0].y,LH.x,LH.y,40*s,38*s,1), a2=ik(sh[1].x,sh[1].y,RH.x,RH.y,40*s,38*s,-1);
    const l1=ik(hp[0].x,hp[0].y,LK.x,LK.y,46*s,1,0), l2=ik(hp[1].x,hp[1].y,RK.x,RK.y,46*s,1,0);
    R.lf.x=lerp(R.lf.x,l1.hx-6*s,.15);R.lf.y=lerp(R.lf.y,l1.hy+48*s,.15);R.rf.x=lerp(R.rf.x,l2.hx+6*s,.15);R.rf.y=lerp(R.rf.y,l2.hy+48*s,.15);
    const fix=(k,f)=>{const d=Math.hypot(f.x-k.hx,f.y-k.hy)||1;return{x:k.hx+(f.x-k.hx)/d*46*s,y:k.hy+(f.y-k.hy)/d*46*s}};
    const LF=fix(l1,R.lf),RF=fix(l2,R.rf);
    // brilho verde no chão
    let fg=cx.createRadialGradient(R.x,R.y+208*s,0,R.x,R.y+208*s,120*s);fg.addColorStop(0,'rgba(124,255,57,.22)');fg.addColorStop(1,'rgba(124,255,57,0)');
    cx.fillStyle=fg;cx.beginPath();cx.ellipse(R.x,R.y+208*s,120*s,20*s,0,0,7);cx.fill();
    // capa (atrás de tudo), balança com o movimento
    capeV=lerp(capeV,clamp(-(hand.x-hand.tx)*.08,-40,40)*s+Math.sin(tt*1.4)*7*s,.08);
    const c0=world(-36*s,-20*s),c1=world(36*s,-20*s),hl={x:R.x-66*s+capeV,y:R.y+170*s},hr={x:R.x+66*s+capeV*1.3,y:R.y+164*s};
    const capePath=()=>{cx.beginPath();cx.moveTo(c0.x,c0.y);cx.quadraticCurveTo(c0.x-34*s,c0.y+80*s,hl.x,hl.y);
      cx.quadraticCurveTo(R.x-20*s+capeV*.5,R.y+(158+8*Math.sin(tt*2))*s,R.x+capeV*.7,R.y+172*s);
      cx.quadraticCurveTo(R.x+20*s+capeV*.9,R.y+(160+8*Math.cos(tt*2.2))*s,hr.x,hr.y);
      cx.quadraticCurveTo(c1.x+34*s,c1.y+80*s,c1.x,c1.y);cx.closePath()};
    capePath();let cg=cx.createLinearGradient(R.x,R.y-20*s,R.x,R.y+172*s);cg.addColorStop(0,'rgba(2,3,2,.95)');cg.addColorStop(.75,'rgba(10,26,6,.95)');cg.addColorStop(1,'rgba(58,130,20,.9)');
    cx.fillStyle=cg;cx.fill();
    // só as bordas laterais acesas, como na arte
    cx.shadowColor=NEON;cx.shadowBlur=12*s;cx.strokeStyle='rgba(124,255,57,.85)';cx.lineWidth=2*s;
    cx.beginPath();cx.moveTo(c0.x,c0.y);cx.quadraticCurveTo(c0.x-34*s,c0.y+80*s,hl.x,hl.y);cx.moveTo(c1.x,c1.y);cx.quadraticCurveTo(c1.x+34*s,c1.y+80*s,hr.x,hr.y);cx.stroke();cx.shadowBlur=0;
    // pernas
    limb(hp[0].x,hp[0].y,l1.hx,l1.hy,23*s);limb(l1.hx,l1.hy,LF.x,LF.y,21*s);
    limb(hp[1].x,hp[1].y,l2.hx,l2.hy,23*s);limb(l2.hx,l2.hy,RF.x,RF.y,21*s);
    [l1,l2].forEach(l=>{cx.fillStyle='#0b0c0b';rrect(l.hx-12*s,l.hy-12*s,24*s,24*s,7*s);cx.fill();
      cx.shadowColor=NEON;cx.shadowBlur=10*s;cx.strokeStyle=NEON;cx.lineWidth=1.8*s;cx.stroke();cx.shadowBlur=0});
    boot(LF.x,LF.y,-1);boot(RF.x,RF.y,1);
    // tronco
    cx.save();cx.translate(R.x,R.y);cx.rotate(R.tilt);
    cx.beginPath();cx.moveTo(-50*s,-24*s);cx.quadraticCurveTo(0,-34*s,50*s,-24*s);cx.lineTo(38*s,46*s);cx.quadraticCurveTo(0,52*s,-38*s,46*s);cx.closePath();
    let g=cx.createLinearGradient(-50*s,-34*s,40*s,50*s);g.addColorStop(0,'#41453f');g.addColorStop(.35,'#151715');g.addColorStop(1,'#030403');
    cx.fillStyle=g;cx.fill();cx.shadowColor=NEON;cx.shadowBlur=12*s;cx.strokeStyle=NEON;cx.lineWidth=2.2*s;cx.stroke();cx.shadowBlur=0;
    // filetes neon do peito
    cx.strokeStyle='rgba(124,255,57,.75)';cx.lineWidth=1.3*s;
    cx.beginPath();cx.moveTo(-40*s,-14*s);cx.quadraticCurveTo(-30*s,14*s,-34*s,40*s);cx.moveTo(40*s,-14*s);cx.quadraticCurveTo(30*s,14*s,34*s,40*s);cx.stroke();
    // logo no peito
    if(logo.complete&&logo.naturalWidth){cx.shadowColor='rgba(124,255,57,.6)';cx.shadowBlur=10*s*(.5+E);cx.drawImage(logo,-23*s,-20*s,46*s,46*s);cx.shadowBlur=0}
    else{cx.fillStyle=NEON;cx.font='700 '+(30*s)+'px Georgia,serif';cx.textAlign='center';cx.fillText('R',0,14*s)}
    // ombreiras
    [-1,1].forEach(d=>{cx.fillStyle='#0d0e0d';cx.beginPath();cx.ellipse(d*46*s,-16*s,17*s,13*s,d*.4,0,7);cx.fill();
      cx.shadowColor=NEON;cx.shadowBlur=10*s;cx.strokeStyle=NEON;cx.lineWidth=2*s;cx.stroke();cx.shadowBlur=0});
    // cinto + fivela dourada (acende quando trabalha pesado)
    cx.fillStyle='#262826';rrect(-40*s,44*s,80*s,12*s,4*s);cx.fill();
    cx.fillStyle=gold(-10*s,42*s,10*s,58*s);rrect(-10*s,42*s,20*s,16*s,3*s);cx.fill();
    cx.strokeStyle=E>.35?'#fff2a0':NEON;cx.lineWidth=2*s;cx.shadowColor=cx.strokeStyle;cx.shadowBlur=8*s;
    cx.beginPath();cx.moveTo(-5*s,45*s);cx.lineTo(5*s,55*s);cx.moveTo(5*s,45*s);cx.lineTo(-5*s,55*s);cx.stroke();cx.shadowBlur=0;
    cx.fillStyle='#0a0b0a';rrect(-30*s,56*s,60*s,16*s,6*s);cx.fill();
    // cabeça (grande, estilo mascote)
    cx.translate(R.head.x*.6,-66*s+R.head.y*.6);cx.rotate(clamp(R.head.x*.01/s,-.3,.3));cx.scale(1.3,1.3);
    cx.fillStyle='#1a1c1a';rrect(-9*s,18*s,18*s,16*s,4*s);cx.fill();
    // fones dourados
    [-1,1].forEach(d=>{cx.fillStyle=gold(d*40*s,-20*s,d*52*s,20*s);cx.beginPath();cx.ellipse(d*42*s,0,10*s,19*s,0,0,7);cx.fill();
      cx.fillStyle='#111';cx.beginPath();cx.ellipse(d*44*s,0,4.5*s,11*s,0,0,7);cx.fill()});
    g=cx.createRadialGradient(-14*s,-20*s,4*s,0,0,48*s);g.addColorStop(0,'#5a5e58');g.addColorStop(.4,'#1a1c1a');g.addColorStop(1,'#020302');
    cx.fillStyle=g;cx.beginPath();cx.ellipse(0,0,40*s,37*s,0,0,7);cx.fill();cx.strokeStyle='rgba(124,255,57,.35)';cx.lineWidth=1.4*s;cx.stroke();
    cx.fillStyle='#000';rrect(-29*s,-17*s,58*s,36*s,15*s);cx.fill();
    cx.fillStyle='rgba(255,255,255,.07)';cx.beginPath();cx.ellipse(-12*s,-10*s,12*s,5*s,-.3,0,7);cx.fill();
    // olhos amarelos
    const blink=(Math.sin(tt*1.7)>.985)?.12:1, look=clamp((hand.x-R.x)/W*14,-6,6)*s;
    cx.shadowColor='#ffd23f';cx.shadowBlur=18*s;
    [-1,1].forEach(d=>{const eg=cx.createRadialGradient(d*13*s+look,-1*s,0,d*13*s+look,1*s,10*s);eg.addColorStop(0,'#fffbe0');eg.addColorStop(.6,'#ffe066');eg.addColorStop(1,'#f0a818');
      cx.fillStyle=eg;cx.beginPath();cx.ellipse(d*13*s+look,1*s,7.5*s,10*s*blink,0,0,7);cx.fill()});
    cx.shadowBlur=0;
    // coroa dourada
    cx.save();cx.translate(0,-30*s);
    const pk=[[-30,0],[-32,-26],[-20,-12],[-12,-32],[-4,-14],[0,-38],[4,-14],[12,-32],[20,-12],[32,-26],[30,0]];
    cx.beginPath();pk.forEach(([x,y],i)=>i?cx.lineTo(x*s,y*s):cx.moveTo(x*s,y*s));cx.closePath();
    cx.fillStyle=gold(-30*s,-38*s,30*s,4*s);cx.shadowColor='rgba(255,200,60,.55)';cx.shadowBlur=14*s*(.6+E);cx.fill();cx.shadowBlur=0;
    cx.strokeStyle='#6b420a';cx.lineWidth=1*s;cx.stroke();
    cx.fillStyle=gold(-32*s,-6*s,32*s,6*s);rrect(-32*s,-6*s,64*s,9*s,3*s);cx.fill();
    [[-32,-26],[-12,-32],[0,-38],[12,-32],[32,-26]].forEach(([x,y])=>{cx.fillStyle='#fff6c8';cx.beginPath();cx.arc(x*s,y*s,2.4*s,0,7);cx.fill()});
    cx.restore();
    cx.restore();
    // braços (na frente)
    limb(sh[0].x,sh[0].y,a1.ex,a1.ey,19*s);limb(a1.ex,a1.ey,a1.hx,a1.hy,17*s);
    limb(sh[1].x,sh[1].y,a2.ex,a2.ey,19*s);limb(a2.ex,a2.ey,a2.hx,a2.hy,17*s);
    joint(a1.ex,a1.ey,9*s);joint(a2.ex,a2.ey,9*s);
    glove(a1.hx,a1.hy,12*s,Math.atan2(a1.hy-a1.ey,a1.hx-a1.ex)-1.2);glove(a2.hx,a2.hy,12*s,Math.atan2(a2.hy-a2.ey,a2.hx-a2.ex)+1.2);
    const headTop=world(R.head.x*.6,-150*s+R.head.y*.6);
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
