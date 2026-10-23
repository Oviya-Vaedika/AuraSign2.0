(() => {
  "use strict";
  const canvas = document.getElementById("avatarCanvas"), ctx = canvas.getContext("2d");
  const app = window.AuraApp;
  const avatar = {w:0,h:0,dpr:1,time:0,active:false,phase:0,pose:0};
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  function resize(){
    const rect=canvas.getBoundingClientRect(); if(!rect.width||!rect.height)return;
    avatar.dpr=Math.min(window.devicePixelRatio||1,2); avatar.w=rect.width; avatar.h=rect.height;
    canvas.width=Math.round(rect.width*avatar.dpr); canvas.height=Math.round(rect.height*avatar.dpr);
    ctx.setTransform(avatar.dpr,0,0,avatar.dpr,0,0);
  }
  function line(points,color,width=3){
    ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke();
  }
  function joint(p,r=3,color="#d8b4fe"){
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;
  }
  function hand(wrist, angle, scale, curl, spread, wave, side){
    const c=Math.cos(angle),s=Math.sin(angle);
    const point=(x,y)=>({x:wrist.x+(x*c-y*s)*scale,y:wrist.y+(x*s+y*c)*scale});
    const palm=point(0,0), base=point(0,-8);
    const colors=["#c084fc","#a78bfa","#8bdbff","#a78bfa","#c084fc"];
    const fingers=[
      [[-16,-10],[-25,-23-curl*2],[-29,-36-curl*4],[-29+wave,-47-curl*5]],
      [[-10,-14],[-13-spread*2,-29+curl*7],[-14-spread*3,-43+curl*14],[-13-spread*3,-55+curl*16]],
      [[-2,-16],[-2,-33+curl*9],[-2,-48+curl*15],[-1+wave,-58+curl*18]],
      [[6,-14],[9+spread,-29+curl*9],[12+spread*2,-42+curl*16],[14+spread*2,-51+curl*19]],
      [[13,-9],[22+spread*2,-20+curl*8],[28+spread*3,-30+curl*14],[31+spread*3,-38+curl*17]]
    ];
    // Palm mesh
    line([point(-17,-8),point(-15,-22),point(0,-27),point(15,-21),point(17,-7),point(10,4),point(-9,5),point(-17,-8)],"#8d79c8",2);
    line([point(-10,-9),point(0,-13),point(10,-8)],"#7166a8",1.3);
    fingers.forEach((finger,i)=>{
      const pts=finger.map(([x,y])=>point(x,y));
      line([base,pts[0],pts[1],pts[2],pts[3]],colors[i],i===2?3:2.3);
      pts.forEach((p,j)=>joint(p,j===3?2.8:2.3,colors[i]));
    });
    // Thumb has its own base and three visible joints.
    const thumb=[point(-14,-9),point(-25,-5-curl*2),point(-32,3-curl*5),point(-37+wave,9-curl*7)];
    line(thumb,"#d8b4fe",2.8);thumb.forEach((p,i)=>joint(p,i===3?3:2.4,"#d8b4fe"));
    joint(palm,3.5,"#e9d5ff");
  }
  function draw(now){
    const dt=Math.min((now-(avatar.last||now))/1000,.04);avatar.last=now;avatar.time+=dt*(app.state.speed||1);
    const w=avatar.w,h=avatar.h;if(!w||!h){requestAnimationFrame(draw);return}
    ctx.clearRect(0,0,w,h);
    const cx=w*.5, unit=Math.min(w/410,h/360), breathe=Math.sin(avatar.time*1.35)*2.5, sway=Math.sin(avatar.time*.65)*4;
    const head={x:cx+sway*.3,y:h*.25+breathe*.25}, neck={x:cx,y:head.y+34*unit};
    const shoulderL={x:cx-38*unit+sway,y:neck.y+18*unit},shoulderR={x:cx+38*unit+sway,y:neck.y+18*unit};
    const torsoBottom={x:cx+sway*.5,y:h*.74+breathe};
    const signing=avatar.active;
    const lift=signing?(Math.sin(avatar.time*5)*.12+.62):.03;
    const elbowL={x:shoulderL.x-18*unit,y:shoulderL.y+52*unit};
    const wristL={x:elbowL.x-7*unit,y:elbowL.y+42*unit};
    const elbowR={x:shoulderR.x+(signing?-18:18)*unit,y:shoulderR.y+(signing?(-10-lift*36):53)*unit};
    const wristR={x:elbowR.x+(signing?(-18+Math.sin(avatar.time*4)*7):13)*unit,y:elbowR.y+(signing?(-28-Math.sin(avatar.time*3)*7):41)*unit};
    // soft halo
    const halo=ctx.createRadialGradient(cx,h*.52,5,cx,h*.52,Math.min(w,h)*.45);
    halo.addColorStop(0,"rgba(168,85,247,.12)");halo.addColorStop(1,"rgba(168,85,247,0)");
    ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
    // torso and shoulders
    line([{x:cx,y:neck.y},{x:cx,y:torsoBottom.y}], "#9c8ad9",3.5*unit);
    line([shoulderL,{x:cx-24*unit,y:shoulderL.y+15*unit},{x:cx-18*unit,y:torsoBottom.y},{x:cx+18*unit,y:torsoBottom.y},{x:cx+24*unit,y:shoulderR.y+15*unit},shoulderR],"#8978c8",2.5*unit);
    line([shoulderL,elbowL,wristL],"#9b8ae1",3.2*unit);
    line([shoulderR,elbowR,wristR],"#b69aff",3.4*unit);
    [shoulderL,elbowL,wristL,shoulderR,elbowR,wristR,neck,torsoBottom].forEach(p=>joint(p,3*unit,"#c4b5fd"));
    // head
    ctx.beginPath();ctx.ellipse(head.x,head.y,19*unit,24*unit,0,0,Math.PI*2);
    ctx.strokeStyle="#c4b5fd";ctx.lineWidth=2.5*unit;ctx.shadowColor="#a855f7";ctx.shadowBlur=14;ctx.stroke();ctx.shadowBlur=0;
    line([{x:head.x-8*unit,y:head.y+1*unit},{x:head.x,y:head.y+4*unit},{x:head.x+8*unit,y:head.y+1*unit}],"#7465a9",1.3*unit);
    // neck and clavicles
    line([{x:head.x-7*unit,y:head.y+20*unit}, {x:neck.x-7*unit,y:neck.y},{x:cx,y:shoulderL.y},{x:neck.x+7*unit,y:neck.y},{x:head.x+7*unit,y:head.y+20*unit}],"#9c8ad9",2*unit);
    const curl=signing?.25+(.5+.5*Math.sin(avatar.time*8))*.45:.12+Math.sin(avatar.time*1.2)*.025;
    const spread=signing?Math.sin(avatar.time*5)*2:0;
    // Larger foreground hands make finger joints and movement easier to see.
    const poseCurl = signing ? [.08,.22,.52,.12,.68,.3][avatar.pose%6] : .12;
    const poseSpread = signing ? [5,1,-2,7,0,4][avatar.pose%6] + Math.sin(avatar.time*3)*1.5 : 0;
    hand(wristR,signing?-0.38+Math.sin(avatar.time*2.4)*.18:-.15,unit*1.18,poseCurl,poseSpread,signing?Math.sin(avatar.time*7)*1.5:Math.sin(avatar.time)*.3,"R");
    hand(wristL,signing?.12+Math.sin(avatar.time*2)*.08:.15,unit*.92,signing?Math.max(.08,poseCurl*.75):.16,signing?poseSpread*.55:0,signing?Math.sin(avatar.time*6)*1.1:Math.sin(avatar.time*.9)*.3,"L");
    // small baseline
    ctx.beginPath();ctx.ellipse(cx,h*.81,65*unit,5*unit,0,0,Math.PI*2);ctx.strokeStyle="#a855f72b";ctx.lineWidth=1;ctx.stroke();
    requestAnimationFrame(draw);
  }
  avatar.resize=resize;
  avatar.setActive=value=>{avatar.active=Boolean(value);};
  avatar.setPose=pose=>{avatar.pose=pose||0;avatar.active=true;};
  window.AuraAvatar=avatar;
  window.addEventListener("resize",resize);
  if("ResizeObserver"in window)new ResizeObserver(resize).observe(canvas);
  resize();requestAnimationFrame(draw);
})();
