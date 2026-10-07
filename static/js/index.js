(() => {
  'use strict';

  // Nerfies-style mobile navbar behavior.
  document.querySelectorAll('.navbar-burger').forEach((burger) => {
    burger.addEventListener('click', () => {
      burger.classList.toggle('is-active');
      const menu = document.querySelector('.navbar-menu');
      if (menu) menu.classList.toggle('is-active');
    });
  });

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const cross = (a, b) => V(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x);
  const dot = (a, b) => a.x*b.x+a.y*b.y+a.z*b.z;
  const norm = (a) => { const l = Math.hypot(a.x,a.y,a.z) || 1; return V(a.x/l,a.y/l,a.z/l); };
  const hexToRgb = h => ({r:(h>>16)&255,g:(h>>8)&255,b:h&255});
  const shade = (hex, k) => { const c=hexToRgb(hex); return `rgb(${clamp(c.r*k,0,255)|0},${clamp(c.g*k,0,255)|0},${clamp(c.b*k,0,255)|0})`; };

  function rot(p, r) {
    let {x,y,z}=p, c=Math.cos(r.x||0), s=Math.sin(r.x||0);
    let y1=y*c-z*s, z1=y*s+z*c; y=y1; z=z1;
    c=Math.cos(r.y||0); s=Math.sin(r.y||0);
    let x1=x*c+z*s, z2=-x*s+z*c; x=x1; z=z2;
    c=Math.cos(r.z||0); s=Math.sin(r.z||0);
    x1=x*c-y*s; y1=x*s+y*c;
    return V(x1,y1,z);
  }

  function box(w,h,d){
    const x=w/2,y=h/2,z=d/2;
    return {v:[V(-x,-y,-z),V(x,-y,-z),V(x,y,-z),V(-x,y,-z),V(-x,-y,z),V(x,-y,z),V(x,y,z),V(-x,y,z)],
      f:[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[1,5,6,2],[0,3,7,4]]};
  }
  function cylinder(r,h,n=18,r2=r){
    const v=[],f=[];
    for(let i=0;i<n;i++){const a=i/n*TAU;v.push(V(Math.cos(a)*r,-h/2,Math.sin(a)*r));v.push(V(Math.cos(a)*r2,h/2,Math.sin(a)*r2));}
    for(let i=0;i<n;i++){const j=(i+1)%n;f.push([i*2,j*2,j*2+1,i*2+1]);}
    const b=v.length;v.push(V(0,-h/2,0));const t=v.length;v.push(V(0,h/2,0));
    for(let i=0;i<n;i++){const j=(i+1)%n;f.push([b,j*2,i*2]);f.push([t,i*2+1,j*2+1]);}
    return {v,f};
  }
  function ellipsoid(rx,ry,rz,lat=9,lon=16){
    const v=[],f=[];
    for(let iy=0;iy<=lat;iy++){const p=iy/lat*Math.PI;for(let ix=0;ix<lon;ix++){const a=ix/lon*TAU;v.push(V(Math.sin(p)*Math.cos(a)*rx,Math.cos(p)*ry,Math.sin(p)*Math.sin(a)*rz));}}
    for(let iy=0;iy<lat;iy++)for(let ix=0;ix<lon;ix++){const j=(ix+1)%lon,a=iy*lon+ix,b=iy*lon+j,c=(iy+1)*lon+j,d=(iy+1)*lon+ix;f.push([a,b,c,d]);}
    return {v,f};
  }
  function makeObj(geom,color,pos=V(),rotation=V(),part='',opts={}){
    return {geom,color,pos,rotation,part,alpha:opts.alpha??1,outline:opts.outline??false,visible:opts.visible??true,id:opts.id||'',home:{pos:{...pos},rotation:{...rotation}}};
  }
  function transformed(obj,global){return obj.geom.v.map(p=>rot(add(rot(p,obj.rotation),obj.pos),global));}

  class Viewer {
    constructor(el){
      this.el=el; this.canvas=document.createElement('canvas'); el.appendChild(this.canvas);
      this.ctx=this.canvas.getContext('2d'); this.objects=[]; this.state={}; this.mode='mesh';
      this.yaw=-.55; this.pitch=.12; this.dist=12; this.auto=true; this.highlight=''; this.tick=null;
      this.resize(); new ResizeObserver(()=>this.resize()).observe(el); this.bind(); this.last=performance.now();
      requestAnimationFrame(t=>this.loop(t));
    }
    resize(){
      const r=this.el.getBoundingClientRect(), d=Math.min(window.devicePixelRatio||1,2);
      this.canvas.width=Math.max(1,Math.round(r.width*d)); this.canvas.height=Math.max(1,Math.round(r.height*d));
      this.canvas.style.width=r.width+'px'; this.canvas.style.height=r.height+'px'; this.dpr=d;
    }
    bind(){
      let drag=false,lx=0,ly=0;
      this.canvas.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;ly=e.clientY;this.canvas.setPointerCapture(e.pointerId);});
      this.canvas.addEventListener('pointermove',e=>{if(!drag)return;this.yaw+=(e.clientX-lx)*.008;this.pitch=clamp(this.pitch+(e.clientY-ly)*.006,-1.1,1.1);lx=e.clientX;ly=e.clientY;this.auto=false;});
      this.canvas.addEventListener('pointerup',()=>drag=false); this.canvas.addEventListener('pointercancel',()=>drag=false);
      this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.dist=clamp(this.dist+e.deltaY*.008,6.5,24);},{passive:false});
    }
    project(p){const z=p.z+this.dist;if(z<.45)return null;const f=this.canvas.height*.78;return {x:this.canvas.width/2+p.x*f/z,y:this.canvas.height/2-p.y*f/z,z};}
    load(mode){
      this.mode=mode; this.objects=[]; this.state={}; this.highlight=''; this.auto=true;
      if(mode==='mesh'){buildMesh(this);this.reset(-.52,.10,9.6);} else {buildRobot(this);this.reset(-.58,.05,10.7);}
    }
    reset(yaw,pitch,dist){this.yaw=yaw;this.pitch=pitch;this.dist=dist;this.auto=true;}
    flash(part){this.highlight=part;clearTimeout(this._flashTimer);this._flashTimer=setTimeout(()=>{this.highlight='';},1800);}
    render(){
      const c=this.ctx,w=this.canvas.width,h=this.canvas.height; c.clearRect(0,0,w,h);
      const grd=c.createRadialGradient(w*.47,h*.2,0,w*.5,h*.45,w*.82);
      grd.addColorStop(0,this.mode==='robot'?'#146074':'#10566a'); grd.addColorStop(.48,'#082d3b'); grd.addColorStop(1,'#04141b'); c.fillStyle=grd;c.fillRect(0,0,w,h);

      // Soft surface/floor cues, intentionally generic rather than pretending to be exact site bathymetry.
      c.save(); c.globalAlpha=.13; c.strokeStyle='#8adce6'; c.lineWidth=this.dpr;
      for(let i=0;i<9;i++){const yy=h*.75+i*h*.035;c.beginPath();c.moveTo(0,yy);c.lineTo(w,yy);c.stroke();}
      for(let i=-10;i<=10;i++){c.beginPath();c.moveTo(w/2+i*22*this.dpr,h*.75);c.lineTo(w/2+i*95*this.dpr,h);c.stroke();}
      c.restore();

      const global=V(this.pitch,this.yaw,0), polys=[], light=norm(V(-.35,.8,-.9));
      for(const o of this.objects){
        if(!o.visible)continue; const vv=transformed(o,global);
        for(const face of o.geom.f){
          const wp=face.map(i=>vv[i]), p2=wp.map(p=>this.project(p)); if(p2.some(p=>!p))continue;
          const n=norm(cross(sub(wp[1],wp[0]),sub(wp[2],wp[0]))); const lum=.40+.60*Math.max(0,dot(n,light));
          const depth=p2.reduce((s,p)=>s+p.z,0)/p2.length; polys.push({p:p2,depth,color:o.color,lum,alpha:o.alpha,part:o.part,outline:o.outline});
        }
      }
      polys.sort((a,b)=>b.depth-a.depth);
      for(const q of polys){
        c.beginPath();c.moveTo(q.p[0].x,q.p[0].y);for(let i=1;i<q.p.length;i++)c.lineTo(q.p[i].x,q.p[i].y);c.closePath();
        const hi=this.highlight && q.part===this.highlight; c.fillStyle=hi?'rgba(71,226,238,.96)':shade(q.color,q.lum);c.globalAlpha=q.alpha;c.fill();c.globalAlpha=1;
        if(hi||q.outline){c.strokeStyle=hi?'#d5ffff':'rgba(219,244,247,.18)';c.lineWidth=(hi?1.8:.8)*this.dpr;c.stroke();}
      }

      c.save();c.globalAlpha=.20;for(let i=0;i<30;i++){const x=(Math.sin(i*19.17+this.yaw)*.5+.5)*w,y=(Math.sin(i*7.73+1.2)*.5+.5)*h*.72;c.fillStyle='#d8fbff';c.fillRect(x,y,1.1*this.dpr,1.1*this.dpr);}c.restore();
    }
    loop(t){const dt=Math.min((t-this.last)/1000,.05);this.last=t;if(this.auto)this.yaw+=dt*.08;if(this.tick)this.tick(dt);this.render();requestAnimationFrame(tt=>this.loop(tt));}
  }

  function addMeshModule(view,x,moduleId,visible=true){
    const items=[]; const push=o=>{o.visible=visible;o.moduleId=moduleId;view.objects.push(o);items.push(o);return o;};
    const beltW=4.2,beltH=4.65;
    // Front/back belt faces create the visual read of a loop around vertical drums.
    push(makeObj(box(beltW,beltH,.11),0x151b1e,V(x,0,-.23),V(),'belt',{id:'beltFront',outline:true}));
    push(makeObj(box(beltW,beltH,.08),0x11171a,V(x,0,.35),V(),'belt',{id:'beltBack'}));
    push(makeObj(box(beltW+.45,.18,.72),0x26323a,V(x,2.42,.03),V(),'frame',{id:'topRail'}));
    push(makeObj(box(beltW+.45,.22,.78),0x1d2b32,V(x,-2.45,.03),V(),'frame',{id:'bottomRail'}));

    // Drums match the slide CAD: two tall vertical rotating pillars.
    const dl=push(makeObj(cylinder(.48,5.15,24),0x8b5144,V(x-2.30,0,.02),V(),'drums',{id:'leftDrum',outline:true}));
    const dr=push(makeObj(cylinder(.48,5.15,24),0x8b5144,V(x+2.30,0,.02),V(),'drums',{id:'rightDrum',outline:true}));
    [dl,dr].forEach(d=>d.spinPhase=Math.random()*TAU);
    push(makeObj(ellipsoid(.50,.18,.50,5,16),0xb7c2c6,V(x-2.30,2.67,.02),V(),'frame'));
    push(makeObj(ellipsoid(.50,.18,.50,5,16),0xb7c2c6,V(x+2.30,2.67,.02),V(),'frame'));
    push(makeObj(cylinder(.10,.28,12),0xe0b93f,V(x-2.30,2.91,.02),V(),'frame'));
    push(makeObj(cylinder(.10,.28,12),0xe0b93f,V(x+2.30,2.91,.02),V(),'frame'));

    // Visible front perforations. Their horizontal drift communicates belt motion.
    for(let iy=-7;iy<=7;iy++)for(let ix=-7;ix<=7;ix++){
      const hx=x+ix*.27+(iy%2)*.13, hy=iy*.29;
      const hole=push(makeObj(cylinder(.045,.045,8),0x020607,V(hx,hy,-.31),V(Math.PI/2,0,0),'belt',{id:'hole'}));
      hole.baseX=hx; hole.localX=hx-x;
    }

    // Scraper is fixed beside the drive drum and contacts the moving belt.
    const scraper=push(makeObj(box(.16,4.0,.70),0x929b9e,V(x+2.78,-.03,-.10),V(0,0,-.025),'scraper',{id:'scraper',outline:true}));
    scraper.exposed=V(x+3.30,-.03,-.55);
    push(makeObj(box(.34,.42,.92),0x5e666a,V(x+2.80,-2.13,-.08),V(),'scraper'));

    // Small visual markers on drum caps make rotation legible.
    for(const dx of [-2.30,2.30]){
      const m=push(makeObj(ellipsoid(.085,.085,.085,5,8),0x63e6d3,V(x+dx+.31,2.75,.02),V(),'drums',{id:'drumMarker'}));
      m.center=V(x+dx,2.75,.02);m.phase=dx<0?0:Math.PI;
    }
    return items;
  }

  function buildMesh(view){
    view.state.modules=[]; view.state.modules.push(addMeshModule(view,0,0,true)); view.state.modules.push(addMeshModule(view,-5.45,1,false)); view.state.modules.push(addMeshModule(view,5.45,2,false));
    view.state.array=false; view.state.motion=true; view.state.exploded=false; view.state.beltTime=0;
    view.tick=(dt)=>{
      if(view.state.motion)view.state.beltTime+=dt*.55;
      const shift=(view.state.beltTime%1)*.27;
      for(const o of view.objects){
        if(o.id==='hole'){
          let lx=o.localX+shift; const half=2.0; while(lx>half)lx-=4.0; while(lx<-half)lx+=4.0; const moduleOffset=o.home.pos.x-o.localX; o.pos.x=moduleOffset+lx;
        }
        if(o.id==='drumMarker'){
          const a=view.state.beltTime*TAU+o.phase;o.pos.x=o.center.x+Math.cos(a)*.31;o.pos.z=o.center.z+Math.sin(a)*.31;
        }
      }
    };
  }

  function putRobot(view,g,c,p,r,part,id,opts={}){const o=makeObj(g,c,p,r,part,{id,...opts});view.objects.push(o);return o;}
  function buildRobot(view){
    // Concrete channel wall + representative surface colonies give the AUV a real task context.
    view.state.wall=[];
    const wall=putRobot(view,box(.32,5.8,7.0),0x596568,V(4.25,.05,.15),V(),'wall','wall',{alpha:.88,outline:true});view.state.wall.push(wall);
    putRobot(view,box(8.3,.28,7.0),0x3f4949,V(.2,-2.72,.2),V(),'wall','floor',{alpha:.85});
    const polypRoots=[[-2.0,-1.6],[-1.2,-.8],[-.5,-1.7],[.35,-.9],[1.1,-1.8],[1.55,-.25],[-1.7,.35],[-.7,.65],[.45,.45],[1.45,.8]];
    polypRoots.forEach(([y,z],k)=>{
      const count=3+(k%3);for(let j=0;j<count;j++){
        const yy=y+(j-count/2)*.10, zz=z+Math.sin(j*2.2+k)*.12;
        const stem=putRobot(view,cylinder(.035,.34,8,.02),0xbca46d,V(4.02,yy,zz),V(0,0,Math.PI/2),'wall','polyp',{alpha:.92});view.state.wall.push(stem);
        const tip=putRobot(view,ellipsoid(.09,.065,.09,5,8),0xd3c08c,V(3.83,yy,zz),V(),'wall','polypTip',{alpha:.96});view.state.wall.push(tip);
      }
    });

    // Compact pressure body shaped to match the white/blue concept art rather than a generic box robot.
    putRobot(view,ellipsoid(2.20,1.00,1.42,11,22),0xdbe5e8,V(0,.25,0),V(),'body','shell',{outline:true});
    putRobot(view,ellipsoid(2.17,.64,1.40,9,20),0x164a69,V(0,-.43,.02),V(),'body','lowerShell');
    putRobot(view,box(2.45,.12,1.95),0xb9cbd1,V(0,.87,.02),V(),'body','topDeck');

    // Forward black vision pod and LED array at the nose (front = negative z in the default view).
    putRobot(view,ellipsoid(1.03,.56,.14,8,18),0x071015,V(0,.12,-1.41),V(),'camera','facePanel',{outline:true});
    putRobot(view,cylinder(.30,.18,22),0x0a2530,V(0,.16,-1.56),V(Math.PI/2,0,0),'camera','mainLens');
    putRobot(view,cylinder(.18,.20,18),0x1d6175,V(0,.16,-1.61),V(Math.PI/2,0,0),'camera','lensGlass');
    view.state.led=[];
    const leds=[[-.73,.38],[-.48,.56],[0,.61],[.48,.56],[.73,.38],[-.73,-.12],[-.48,-.32],[0,-.38],[.48,-.32],[.73,-.12]];
    leds.forEach(([x,y],i)=>{const l=putRobot(view,ellipsoid(.07,.07,.035,4,8),0xeafcff,V(x,y,-1.57),V(),'camera','led'+i);view.state.led.push(l);});

    // Sonar/navigation mast on top.
    putRobot(view,cylinder(.30,.64,18),0x193441,V(-.55,1.28,.02),V(),'sonar','sonarBody',{outline:true});
    putRobot(view,cylinder(.25,.12,18),0x0b1e27,V(-.55,1.66,.02),V(),'sonar','sonarHead');
    putRobot(view,box(.65,.18,.45),0x233844,V(.48,1.10,.25),V(),'sonar','navModule');

    // Four ducted thrusters, axis aligned with the robot's travel direction.
    const thr=[[-1.95,.50,.02],[1.95,.50,.02],[-1.85,-.62,.18],[1.85,-.62,.18]];
    thr.forEach((p,i)=>{
      putRobot(view,cylinder(.52,.72,24),0xb8c8cd,V(...p),V(Math.PI/2,0,0),'thrusters','thrOuter'+i,{outline:true});
      putRobot(view,cylinder(.36,.77,20),0x0a151a,V(...p),V(Math.PI/2,0,0),'thrusters','thrInner'+i);
      putRobot(view,cylinder(.08,.80,12),0x536b75,V(...p),V(Math.PI/2,0,0),'thrusters','thrHub'+i);
    });

    // Articulated removal arm, attached front-right and aimed toward the wall.
    view.state.arm=[];
    const shoulder=putRobot(view,ellipsoid(.28,.28,.28,6,10),0x254653,V(.75,-.55,-1.02),V(),'arm','shoulder');
    const upper=putRobot(view,box(1.15,.28,.30),0xc5d2d6,V(1.20,-.69,-1.18),V(0,.18,-.16),'arm','upper',{outline:true});
    const elbow=putRobot(view,ellipsoid(.24,.24,.24,6,10),0x254653,V(1.73,-.82,-1.30),V(),'arm','elbow');
    const fore=putRobot(view,box(1.12,.25,.27),0xc5d2d6,V(2.18,-.82,-1.33),V(0,-.03,.05),'arm','fore',{outline:true});
    const wrist=putRobot(view,ellipsoid(.20,.20,.20,6,10),0x254653,V(2.74,-.79,-1.35),V(),'arm','wrist');
    const tool=putRobot(view,cylinder(.10,.58,14,.065),0xd8e0e2,V(3.02,-.78,-1.35),V(0,0,Math.PI/2),'arm','tool',{outline:true});
    view.state.arm=[shoulder,upper,elbow,fore,wrist,tool]; view.state.armMoved=false;

    // Suction/collection train: nozzle close to tool, flexible-looking segmented hose, collection pod on body.
    const nozzle=putRobot(view,cylinder(.18,.42,16,.27),0x8ea8b2,V(3.12,-.47,-1.15),V(0,0,Math.PI/2),'suction','nozzle',{outline:true});
    const pod=putRobot(view,cylinder(.39,.92,18),0x6e8d98,V(.62,-1.03,.20),V(0,0,Math.PI/2),'suction','collectionPod',{outline:true});
    const hosePts=[[2.86,-.35,-1.04],[2.45,-.16,-.83],[1.98,-.15,-.56],[1.48,-.34,-.32],[1.02,-.68,-.06]];
    hosePts.forEach((p,i)=>putRobot(view,cylinder(.075,.48,10),0x243b43,V(...p),V(0,0,Math.PI/2),'suction','hose'+i));
    view.state.suction=[nozzle,pod]; view.state.hose=view.objects.filter(o=>/^hose\d+$/.test(o.id));
    view.state.lights=true; view.state.wallVisible=true;
    view.tick=()=>{};
  }

  const viewerEl=document.getElementById('prototypeViewer');
  if(!viewerEl)return;
  const viewer=new Viewer(viewerEl); viewer.load('mesh');

  const status=document.getElementById('viewerStatus');
  const caption=document.getElementById('prototypeCaption');
  const tabs=[...document.querySelectorAll('.prototype-tab')];
  function setMode(mode){
    viewer.load(mode);
    tabs.forEach(t=>{const on=t.dataset.view===mode;t.classList.toggle('is-active',on);t.setAttribute('aria-selected',String(on));});
    document.querySelectorAll('[data-controls]').forEach(el=>el.classList.toggle('is-hidden',el.dataset.controls!==mode));
    document.querySelectorAll('[data-detail-panel]').forEach(el=>el.classList.toggle('is-hidden',el.dataset.detailPanel!==mode));
    document.querySelectorAll('.detail-chip').forEach(el=>el.classList.remove('is-active'));
    if(mode==='mesh'){
      status.textContent='Traveling-belt module · interactive';
      caption.textContent='One self-cleaning module in close-up. The full barrier is formed by repeating this module side-by-side across the inlet mouth.';
    } else {
      status.textContent='Wall-cleaning AUV · interactive';
      caption.textContent='The AUV works separately inside the intake channel, holding position beside hard surfaces while it detects, removes and collects polyp material.';
    }
  }
  tabs.forEach(t=>t.addEventListener('click',()=>setMode(t.dataset.view)));

  document.querySelectorAll('.detail-chip').forEach(btn=>btn.addEventListener('click',()=>{
    const panel=btn.closest('[data-detail-panel]'); if(!panel||panel.dataset.detailPanel!==viewer.mode)return;
    panel.querySelectorAll('.detail-chip').forEach(x=>x.classList.toggle('is-active',x===btn)); viewer.flash(btn.dataset.part);
    setTimeout(()=>btn.classList.remove('is-active'),1800);
  }));

  function resetModelState(){
    if(viewer.mode==='mesh'){
      viewer.load('mesh');
      const a=document.querySelector('[data-action="mesh-array"]'),m=document.querySelector('[data-action="mesh-motion"]'),e=document.querySelector('[data-action="mesh-explode"]');
      if(a)a.textContent='Show 3-module array';if(m)m.textContent='Pause belt';if(e)e.textContent='Expose scraper';
    }else{
      viewer.load('robot');
      const a=document.querySelector('[data-action="robot-arm"]'),l=document.querySelector('[data-action="robot-lights"]'),w=document.querySelector('[data-action="robot-wall"]');
      if(a)a.textContent='Deploy arm';if(l)l.textContent='Lights off';if(w)w.textContent='Hide wall';
    }
  }

  document.addEventListener('click',(e)=>{
    const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
    if(a==='reset-view'){resetModelState();return;}
    if(a==='mesh-array'&&viewer.mode==='mesh'){
      viewer.state.array=!viewer.state.array;viewer.state.modules.slice(1).forEach(mod=>mod.forEach(o=>o.visible=viewer.state.array));viewer.dist=viewer.state.array?16.5:9.6;b.textContent=viewer.state.array?'Show 1 module':'Show 3-module array';
    }
    if(a==='mesh-motion'&&viewer.mode==='mesh'){
      viewer.state.motion=!viewer.state.motion;b.textContent=viewer.state.motion?'Pause belt':'Run belt';
    }
    if(a==='mesh-explode'&&viewer.mode==='mesh'){
      viewer.state.exploded=!viewer.state.exploded;viewer.objects.filter(o=>o.id==='scraper').forEach(o=>{o.pos=viewer.state.exploded?{...o.exposed}:{...o.home.pos};});b.textContent=viewer.state.exploded?'Return scraper':'Expose scraper';
    }
    if(a==='robot-lights'&&viewer.mode==='robot'){
      viewer.state.lights=!viewer.state.lights;viewer.state.led.forEach(o=>o.color=viewer.state.lights?0xeafcff:0x35474d);b.textContent=viewer.state.lights?'Lights off':'Lights on';
    }
    if(a==='robot-wall'&&viewer.mode==='robot'){
      viewer.state.wallVisible=!viewer.state.wallVisible;viewer.state.wall.forEach(o=>o.visible=viewer.state.wallVisible);b.textContent=viewer.state.wallVisible?'Hide wall':'Show wall';
    }
    if(a==='robot-arm'&&viewer.mode==='robot'){
      viewer.state.armMoved=!viewer.state.armMoved;
      const [s,u,el,f,w,t]=viewer.state.arm;
      if(viewer.state.armMoved){
        s.pos=V(.78,-.50,-1.04);u.pos=V(1.42,-.55,-1.16);u.rotation.z=-.02;
        el.pos=V(2.02,-.58,-1.23);f.pos=V(2.66,-.53,-1.26);f.rotation.z=.02;
        w.pos=V(3.28,-.48,-1.28);t.pos=V(3.62,-.44,-1.28);
        const hp=[[3.28,-.18,-1.07],[2.82,-.02,-.83],[2.27,-.02,-.57],[1.72,-.25,-.31],[1.16,-.62,-.08]];
        viewer.state.hose.forEach((o,i)=>{if(hp[i])o.pos=V(...hp[i]);});
      }else {viewer.state.arm.forEach(o=>{o.pos={...o.home.pos};o.rotation={...o.home.rotation};});viewer.state.hose.forEach(o=>{o.pos={...o.home.pos};o.rotation={...o.home.rotation};});}
      b.textContent=viewer.state.armMoved?'Stow arm':'Deploy arm';
    }
  });

  // Hide the video placeholder automatically once a real demo.mp4 is present and playable.
  const demo=document.getElementById('demoVideo'), missing=document.getElementById('videoMissing');
  if(demo&&missing){demo.addEventListener('canplay',()=>missing.style.display='none');demo.addEventListener('error',()=>missing.style.display='flex');const source=demo.querySelector('source');if(source)source.addEventListener('error',()=>missing.style.display='flex');}
})();
