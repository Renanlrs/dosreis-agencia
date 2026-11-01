/* ===== MARIONETE DOS REIS =====
   O mascote real (recorte da arte oficial) vira um BONECO ARTICULADO: a malha WebGL tem um
   esqueleto 2D (tronco, cabeça, capa, ombro/cotovelo, quadril/joelho) com skinning por peso.
   Braços e pernas dobram por cinemática inversa nas juntas — nada de esticar a imagem — e mãos,
   pés e capa vão em molas, com inércia. 5 fios dourados saem das pontas dos dedos: a mão vem da
   CÂMERA (MediaPipe Hands, processado no próprio aparelho) ou, sem câmera, do cursor / toque. */
(function(){
  const st=document.getElementById('pup'); if(!st) return;
  const cv=st.querySelector('.pup-cv'), cx=cv.getContext('2d'), gc=st.querySelector('.pup-gl');
  const vid=st.querySelector('.pup-vid'), camBtn=st.querySelector('.pup-cam'), camMsg=st.querySelector('.pup-cam-msg');
  const hud=st.querySelector('.pup-hud'), stEl=st.querySelector('.pup-st'), bar=st.querySelector('.pup-bar i');
  const log=st.querySelector('.pup-log'), wait=st.querySelector('.pup-term-wait'), track=st.querySelector('.pup-track');
  const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W=0,H=0,dpr=1,mob=false,raf=0,last=performance.now(),S=1;
  const lerp=(a,b,k)=>a+(b-a)*k, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const sstep=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};

  /* ---------- imagem do mascote (587x926) e esqueleto em px da imagem ---------- */
  const IW=587, IH=926, NECK={x:335,y:312};
  const J={P:{x:345,y:545}, N:{x:335,y:312}, C:{x:240,y:420},
           SL:{x:245,y:345}, EL:{x:190,y:368}, WL:{x:140,y:345},      // braço esquerdo (mão aberta)
           SR:{x:425,y:375}, ER:{x:462,y:478}, WR:{x:505,y:445},      // braço direito (joinha)
           HL:{x:300,y:585}, KL:{x:276,y:700}, AL:{x:255,y:815},      // perna esquerda
           HR:{x:400,y:590}, KR:{x:430,y:706}, AR:{x:432,y:820}};     // perna direita
  const CROWN={x:345,y:24}, EYES=[{x:296,y:196},{x:404,y:206}], LOGO={x:396,y:410};
  const ATT=[{x:96,y:330},{x:278,y:700},CROWN,{x:430,y:706},{x:522,y:400}];   // onde cada fio amarra
  const img=new Image(); img.src='assets/img/mascote-recorte.webp';

  // ossos para o skinning: segmento + raio de influência. 0 tronco · 1 cabeça · 2 capa · 3/4 braço E · 5/6 braço D · 7/8 perna E · 9/10 perna D
  const BW=[[J.P,J.N,78],[J.N,{x:335,y:120},1],[J.C,{x:60,y:780},58],
            [J.SL,J.EL,30],[J.EL,{x:55,y:322},42],[J.SR,J.ER,30],[J.ER,{x:522,y:385},38],
            [J.HL,J.KL,40],[J.KL,{x:220,y:872},46],[J.HR,J.KR,40],[J.KR,{x:470,y:872},46]];
  const NB=BW.length;
  function segD(px,py,a,b){const vx=b.x-a.x,vy=b.y-a.y,t=clamp(((px-a.x)*vx+(py-a.y)*vy)/(vx*vx+vy*vy),0,1);return Math.hypot(px-a.x-vx*t,py-a.y-vy*t)}
  function weights(x,y){                       // até 4 ossos por vértice
    const w=new Float32Array(NB);
    for(let i=0;i<NB;i++){if(i===1)continue;const d=Math.max(segD(x,y,BW[i][0],BW[i][1]),1)/BW[i][2];w[i]=1/(d*d*d*d+1e-6)}
    let s=0;for(let i=0;i<NB;i++)s+=w[i];for(let i=0;i<NB;i++)w[i]/=s;
    const h=(x>165&&x<515)?sstep(322,288,y):0;  // cabeça: tudo acima do pescoço
    if(h>0){for(let i=0;i<NB;i++)w[i]*=1-h;w[1]+=h}
    const top=[...w.keys()].sort((a,b)=>w[b]-w[a]).slice(0,4);let ts=0;top.forEach(i=>ts+=w[i]);
    return top.map(i=>[i,w[i]/ts]);
  }
  const ATTW=ATT.map(p=>weights(p.x,p.y)), EYEW=EYES.map(p=>weights(p.x,p.y)), LOGOW=weights(LOGO.x,LOGO.y);

  /* ---------- poses do vídeo de referência ----------
     OCIOSA (em pé, respirando) · EXEC (agacha, 3/4, anda) · VOO (sobe, inclina, pernas pra trás) ·
     PESADO (base larga, braços pra cima, sobe e desce) · SOLTO (mão saiu: fios caem, boneco amolece) */
  let K=1; const R={x:0,y:0,tilt:0,capeV:0,spin:0,spinV:0};
  const POSE={idle:{q:0,yaw:0,lift:0,lean:0,raise:0,walk:0,fly:0,limp:0,e:.1},
              exec:{q:.38,yaw:.58,lift:0,lean:.05,raise:0,walk:1,fly:0,limp:0,e:.5},
              voo:{q:0,yaw:0,lift:.09,lean:-.38,raise:0,walk:0,fly:1,limp:0,e:.75},
              pesado:{q:.42,yaw:0,lift:0,lean:0,raise:1,walk:0,fly:0,limp:0,e:.95},
              solto:{q:.08,yaw:0,lift:0,lean:0,raise:0,walk:0,fly:0,limp:1,e:.05}};
  const PZ={q:0,yaw:0,lift:0,lean:0,raise:0,walk:0,fly:0,limp:0}; let mode='idle',modeAt=0,demoI=0,demoAt=0;
  const DEMO=[['idle',3],['exec',3.6],['voo',3.2],['pesado',3.6],['solto',2.6]];
  const FANS={idle:[[-62,8],[-34,-30],[-4,-44],[27,-34],[52,-6]],exec:[[-78,18],[-60,30],[-42,36],[-24,34],[6,14]],
              voo:[[-12,8],[-6,-62],[4,6],[12,8],[20,10]],pesado:[[-12,8],[-6,-62],[4,6],[12,8],[20,10]]};
  const fanC=FANS.idle.map(a=>a.slice());
  // estado do boneco (px da imagem): raiz, ângulos e molas de mãos/pés
  const B={root:{x:0,y:0},rt:0,rh:0,rc:0,rcV:0, wl:{x:J.WL.x,y:J.WL.y,vx:0,vy:0}, wr:{x:J.WR.x,y:J.WR.y,vx:0,vy:0},
           al:{x:J.AL.x,y:J.AL.y,vx:0,vy:0}, ar:{x:J.AR.x,y:J.AR.y,vx:0,vy:0}, ph:0};
  const M=new Float32Array(NB*4);               // por osso: cos, sin, tx, ty
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

  /* ---------- esqueleto: matrizes por osso ---------- */
  function setM(i,j,w,r){const c=Math.cos(r),s=Math.sin(r),o=i*4;M[o]=c;M[o+1]=s;M[o+2]=w.x-(c*j.x-s*j.y);M[o+3]=w.y-(s*j.x+c*j.y)}
  function ap(i,x,y){const o=i*4;return{x:M[o]*x-M[o+1]*y+M[o+2],y:M[o+1]*x+M[o]*y+M[o+3]}}
  const ang=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
  function mkChain(a,b,c){const l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y);
    let d=ang(b,a)*0, s=ang(a,b)-ang(a,c); s=Math.atan2(Math.sin(s),Math.cos(s));
    return {a,b,c,l1,l2,sg:s>=0?1:-1,r1:ang(a,b),r2:ang(b,c)}}
  const CH={L:mkChain(J.SL,J.EL,J.WL),R:mkChain(J.SR,J.ER,J.WR),LL:mkChain(J.HL,J.KL,J.AL),LR:mkChain(J.HR,J.KR,J.AR)};
  function ik(ch,base,tg,iu,il){                 // 2 ossos: cotovelo/joelho dobra pro mesmo lado da arte
    const dx=tg.x-base.x,dy=tg.y-base.y,th=Math.atan2(dy,dx);
    const d=clamp(Math.hypot(dx,dy),Math.abs(ch.l1-ch.l2)+1,ch.l1+ch.l2-.5);
    const A=Math.acos(clamp((ch.l1*ch.l1+d*d-ch.l2*ch.l2)/(2*ch.l1*d),-1,1)), a1=th+ch.sg*A;
    const e={x:base.x+Math.cos(a1)*ch.l1,y:base.y+Math.sin(a1)*ch.l1}, w={x:base.x+Math.cos(th)*d,y:base.y+Math.sin(th)*d};
    setM(iu,ch.a,base,a1-ch.r1); setM(il,ch.b,e,ang(e,w)-ch.r2);
  }
  function pose(){
    const P2={x:J.P.x+B.root.x,y:J.P.y+B.root.y};
    setM(0,J.P,P2,B.rt);
    setM(1,J.N,ap(0,J.N.x,J.N.y),B.rt+B.rh);
    setM(2,J.C,ap(0,J.C.x,J.C.y),B.rt+B.rc);
    ik(CH.L,ap(0,J.SL.x,J.SL.y),ap(0,B.wl.x,B.wl.y),3,4);
    ik(CH.R,ap(0,J.SR.x,J.SR.y),ap(0,B.wr.x,B.wr.y),5,6);
    ik(CH.LL,ap(0,J.HL.x,J.HL.y),B.al,7,8);       // pés ficam no chão (alvo fora do tronco)
    ik(CH.LR,ap(0,J.HR.x,J.HR.y),B.ar,9,10);
  }
  function skin(x,y,wt){let X=0,Y=0;for(const [i,w] of wt){const o=i*4;X+=w*(M[o]*x-M[o+1]*y+M[o+2]);Y+=w*(M[o+1]*x+M[o]*y+M[o+3])}return{x:X,y:Y}}
  function place(p){                             // imagem -> tela (giro 3D falso, inclinação, escala)
    const an=R.spin+PZ.yaw, cs=Math.cos(an), sn=Math.sin(an), sx=(cs<0?-1:1)*Math.max(Math.abs(cs),.05);
    const ux=p.x-NECK.x, z=ux*sn, pr=1400/(1400+z), px=ux*sx*pr, py=(p.y-NECK.y)*pr, c=Math.cos(R.tilt), s=Math.sin(R.tilt);
    return {x:R.x+(px*c-py*s)*K, y:R.y+(px*s+py*c)*K};
  }
  const warpW=(p,wt)=>place(skin(p.x,p.y,wt));

  /* ---------- WebGL: malha texturizada com skinning ---------- */
  const NX=40, NY=64; let prog,posBuf,pos,nIdx=0,texOK=false,resLoc,shLoc,VW=null,VR=null;
  (function initGL(){
    gl=gc.getContext('webgl',{premultipliedAlpha:true,alpha:true,antialias:true}); if(!gl)return;
    const sh=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);return s};
    prog=gl.createProgram();
    gl.attachShader(prog,sh(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 uv;uniform vec2 res;varying vec2 v;void main(){vec2 c=p/res*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);v=uv;}'));
    gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v;uniform sampler2D t;uniform float sh;void main(){vec4 c=texture2D(t,v);gl_FragColor=vec4(c.rgb*sh+vec3(.03,.16,.01)*c.a*(1.0-sh),c.a);}'));
    gl.linkProgram(prog);gl.useProgram(prog);
    const nv=(NX+1)*(NY+1), uv=new Float32Array(nv*2); VW=[];VR=new Float32Array(nv*2);
    for(let j=0;j<=NY;j++)for(let i=0;i<=NX;i++){const k=j*(NX+1)+i,x=i/NX*IW,y=j/NY*IH;uv[k*2]=i/NX;uv[k*2+1]=j/NY;VR[k*2]=x;VR[k*2+1]=y;VW.push(weights(x,y))}
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
      for(let k=0;k<VW.length;k++){const p=place(skin(VR[k*2],VR[k*2+1],VW[k]));pos[k*2]=p.x;pos[k*2+1]=p.y}
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(resLoc,W,H);gl.uniform1f(shLoc,front());
      gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,pos);gl.drawElements(gl.TRIANGLES,nIdx,gl.UNSIGNED_SHORT,0);
    } else if(img.complete){ // sem WebGL: imagem inteira balançando
      const o=place({x:0,y:B.root.y}),cs=Math.cos(R.spin);cx.save();cx.translate(o.x,o.y);cx.rotate(R.tilt+B.rt);cx.scale((cs<0?-1:1)*Math.max(Math.abs(cs),.05),1);cx.drawImage(img,0,0,IW*K,IH*K);cx.restore();
    }
  }

  /* ---------- mão: cursor/toque ou câmera ---------- */
  const hand={x:0,y:0,tx:0,ty:0}; let ptrAt=-1e9,E=0,camOn=false,camHandAt=-1e9;
  const fing=[0,1,2,3,4].map(()=>({x:0,y:0,vx:0,vy:0,tx:0,ty:0}));
  let ptrDown=false; const gHist=[]; let gPt=null, pointFr=0;
  st.addEventListener('pointerup',()=>{ptrDown=false},{passive:true}); addEventListener('pointerup',()=>{ptrDown=false});
  function setPtr(e){if(camOn&&performance.now()-camHandAt<1200)return;const r=st.getBoundingClientRect();hand.tx=e.clientX-r.left;hand.ty=e.clientY-r.top;ptrAt=performance.now();st.classList.add('on')}
  st.addEventListener('pointermove',setPtr,{passive:true});
  st.addEventListener('pointerdown',e=>{if(e.target.closest('.pup-cam'))return;ptrDown=true;setPtr(e)},{passive:true});
  st.addEventListener('pointerleave',()=>{ptrAt=performance.now()-2000});

  let inited=false;
  function init(){const b=base(),h=restHand();hand.x=hand.tx=h.x;hand.y=hand.ty=h.y;R.x=b.x;R.y=b.y;
    fing.forEach((f,i)=>{f.x=h.x+FANS.idle[i][0]*S;f.y=h.y+FANS.idle[i][1]*S;f.vx=f.vy=0});pose();inited=true}

  const STM={idle:'OCIOSA',exec:'EXECUTANDO TAREFA',voo:'SUBINDO NOVO SISTEMA',pesado:'TRABALHO PESADO',solto:'OCIOSA'};
  const WTM={idle:'aguardando comando',exec:'executando',voo:'gerando',pesado:'processando o lote',solto:'aguardando comando'};
  const LOGM={idle:['i','mão aberta · agente em espera'],exec:['r','mão deitada · executando implementação'],voo:['i','1 dedo · subindo novo sistema'],
              pesado:['r','levantando: lote pesado (1,3 mil notas)'],solto:['d','mão solta · agente volta pra base']};
  const pulses=[];
  function spring(o,tx,ty,dt,k,c){o.vx+=((tx-o.x)*k-o.vx*c)*dt;o.vy+=((ty-o.y)*k-o.vy*c)*dt;o.x+=o.vx*dt;o.y+=o.vy*dt}

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
    const tp=POSE[mode], kp=1-Math.pow(.02,dt);
    for(const key in PZ)PZ[key]=lerp(PZ[key],tp[key],kp);
    if(mode==='voo')PZ.yaw=lerp(PZ.yaw,Math.sin(tt*1.9)*.85,kp);        // gira no ar
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

    // ----- corpo inteiro: fica na base, segue um pouco a mão (no voo, bem mais) -----
    const b=base(), dx=hand.x-h0.x, dy=hand.y-h0.y, kb=1-Math.pow(.02,dt), kf2=1-Math.pow(cam?.004:.02,dt);
    const fol=mode==='voo'?.5:mode==='solto'?0:.16, oX=R.x, oY=R.y;
    R.x=lerp(R.x,b.x+clamp(dx*fol,-W*(mob?.12:.1),W*(mob?.12:.22))-PZ.lift*W*.12,kf2);
    R.y=lerp(R.y,b.y+clamp(dy*fol,-H*(mob?.05:.1),H*(mob?.08:.11))-PZ.lift*H+Math.sin(tt*3)*12*S*PZ.fly,kf2);
    R.tilt=lerp(R.tilt,PZ.lean+(mode==='idle'||mode==='solto'?0:clamp((hand.x-px)/Math.max(dt,.001)*.00012/S,-.15,.15)),kb);
    const mvX=(R.x-oX)/K, mvY=(R.y-oY)/K;           // quanto o corpo andou (px da imagem): mãos/pés/capa atrasam

    // ----- fios: deslocamento de cada dedo em relação à mão aberta (calibrada sozinha) -----
    fing.forEach((f,i)=>{const ox=f.x-hand.x,oy=f.y-hand.y;
      if(!cam){f.rx=fanC[i][0]*S;f.ry=fanC[i][1]*S;return}
      if(f.rx===undefined||f.calib){f.rx=ox;f.ry=oy;f.calib=false;return}
      const open=Math.hypot(ox,oy)>Math.hypot(f.rx,f.ry), a=1-Math.pow(open?.2:.97,dt); f.rx=lerp(f.rx,ox,a); f.ry=lerp(f.ry,oy,a)});
    const g=mode==='solto'?0:(cam?2.2:1.4)*(mode==='idle'?1:.5);
    const rel=i=>({x:clamp((fing[i].x-hand.x-fing[i].rx)/K*g,-110,110),y:clamp((fing[i].y-hand.y-fing[i].ry)/K*g,-110,110)});
    const r0=rel(0),r1=rel(1),r2=rel(2),r3=rel(3),r4=rel(4);

    // ----- esqueleto: raiz, tronco, cabeça, capa -----
    const breath=Math.sin(tt*1.7), Wk=PZ.walk; B.ph+=dt*7.2*Wk;
    const ph=B.ph, step1=Math.sin(ph);
    let q=PZ.q; if(mode==='pesado')q+=.2*Math.sin(tt*4.6)*PZ.raise;   // sobe e desce com o peso
    const kr=1-Math.pow(.0008,dt);
    B.root.x=lerp(B.root.x,step1*6*Wk,kr);
    B.root.y=lerp(B.root.y,q*100+breath*2.5-Math.abs(Math.cos(ph))*9*Wk+PZ.limp*10,kr);
    B.rt=lerp(B.rt,Math.sin(tt*1.1)*.03+step1*.05*Wk-r2.x*.0016+PZ.limp*.06-PZ.fly*.05,kr);
    const look=clamp((hand.x-R.x)/Math.max(W,1)*.5,-.18,.18)*(mode==='solto'?0:1);
    B.rh=lerp(B.rh,clamp(look+Math.sin(tt*.8)*.07+r2.x*.0035-step1*.04*Wk+PZ.limp*.22,-.42,.42),1-Math.pow(.003,dt));
    const capeT=clamp(mvX*.03,-.35,.35)+Math.sin(tt*1.4)*.035+step1*.06*Wk+PZ.fly*.32;
    B.rcV+=((capeT-B.rc)*60-B.rcV*7)*dt; B.rc+=B.rcV*dt;

    // ----- mãos (alvo de IK em px da imagem, no referencial do tronco) -----
    let wl={x:J.WL.x+Math.sin(tt*1.15)*10,y:J.WL.y+Math.cos(tt*1.5)*9},
        wr={x:J.WR.x+Math.sin(tt*1.3+1)*6,y:J.WR.y+Math.sin(tt*1.6)*9};
    const mix=(p,x,y,a)=>{p.x=lerp(p.x,x,a);p.y=lerp(p.y,y,a)};
    mix(wl,168,262,PZ.raise); mix(wr,486,282,PZ.raise);                      // braços pra cima (peso)
    if(mode==='pesado'){wl.y+=Math.sin(tt*4.6)*14;wr.y+=Math.sin(tt*4.6)*14}
    mix(wl,128,262,PZ.fly); mix(wr,540,318,PZ.fly);                          // voo: braços à frente
    mix(wl,222,452,PZ.limp); mix(wr,446,540,PZ.limp);                        // solto: braços caídos
    wl.x+=-step1*26*Wk; wl.y+=Math.abs(step1)*-6*Wk; wr.x+=step1*22*Wk;     // balanço ao andar
    wl.x+=r0.x; wl.y+=r0.y; wr.x+=r4.x; wr.y+=r4.y;                          // fios puxam as mãos
    B.wl.x-=mvX*.5;B.wl.y-=mvY*.5;B.wr.x-=mvX*.5;B.wr.y-=mvY*.5;              // inércia
    const ks=mode==='solto'?55:150, kc=mode==='solto'?6:16;
    spring(B.wl,wl.x,wl.y,dt,ks,kc); spring(B.wr,wr.x,wr.y,dt,ks,kc);

    // ----- pés (no chão; levantam ao andar, ao puxar o fio do joelho e no voo) -----
    let al={x:J.AL.x-q*30,y:J.AL.y}, ar={x:J.AR.x+q*30,y:J.AR.y};
    al.x+=step1*24*Wk; al.y-=Math.max(0,Math.cos(ph))*36*Wk;
    ar.x-=step1*24*Wk; ar.y-=Math.max(0,-Math.cos(ph))*36*Wk;
    mix(al,318,742,PZ.fly); mix(ar,470,730,PZ.fly);
    al.y+=Math.sin(tt*3.2)*10*PZ.fly; ar.y+=Math.sin(tt*3.2+1.4)*10*PZ.fly;
    al.x+=r1.x*.35; al.y+=Math.min(0,r1.y)*.8; ar.x+=r3.x*.35; ar.y+=Math.min(0,r3.y)*.8;
    al.x+=B.root.x; ar.x+=B.root.x;
    B.al.x-=mvX*.25*PZ.fly;B.ar.x-=mvX*.25*PZ.fly;
    spring(B.al,al.x,al.y,dt,220,22); spring(B.ar,ar.x,ar.y,dt,220,22);
    pose();

    R.capeV=mvX;
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
    const att=ATT.map((p,i)=>warpW(p,ATTW[i]));
    cx.globalCompositeOperation='lighter';
    // olhos e logo acendem com o trabalho
    const fr=Math.max(0,Math.cos(R.spin)), pe=(.3+.3*E+.08*Math.sin(tt*5))*fr;
    EYES.forEach((e,i)=>glow(warpW(e,EYEW[i]),36*K,'rgba(255,220,90,'+pe.toFixed(2)+')','rgba(255,200,60,0)'));
    glow(warpW(LOGO,LOGOW),60*K,'rgba(124,255,57,'+((.1+.25*E)*fr).toFixed(2)+')','rgba(124,255,57,0)');
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
