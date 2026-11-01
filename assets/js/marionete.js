/* ===== MARIONETE DOS REIS =====
   O mascote real (recorte da arte oficial) é uma malha em WebGL; 5 fios dourados saem das
   pontas dos dedos e deformam braços, joelhos e cabeça. A mão vem da CÂMERA (MediaPipe Hands,
   processado no próprio aparelho) ou, sem câmera, do cursor / dedo na tela. */
(function(){
  const st=document.getElementById('pup'); if(!st) return;
  const cv=st.querySelector('.pup-cv'), cx=cv.getContext('2d'), gc=st.querySelector('.pup-gl');
  const vid=st.querySelector('.pup-vid'), camBtn=st.querySelector('.pup-cam'), camMsg=st.querySelector('.pup-cam-msg');
  const hud=st.querySelector('.pup-hud'), stEl=st.querySelector('.pup-st'), bar=st.querySelector('.pup-bar i');
  const log=st.querySelector('.pup-log'), wait=st.querySelector('.pup-term-wait'), track=st.querySelector('.pup-track');
  const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W=0,H=0,dpr=1,mob=false,raf=0,last=performance.now(),S=1;

  /* ---------- imagem do mascote (587x926) e pontos de controle em px da imagem ---------- */
  const IW=587, IH=926, NECK={x:330,y:300};
  const CT={lh:{x:112,y:332,s:108,m:115}, rh:{x:522,y:410,s:98,m:105}, lk:{x:288,y:690,s:112,m:85}, rk:{x:440,y:702,s:112,m:85},
            lf:{x:236,y:872,s:96,m:115}, rf:{x:462,y:868,s:96,m:115}, cape:{x:70,y:700,s:170}};
  const CROWN={x:345,y:24}, EYES=[{x:296,y:196},{x:404,y:206}], LOGO={x:396,y:410};
  const img=new Image(); img.src='assets/img/mascote-recorte.webp';

  let K=1; const R={x:0,y:0,tilt:0,aH:0,capeV:0,spin:0,spinV:0};
  /* poses do vídeo de referência: OCIOSA (em pé) · EXEC (agacha, 3/4, anda) · VOO (sobe, inclina, gira) ·
     PESADO (base larga, braços pra cima, sobe e desce) · SOLTO (mão saiu: fios caem no canto) */
  const POSE={idle:{q:0,yaw:0,lift:0,lean:0,arms:0,walk:0,bob:0,e:.1},
              exec:{q:.75,yaw:.62,lift:0,lean:.06,arms:.25,walk:1,bob:0,e:.5},
              voo:{q:.15,yaw:0,lift:.09,lean:-.42,arms:.55,walk:0,bob:0,e:.75},
              pesado:{q:.5,yaw:0,lift:0,lean:0,arms:1,walk:0,bob:1,e:.95},
              solto:{q:0,yaw:0,lift:0,lean:0,arms:0,walk:0,bob:0,e:.05}};
  const PZ={q:0,yaw:0,lift:0,lean:0,arms:0,walk:0,bob:0}; let mode='idle',modeAt=0,demoI=0,demoAt=0;
  const DEMO=[['idle',2.6],['exec',3.4],['voo',3.2],['pesado',3.4],['solto',2.4]];
  const FANS={idle:[[-62,8],[-34,-30],[-4,-44],[27,-34],[52,-6]],exec:[[-78,18],[-60,30],[-42,36],[-24,34],[6,14]],
              voo:[[-12,8],[-6,-62],[4,6],[12,8],[20,10]],pesado:[[-12,8],[-6,-62],[4,6],[12,8],[20,10]]};
  const fanC=FANS.idle.map(a=>a.slice());
  const D={lh:{x:0,y:0},rh:{x:0,y:0},lk:{x:0,y:0},rk:{x:0,y:0},lf:{x:0,y:0},rf:{x:0,y:0},head:{x:0,y:0}};
  let gl=null;

  function size(){
    const r=st.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2);
    W=r.width;H=r.height; for(const c of [cv,gc]){c.width=W*dpr;c.height=H*dpr}
    cx.setTransform(dpr,0,0,dpr,0,0); mob=W<760;
    K=(mob?H*.42:H*.8)/IH; S=K*IH/480;
    if(gl)gl.viewport(0,0,gc.width,gc.height);
  }
  const base=()=>mob?{x:W*.46,y:H*.11+NECK.y*K}:{x:W*.27,y:H*.09+NECK.y*K};
  const restHand=()=>camOn?(mob?{x:W*.5,y:H*.3}:{x:W*.55,y:H*.4}):(mob?{x:W*.76,y:H*.16}:{x:W*.5,y:H*.26});

  /* ---------- deformação: ponto da imagem -> tela ---------- */
  const sstep=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};
  function warp(x,y){
    let dx=0,dy=0; const hw=sstep(318,250,y);                 // 1 = cabeça
    if(hw>0){const a=R.aH*hw,ax=x-NECK.x,ay=y-NECK.y,c=Math.cos(a),s=Math.sin(a);
      dx+=ax*c-ay*s-ax+D.head.x*hw; dy+=ax*s+ay*c-ay+D.head.y*hw}
    const body=1-hw;
    for(const k of ['lh','rh','lk','rk','lf','rf']){const c=CT[k],ex=x-c.x,ey=y-c.y,w=Math.exp(-(ex*ex+ey*ey)/(2*c.s*c.s))*body;
      dx+=w*D[k].x; dy+=w*D[k].y}
    const cp=CT.cape,ex=x-cp.x,ey=y-cp.y; dx+=Math.exp(-(ex*ex+ey*ey)/(2*cp.s*cp.s))*sstep(430,620,y)*R.capeV;
    if(PZ.q>0){const q=PZ.q, ky=Math.exp(-((y-690)*(y-690))/(2*110*110));
      dy+=q*150*(1-sstep(640,880,y));                                  // tronco desce, pés ficam no chão
      dx+=q*78*Math.tanh((x-375)/60)*ky}                               // joelhos abrem
    const ang=R.spin+PZ.yaw, cs=Math.cos(ang), sn=Math.sin(ang), sx=(cs<0?-1:1)*Math.max(Math.abs(cs),.05);
    const ux=x+dx-NECK.x, z=ux*sn, pr=1400/(1400+z);                   // perspectiva: lado de lá encolhe
    const px=ux*sx*pr, py=(y+dy-NECK.y)*pr, c=Math.cos(R.tilt), s=Math.sin(R.tilt);
    return {x:R.x+(px*c-py*s)*K, y:R.y+(px*s+py*c)*K};
  }

  /* ---------- WebGL: malha texturizada ---------- */
  const NX=22, NY=34; let prog,posBuf,pos,nIdx=0,texOK=false,resLoc,shLoc;
  (function initGL(){
    gl=gc.getContext('webgl',{premultipliedAlpha:true,alpha:true,antialias:true}); if(!gl)return;
    const sh=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);return s};
    prog=gl.createProgram();
    gl.attachShader(prog,sh(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 uv;uniform vec2 res;varying vec2 v;void main(){vec2 c=p/res*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);v=uv;}'));
    gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v;uniform sampler2D t;uniform float sh;void main(){vec4 c=texture2D(t,v);gl_FragColor=vec4(c.rgb*sh+vec3(.03,.16,.01)*c.a*(1.0-sh),c.a);}'));
    gl.linkProgram(prog);gl.useProgram(prog);
    const uv=new Float32Array((NX+1)*(NY+1)*2); for(let j=0;j<=NY;j++)for(let i=0;i<=NX;i++){const o=(j*(NX+1)+i)*2;uv[o]=i/NX;uv[o+1]=j/NY}
    const ub=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,ub);gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);
    const ul=gl.getAttribLocation(prog,'uv');gl.enableVertexAttribArray(ul);gl.vertexAttribPointer(ul,2,gl.FLOAT,false,0,0);
    pos=new Float32Array(uv.length); posBuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.bufferData(gl.ARRAY_BUFFER,pos,gl.DYNAMIC_DRAW);
    const pl=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(pl);gl.vertexAttribPointer(pl,2,gl.FLOAT,false,0,0);
    const idx=[];for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){const a=j*(NX+1)+i,b=a+1,c=a+NX+1,d=c+1;idx.push(a,b,c,b,d,c)}
    const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);nIdx=idx.length;
    resLoc=gl.getUniformLocation(prog,'res'); shLoc=gl.getUniformLocation(prog,'sh');
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    const tex=gl.createTexture();
    const up=()=>{gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img)}catch(e){gl=null;return}
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);texOK=true};
    if(img.complete&&img.naturalWidth)up();else img.addEventListener('load',up);
  })();
  const front=()=>{const c=Math.cos(R.spin);return .26+.74*sstep(-.15,.2,c)};
  function drawMascot(){
    if(gl){ if(!texOK)return;
      for(let j=0;j<=NY;j++)for(let i=0;i<=NX;i++){const p=warp(i/NX*IW,j/NY*IH),o=(j*(NX+1)+i)*2;pos[o]=p.x;pos[o+1]=p.y}
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(resLoc,W,H);gl.uniform1f(shLoc,front());
      gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,pos);gl.drawElements(gl.TRIANGLES,nIdx,gl.UNSIGNED_SHORT,0);
    } else if(img.complete){ // sem WebGL: imagem inteira balançando
      const o=warp(0,0),cs=Math.cos(R.spin);cx.save();cx.translate(o.x,o.y);cx.rotate(R.tilt);cx.scale((cs<0?-1:1)*Math.max(Math.abs(cs),.05),1);cx.drawImage(img,0,0,IW*K,IH*K);cx.restore();
    }
  }

  /* ---------- mão: cursor/toque ou câmera ---------- */
  const hand={x:0,y:0,tx:0,ty:0}; let ptrAt=-1e9,E=0,camOn=false,camHandAt=-1e9;
  const FAN=[[-62,8],[-34,-30],[-4,-44],[27,-34],[52,-6]];
  const fing=FAN.map(()=>({x:0,y:0,vx:0,vy:0,tx:0,ty:0}));
  let ptrDown=false; const gHist=[]; let gPt=null, pointFr=0;
  st.addEventListener('pointerup',()=>{ptrDown=false},{passive:true}); addEventListener('pointerup',()=>{ptrDown=false});
  function setPtr(e){if(camOn&&performance.now()-camHandAt<1200)return;const r=st.getBoundingClientRect();hand.tx=e.clientX-r.left;hand.ty=e.clientY-r.top;ptrAt=performance.now();st.classList.add('on')}
  st.addEventListener('pointermove',setPtr,{passive:true});
  st.addEventListener('pointerdown',e=>{if(e.target.closest('.pup-cam'))return;ptrDown=true;setPtr(e)},{passive:true});
  st.addEventListener('pointerleave',()=>{ptrAt=performance.now()-2000});

  let inited=false;
  function init(){const b=base(),h=restHand();hand.x=hand.tx=h.x;hand.y=hand.ty=h.y;R.x=b.x;R.y=b.y;
    fing.forEach((f,i)=>{f.x=h.x+FAN[i][0]*S;f.y=h.y+FAN[i][1]*S;f.vx=f.vy=0});inited=true}

  const STM={idle:'OCIOSA',exec:'EXECUTANDO TAREFA',voo:'SUBINDO NOVO SISTEMA',pesado:'TRABALHO PESADO',solto:'OCIOSA'};
  const WTM={idle:'aguardando comando',exec:'executando',voo:'gerando',pesado:'processando o lote',solto:'aguardando comando'};
  const LOGM={idle:['i','mão aberta · agente em espera'],exec:['r','mão deitada · executando implementação'],voo:['i','1 dedo · subindo novo sistema'],
              pesado:['r','levantando: lote pesado (1,3 mil notas)'],solto:['d','mão solta · agente volta pra base']};
  const pulses=[];
  const lerp=(a,b,k)=>a+(b-a)*k, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function step(t,dt){
    const tt=t/1000, h0=restHand(), cam=camOn&&t-camHandAt<700, idle=!cam&&t-ptrAt>2200;
    if(idle){ const sp=RM?.35:1;
      hand.tx=h0.x+Math.sin(tt*.9*sp)*70*S+Math.sin(tt*2.3*sp)*18*S;
      hand.ty=h0.y+Math.cos(tt*1.3*sp)*38*S+Math.sin(tt*3.1*sp)*10*S;
      if(t-ptrAt>6000&&!cam)st.classList.remove('on');
    }
    // ----- qual pose? -----
    let want;
    if(camOn){ want=cam?camMode:(camHandAt>0&&t-camHandAt>700?'solto':'idle') }
    else if(idle){ if(t-demoAt>DEMO[demoI][1]*1000){demoI=(demoI+1)%DEMO.length;demoAt=t} want=DEMO[demoI][0] }
    else { demoAt=t;demoI=0; const v=Math.hypot(hand.tx-hand.x,hand.ty-hand.y)/S;
      want=ptrDown?'pesado':v>60?'voo':v>14?'exec':(mode==='voo'||mode==='exec')&&t-modeAt<900?mode:'idle' }
    if(want!==mode){mode=want;modeAt=t;nextLog=0;forceLine=LOGM[mode]}
    const tp=POSE[mode], kp=1-Math.pow(.015,dt);
    for(const key in PZ)PZ[key]=lerp(PZ[key],tp[key],kp);
    if(mode==='pesado')PZ.q=lerp(PZ.q,.42+.3*Math.sin(tt*5.2),kp);   // agacha e levanta (levantando peso)
    if(mode==='voo')PZ.yaw=lerp(PZ.yaw,Math.sin(tt*1.9)*.9,kp);        // gira no ar
    const fz=FANS[mode]||FANS.idle; fanC.forEach((f,i)=>{f[0]=lerp(f[0],fz[i][0],kp*1.5);f[1]=lerp(f[1],fz[i][1],kp*1.5)});
    const k=1-Math.pow(.001,dt*(idle?1.4:cam?9:6));
    const px=hand.x,py=hand.y; hand.x=lerp(hand.x,hand.tx,k);hand.y=lerp(hand.y,hand.ty,k);
    const sp=Math.hypot(hand.x-px,hand.y-py)/Math.max(dt,.001)/S;
    let flex=0;
    fing.forEach((f,i)=>{
      if(cam&&mode!=='solto'){const kk=1-Math.pow(.0005,dt),nx=lerp(f.x,f.tx,kk),ny=lerp(f.y,f.ty,kk);flex+=Math.hypot(nx-f.x,ny-f.y);f.x=nx;f.y=ny;return}
      let tx,ty;
      if(mode==='solto'){tx=(14+i*16)*S;ty=H-6*S-i*3*S}                 // fios caem no canto, sem mão
      else{const wig=(5+14*E)*S; tx=hand.x+fanC[i][0]*S+Math.sin(tt*(3.1+i*.7)+i)*wig*.5; ty=hand.y+fanC[i][1]*S+Math.sin(tt*(4.3+i*.9)+i*2)*wig}
      const kS=mode==='solto'?40:180; f.vx+=(tx-f.x)*kS*dt; f.vy+=(ty-f.y)*kS*dt+(mode==='solto'?900*S*dt:0); const dm=Math.pow(mode==='solto'?.02:.0005,dt); f.vx*=dm; f.vy*=dm; f.x+=f.vx*dt; f.y+=f.vy*dt;
    });
    const work=clamp(sp/900+flex/Math.max(dt,.001)/S/2500,0,1);
    E=lerp(E,Math.max(work*.5,POSE[mode].e),1-Math.pow(.02,dt));
    // corpo pendurado: segue a mão, balança e inclina
    const b=base(), dx=hand.x-h0.x, dy=hand.y-h0.y, kb=1-Math.pow(.02,dt);
    const kf2=1-Math.pow(cam?.004:.02,dt);
    const fol=mode==='voo'?.5:mode==='solto'?0:.18;
    R.x=lerp(R.x,b.x+clamp(dx*fol,-W*(mob?.12:.1),W*(mob?.12:.22))-PZ.lift*W*.12,kf2);
    R.y=lerp(R.y,b.y+clamp(dy*fol,-H*(mob?.05:.1),H*(mob?.08:.11))-PZ.lift*H+Math.sin(tt*(mode==='voo'?3:1.6))*(mode==='voo'?12:3)*S,kf2);
    R.tilt=lerp(R.tilt,PZ.lean+(mode==='idle'||mode==='solto'?0:clamp((fing[4].y-fing[0].y)*.0015/S+(hand.x-px)/Math.max(dt,.001)*.00015/S,-.2,.2)),kb);
    // cada dedo puxa uma parte: deslocamento do dedo em relação à mão ABERTA (calibrada sozinha)
    fing.forEach((f,i)=>{const ox=f.x-hand.x,oy=f.y-hand.y;
      if(!cam){f.rx=FAN[i][0]*S;f.ry=FAN[i][1]*S;return}
      if(f.rx===undefined||f.calib){f.rx=ox;f.ry=oy;f.calib=false;return}
      const open=Math.hypot(ox,oy)>Math.hypot(f.rx,f.ry), a=1-Math.pow(open?.2:.97,dt); f.rx=lerp(f.rx,ox,a); f.ry=lerp(f.ry,oy,a)});
    const g=(cam?2.4:1.9)*(mode==='idle'?1:.45), rel=i=>({x:(fing[i].x-hand.x-fing[i].rx)*g+dx*.12,y:(fing[i].y-hand.y-fing[i].ry)*g+dy*.12});
    const kj=1-Math.pow(.004,dt), put=(key,v,g)=>{const m=CT[key].m;D[key].x=lerp(D[key].x,clamp(v.x/K*g,-m,m),kj);D[key].y=lerp(D[key].y,clamp(v.y/K*g,-m,m),kj)};
    const A=PZ.arms, wk=Math.sin(tt*7)*PZ.walk;
    const add=(v,ax,ay)=>({x:v.x+ax*K,y:v.y+ay*K});
    put('lh',add(rel(0),18*A,-120*A),1); put('rh',add(rel(4),-18*A,-112*A),1);
    put('lk',add(rel(1),0,-Math.max(0,wk)*70),.6); put('rk',add(rel(3),0,-Math.max(0,-wk)*70),.6);
    const hv=rel(2); D.head.x=lerp(D.head.x,clamp(hv.x/K*.25,-16,16),kj); D.head.y=lerp(D.head.y,clamp(hv.y/K*.25,-14,10),kj);
    R.aH=lerp(R.aH,clamp(hv.x/K*.004,-.3,.3),kj);
    // pés balançam atrasados (pendurados)
    const kf=1-Math.pow(.03,dt);
    const dang=mode==='voo'?50:0;                                   // no voo as pernas ficam pra trás
    D.lf.x=lerp(D.lf.x,D.lk.x*1.2-R.tilt*60+dang,kf);D.lf.y=lerp(D.lf.y,D.lk.y*.9-dang*.5,kf);
    D.rf.x=lerp(D.rf.x,D.rk.x*1.2-R.tilt*60+dang,kf);D.rf.y=lerp(D.rf.y,D.rk.y*.9-dang*.5,kf);
    R.capeV=lerp(R.capeV,clamp(-(hand.x-px)/Math.max(dt,.001)/K*.03,-40,40)+Math.sin(tt*1.4)*8,1-Math.pow(.05,dt));
    spinGesture(t,dt,cam);
    if(!RM&&Math.random()<dt*(2+E*26))pulses.push({i:(Math.random()*5)|0,p:0,v:.7+Math.random()*.9});
    for(let j=pulses.length-1;j>=0;j--){pulses[j].p+=pulses[j].v*dt*(1+E*1.5);if(pulses[j].p>1)pulses.splice(j,1)}
  }

  let spinLogged=0;
  function spinGesture(t,dt,cam){
    const gp=cam?(pointFr>=3?gPt:null):(ptrDown&&t-ptrAt<300?{x:hand.tx,y:hand.ty}:null);
    let drive=null;
    if(gp){gHist.push({x:gp.x,y:gp.y,t}); while(gHist.length&&t-gHist[0].t>700)gHist.shift();
      if(gHist.length>=8){let cx0=0,cy0=0;gHist.forEach(q=>{cx0+=q.x;cy0+=q.y});cx0/=gHist.length;cy0/=gHist.length;
        let rad=0;gHist.forEach(q=>rad+=Math.hypot(q.x-cx0,q.y-cy0));rad/=gHist.length;
        const a=gHist[gHist.length-1],b=gHist[gHist.length-2];
        if(rad>60*S&&b){let d=Math.atan2(a.y-cy0,a.x-cx0)-Math.atan2(b.y-cy0,b.x-cx0);if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;
          drive=d/Math.max(a.t-b.t,8)*1000*1.2}}
    } else gHist.length=0;
    if(drive!==null){R.spinV=lerp(R.spinV,clamp(drive,-14,14),.3)}
    else R.spinV*=Math.pow(.25,dt);
    R.spin+=R.spinV*dt;
    if(Math.abs(R.spinV)<.6){const tgt=Math.round(R.spin/(2*Math.PI))*2*Math.PI;R.spin=lerp(R.spin,tgt,1-Math.pow(.08,dt))}
    if(Math.abs(R.spinV)>2&&t-spinLogged>2500){spinLogged=t;nextLog=0;forceLine=['i','gesto: girar 360° · agente obedeceu']}
  }
  let forceLine=null;
  function bez(a,b,i,tt){const d=Math.hypot(b.x-a.x,b.y-a.y);
    const sag=mode==='solto'?.35:.12; return {x:(a.x+b.x)/2+Math.sin(tt*1.3+i)*10*S, y:Math.min(H,(a.y+b.y)/2+d*sag+Math.cos(tt*1.1+i)*6*S)}}
  function qp(a,c,b,t){const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y}}
  const STR=[[9,'rgba(255,150,40,.07)'],[4,'rgba(255,170,60,.22)'],[1.4,'rgba(255,214,150,.95)']];
  function glow(p,r,c0,c1){const g=cx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,c0);g.addColorStop(1,c1);cx.fillStyle=g;cx.beginPath();cx.arc(p.x,p.y,r,0,7);cx.fill()}

  function draw(t){
    const tt=t/1000; cx.clearRect(0,0,W,H);
    if(!camOn){cx.fillStyle='rgba(255,255,255,.035)';const gs=34*S;for(let x=(tt*6)%gs;x<W;x+=gs)for(let y=0;y<H;y+=gs)cx.fillRect(x,y,1.2,1.2)}
    drawMascot();
    const att=[warp(CT.lh.x,CT.lh.y),warp(CT.lk.x,CT.lk.y),warp(CROWN.x,CROWN.y),warp(CT.rk.x,CT.rk.y),warp(CT.rh.x,CT.rh.y)];
    cx.globalCompositeOperation='lighter';
    // olhos e logo acendem com o trabalho
    const fr=Math.max(0,Math.cos(R.spin)), pe=(.3+.3*E+.08*Math.sin(tt*5))*fr;
    EYES.forEach(e=>glow(warp(e.x,e.y),36*K,'rgba(255,220,90,'+pe.toFixed(2)+')','rgba(255,200,60,0)'));
    glow(warp(LOGO.x,LOGO.y),60*K,'rgba(124,255,57,'+((.1+.25*E)*fr).toFixed(2)+')','rgba(124,255,57,0)');
    // fios dourados
    cx.lineCap='round';
    fing.forEach((a,i)=>{const b=att[i],c=bez(a,b,i,tt);
      STR.forEach(([w,col])=>{cx.strokeStyle=col;cx.lineWidth=w*S*(1+E*.4);cx.beginPath();cx.moveTo(a.x,a.y);cx.quadraticCurveTo(c.x,c.y,b.x,b.y);cx.stroke()});
      cx.strokeStyle='rgba(255,190,110,.35)';cx.lineWidth=.8*S;cx.beginPath();cx.moveTo(a.x+3*S,a.y);cx.quadraticCurveTo(c.x+9*S,c.y+6*S,b.x+2*S,b.y);cx.stroke();
      cx.fillStyle='rgba(255,200,120,.95)';cx.beginPath();cx.arc(b.x,b.y,3*S,0,7);cx.fill()});
    pulses.forEach(p=>{const f=fing[p.i],b=att[p.i],q=qp(f,bez(f,b,p.i,tt),b,p.p);glow(q,10*S,'rgba(255,240,200,.95)','rgba(255,150,40,0)')});
    fing.forEach(f=>{glow(f,16*S,'rgba(255,230,190,.8)','rgba(255,150,40,0)');cx.fillStyle='#fff';cx.beginPath();cx.arc(f.x,f.y,4.2*S,0,7);cx.fill()});
    cx.globalCompositeOperation='source-over';
    if(!camOn){cx.strokeStyle='rgba(255,255,255,.12)';cx.lineWidth=1;cx.beginPath();cx.arc(hand.x,hand.y+26*S,22*S,0,7);cx.stroke()}
    hud.style.transform='translate('+((att[2].x)|0)+'px,'+((att[2].y-10*S)|0)+'px) translate(-50%,-100%) perspective(700px) rotateY('+(-(R.spin+PZ.yaw)*.8).toFixed(3)+'rad) rotate('+(R.tilt*.8).toFixed(3)+'rad)';
  }

  /* ---------- câmera + MediaPipe Hands (tudo roda no aparelho, nada é enviado) ---------- */
  const MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
  const MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  let lm=null,stream=null,lastVT=-1,camMode='idle',camCand='idle',camCandAt=0,vooAt=-1e9,camPrev=null,camPrevT=0,camSpd=0;
  const TIPS=[4,8,12,16,20];
  function say(m){camMsg.textContent=m;camMsg.classList.toggle('vis',!!m)}
  async function camStart(){
    camBtn.disabled=true; say('ligando a câmera…');
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:540}},audio:false});
      vid.srcObject=stream; await vid.play(); st.classList.add('cam');
      if(!lm){ say('carregando o rastreamento da mão…');
        const v=await import(MP+'/vision_bundle.mjs'); const fs=await v.FilesetResolver.forVisionTasks(MP+'/wasm');
        const opt=d=>({baseOptions:{modelAssetPath:MODEL,delegate:d},runningMode:'VIDEO',numHands:1});
        try{lm=await v.HandLandmarker.createFromOptions(fs,opt('GPU'))}catch(e){lm=await v.HandLandmarker.createFromOptions(fs,opt('CPU'))}
      }
      camOn=true; camBtn.textContent='Desligar câmera'; say('mostre a mão aberta para a câmera');
    }catch(e){ camStop(); say(e&&e.name==='NotAllowedError'?'câmera bloqueada — libere no cadeado do navegador':'não deu para abrir a câmera neste aparelho') }
    camBtn.disabled=false;
  }
  function camStop(){camOn=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;vid.srcObject=null;st.classList.remove('cam');
    camBtn.textContent='Ativar câmera';track.textContent='[--] sem câmera · usando o cursor'}
  camBtn.addEventListener('click',()=>{if(camOn){camStop();say('')}else camStart()});
  function trackHand(t){
    if(!camOn||!lm||vid.readyState<2||vid.currentTime===lastVT)return; lastVT=vid.currentTime;
    let r; try{r=lm.detectForVideo(vid,t)}catch(e){return}
    const L=r&&r.landmarks&&r.landmarks[0];
    if(!L){if(t-camHandAt>700){track.textContent='[..] procurando a mão';if(t-camHandAt>4000)say('mostre a mão aberta para a câmera')}return}
    // vídeo em object-fit:cover e espelhado
    const vw=vid.videoWidth,vh=vid.videoHeight,sc=Math.max(W/vw,H/vh),dw=vw*sc,dh=vh*sc,ox=(W-dw)/2,oy=(H-dh)/2;
    const P=p=>({x:ox+(1-p.x)*dw,y:oy+p.y*dh});
    const palm=P(L[9]); hand.tx=palm.x; hand.ty=palm.y;
    const hs=camPrev?Math.hypot(palm.x-camPrev.x,palm.y-camPrev.y)/Math.max(t-camPrevT,1)*1000/S:0; camSpd=lerp(camSpd,hs,.3);
    const dd=(a,b)=>Math.hypot(L[a].x-L[b].x,L[a].y-L[b].y), ext=(tip,pip)=>dd(0,tip)>dd(0,pip)*1.12;
    const pointing=ext(8,6)&&!ext(12,10)&&!ext(16,14)&&!ext(20,18);
    const hx=L[9].x-L[0].x, hy=L[9].y-L[0].y;                          // punho -> base do dedo médio
    const palmDown=Math.abs(hx)>Math.abs(hy)*1.05||hy>0;              // mão deitada (controle de marionete)
    let cand=pointing?(camSpd>260?'voo':'pesado'):palmDown?'exec':'idle';
    if(cand==='voo')vooAt=t; else if(pointing&&t-vooAt<1200)cand='voo';   // voo segura um pouco
    if(cand!==camCand){camCand=cand;camCandAt=t}
    if(t-camCandAt>230)camMode=camCand;                                   // gesto precisa durar ~0,25 s
    pointFr=pointing?pointFr+1:0; gPt=P(L[8]);
    const tips=TIPS.map(i=>P(L[i])).sort((a,b)=>a.x-b.x);   // esquerda->direita: fios não cruzam
    tips.forEach((p,i)=>{fing[i].tx=p.x;fing[i].ty=p.y});
    if(t-camHandAt>700){fing.forEach(f=>{f.x=f.tx;f.y=f.ty;f.calib=true});hand.x=palm.x;hand.y=palm.y;say('')}
    camPrev=palm;camPrevT=t; camHandAt=t; track.textContent='[ok] mão rastreada'; st.classList.add('on');
  }

  /* ---------- terminal e status ---------- */
  const TASKS=[['i','IDEIA 14: fila de pedidos como coreografia'],['r','rodando conferir_estoque --loja 1'],['d','pronto · 1.284 itens conferidos em 2,1s'],
    ['r','rodando emitir_nf --lote 12'],['b',''],['d','pronto · 12 notas emitidas em 3,4s'],['i','IDEIA 15: cobrar quem venceu ontem'],
    ['r','rodando cobranca_whatsapp'],['d','pronto · 38 lembretes enviados'],['r','levantando: conciliar caixa (R$ 18.240,00)'],['b',''],
    ['d','pronto · caixa bate com o banco'],['r','rodando atender_cliente --whatsapp'],['d','pronto · 7 orçamentos respondidos'],
    ['i','IDEIA 16: chamar cliente que sumiu há 30 dias'],['r','levantando: reposição de 46 itens'],['d','pronto · pedido de compra gerado'],
    ['r','rodando rota_entregas --frota 3'],['b',''],['d','pronto · 21 entregas em 3 rotas'],['r','rodando fechamento_do_dia'],['d','pronto · relatório no seu WhatsApp']];
  let ti=0,nextLog=0,bi=0;
  function tick(t){
    if(t<nextLog)return; nextLog=t+lerp(1500,240,E);
    const it=forceLine||TASKS[ti++%TASKS.length],c=it[0],el=document.createElement('div');forceLine=null;el.className=c==='b'?'r':c;
    if(c==='b'){bi=(bi+1)%5;el.textContent='█'.repeat(2+bi)+'░'.repeat(6-bi)+' '+(8+bi*8)+'/40 lotes'}
    else el.textContent=(c==='i'?'▸ ':c==='d'?'✓ ':'· ')+it[1];
    log.appendChild(el);while(log.children.length>14)log.firstChild.remove();
    wait.textContent=WTM[mode];
  }
  function status(){const busy=mode==='pesado'||mode==='voo';hud.classList.toggle('busy',busy);
    stEl.textContent=Math.abs(R.spinV)>1.5?'GIRANDO':STM[mode];bar.style.width=(8+E*92).toFixed(0)+'%'}

  function loop(t){const dt=Math.min((t-last)/1000,.05);last=t;trackHand(t);step(t,dt);draw(t);tick(t);status();raf=requestAnimationFrame(loop)}
  function start(){if(raf)return;size();if(!inited)init();last=performance.now();raf=requestAnimationFrame(loop)}
  function stop(){cancelAnimationFrame(raf);raf=0}
  new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?start():stop()),{rootMargin:'120px'}).observe(st);
  addEventListener('resize',()=>{const was=mob;size();if(was!==mob)init()});
  if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia))camBtn.style.display='none';
})();
