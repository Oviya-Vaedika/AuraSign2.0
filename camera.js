(() => {
  "use strict";
  const app=window.AuraApp,$=app.$;
  const video=$("#cameraVideo"),canvas=$("#cameraCanvas"),ctx=canvas.getContext("2d");
  let stream=null,handModel=null,raf=0,active=false,lastDetect=0,detectBusy=false,mediapipeBase="https://cdn.jsdelivr.net/npm/@mediapipe/hands/";
  let stableLabel="",stableSince=0,lastCommitted="",committedAt=0;
  const recognized=$("#recognizedText"),log=$("#detectionLog"),placeholder=$("#cameraPlaceholder");
  const connections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  function setStatus(message){$("#cameraMessage").textContent=message;}
  function setPill(message){$("#confidencePill").textContent=message;}
  function sizeCanvas(){
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    if(!rect.width||!rect.height)return;
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function clearOverlay(){const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);}
  function drawLandmarks(landmarks){
    const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
    clearOverlay();
    if(!landmarks?.length)return;
    const pts=landmarks.map(p=>({x:p.x*w,y:p.y*h}));
    // Draw the palm and each finger in separate, high-contrast strokes.
    const fingerPaths=[
      [0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],
      [0,13,14,15,16],[0,17,18,19,20],[5,9,13,17]
    ];
    ctx.lineCap="round";ctx.lineJoin="round";
    fingerPaths.forEach((path,i)=>{
      ctx.beginPath();
      path.forEach((id,j)=>j?ctx.lineTo(pts[id].x,pts[id].y):ctx.moveTo(pts[id].x,pts[id].y));
      ctx.strokeStyle=i===0?"#f0abfc":(i===5?"rgba(224,251,255,.72)":"#22d3ee");
      ctx.lineWidth=i===5?3.5:4.5;
      ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=7;ctx.stroke();
    });
    ctx.shadowBlur=0;
    // Small joints + large outlined fingertip markers make movement easier to follow.
    pts.forEach((p,i)=>{
      const tip=[4,8,12,16,20].includes(i);
      const radius=tip?7:3.5;
      ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);
      ctx.fillStyle=tip?"#f0abfc":"#f8fbff";ctx.fill();
      ctx.lineWidth=tip?2.5:1.2;ctx.strokeStyle=tip?"#ffffff":"#07506a";ctx.stroke();
      if(tip){
        ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);
        ctx.lineWidth=1.4;ctx.strokeStyle="rgba(240,171,252,.85)";ctx.stroke();
      }
    });
  }
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function classifyHand(p){
    if(!p||p.length<21)return {label:"Hand found",detail:"Landmarks detected"};
    // Normalise thresholds to hand size so recognition is less sensitive to distance.
    const palmSize=Math.max(dist(p[0],p[9]),0.001);
    const fingerExtended=(tip,pip, mcp)=>(
      p[tip].y < p[pip].y - palmSize*.08 &&
      dist(p[tip],p[mcp]) > dist(p[pip],p[mcp])*.72
    );
    const thumbOut=dist(p[4],p[5])>dist(p[3],p[5])*1.12;
    const extended=[
      thumbOut,
      fingerExtended(8,6,5),
      fingerExtended(12,10,9),
      fingerExtended(16,14,13),
      fingerExtended(20,18,17)
    ];
    const [thumb,index,middle,ring,pinky]=extended;
    const count=extended.slice(1).filter(Boolean).length;
    let label="HAND POSE";
    if(index&&middle&&ring&&pinky) label=thumb?"OPEN HAND":"FOUR FINGERS";
    else if(!index&&!middle&&!ring&&!pinky&&!thumb) label="CLOSED FIST";
    else if(index&&!middle&&!ring&&!pinky) label=thumb?"L-SHAPE":"POINTING";
    else if(index&&middle&&!ring&&!pinky) label="V-SHAPE";
    else if(thumb&&!index&&!middle&&!ring&&!pinky) label=(p[4].y<p[0].y-palmSize*.12)?"THUMBS UP":"THUMB EXTENDED";
    else if(pinky&&!index&&!middle&&!ring) label="PINKY UP";
    else if(!index&&middle&&!ring&&!pinky) label="MIDDLE FINGER EXTENDED";
    return {label,detail:`Thumb ${thumb?"extended":"folded"} · ${count} of 4 fingers extended`};
  }
  function updateRecognition(p){
    const result=classifyHand(p),now=performance.now();
    $("#cameraState").textContent="HAND TRACKING";
    setPill(result.label);
    log.textContent=`${new Date().toLocaleTimeString()} · ${result.detail}`;
    if(result.label!==stableLabel){stableLabel=result.label;stableSince=now;return;}
    // Require a short stable pose to reduce flicker and duplicate readings.
    if(now-stableSince>500 && result.label!==lastCommitted){
      lastCommitted=result.label;committedAt=now;
      if(/^(Your recognized gestures will appear here|Hold a hand pose in view to detect it)$/.test(recognized.textContent.trim()))recognized.replaceChildren();
      const entry=document.createElement("span");entry.className="recognized-entry";entry.textContent=result.label;
      recognized.append(entry,document.createTextNode("  "));
      if(recognized.children.length>18)recognized.removeChild(recognized.firstElementChild);
    }
  }
  async function loadHandsLibrary(){
    if(window.Hands)return true;
    const urls=[
      {script:"https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",base:"https://cdn.jsdelivr.net/npm/@mediapipe/hands/"},
      {script:"https://unpkg.com/@mediapipe/hands/hands.js",base:"https://unpkg.com/@mediapipe/hands/"}
    ];
    for(const item of urls){
      try{
        await new Promise((resolve,reject)=>{
          const script=document.createElement("script");script.src=item.script;script.async=true;
          script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error("Could not load hand model script"));};
          document.head.appendChild(script);
        });
        if(window.Hands){mediapipeBase=item.base;return true;}
      }catch(e){console.warn(e);}
    }
    return false;
  }
  async function start(){
    if(active)return;
    if(!navigator.mediaDevices?.getUserMedia){app.toast("Camera needs HTTPS or localhost.");setStatus("Open this site using HTTPS or http://localhost, then allow camera access.");return;}
    $("#startCamera").disabled=true;setStatus("Requesting camera permission…");
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false});
      video.srcObject=stream;video.style.display="block";await video.play();
      active=true;placeholder.style.display="none";$("#stopCamera").disabled=false;sizeCanvas();
      setStatus("Loading hand-tracking model…");
      const loaded=await loadHandsLibrary();
      if(!loaded)throw new Error("The hand-tracking library could not load. Check internet access or CDN restrictions.");
      handModel=new window.Hands({locateFile:file=>`${mediapipeBase}${file}`});
      handModel.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.5,minTrackingConfidence:.5});
      handModel.onResults(results=>{
        if(!active)return;
        const hands=results.multiHandLandmarks||[];
        if(hands.length){
          drawLandmarks(hands[0]);updateRecognition(hands[0]);
          if(hands.length>1)log.textContent+=` · ${hands.length} hands visible (classifying first hand)`;
        }else{
          clearOverlay();setPill("NO HAND");$("#cameraState").textContent="SEARCHING";
          log.textContent="No hand detected. Move it into the frame with your palm facing the camera.";
          stableLabel="";stableSince=0;lastCommitted="";
        }
      });
      setStatus("Camera ready. Show one hand clearly in the frame; hold a pose briefly.");
      $("#cameraState").textContent="SEARCHING";setPill("LOOKING FOR HAND");
      loop();
    }catch(error){
      console.error("Aura Sign camera:",error);
      if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;active=false;
      video.style.display="none";placeholder.style.display="flex";$("#cameraState").textContent="CAMERA ERROR";
      $("#startCamera").disabled=false;$("#stopCamera").disabled=true;
      if(error.name==="NotAllowedError")setStatus("Camera permission denied. Allow camera access in your browser/site settings, then try again.");
      else if(error.name==="NotFoundError")setStatus("No camera was found. Connect a camera or try another device.");
      else if(error.name==="NotReadableError")setStatus("The camera may be in use by another app. Close it there and try again.");
      else setStatus(`${error.message||"Camera setup failed"} Use HTTPS/localhost and check your internet connection.`);
      app.toast("Camera setup failed — see the message below the preview.");
    }
  }
  async function loop(){
    if(!active)return;
    if(handModel&&video.readyState>=2&&!detectBusy&&performance.now()-lastDetect>33){
      lastDetect=performance.now();detectBusy=true;
      try{await handModel.send({image:video});}catch(e){console.warn("Skipped camera frame",e);}
      finally{detectBusy=false;}
    }
    if(active)raf=requestAnimationFrame(loop);
  }
  function stop(){
    active=false;if(raf)cancelAnimationFrame(raf);raf=0;detectBusy=false;
    if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;video.style.display="none";
    if(handModel){try{handModel.close();}catch(e){}handModel=null;}
    clearOverlay();placeholder.style.display="flex";$("#cameraState").textContent="CAMERA OFF";
    $("#startCamera").disabled=false;$("#stopCamera").disabled=true;setPill("CAMERA OFF");
    setStatus("Camera stopped. Camera access requires HTTPS or localhost.");
  }
  $("#startCamera").addEventListener("click",start);$("#stopCamera").addEventListener("click",stop);
  $("#clearRecognized").addEventListener("click",()=>{recognized.replaceChildren();recognized.textContent="Hold a hand pose in view to detect it";log.textContent="No detections yet.";lastCommitted="";app.toast("Output cleared.");});
  $("#copyRecognized").addEventListener("click",async()=>{
    const text=recognized.textContent.trim();
    try{await navigator.clipboard.writeText(text);app.toast("Text copied.");}
    catch{app.toast("Clipboard access unavailable. Select and copy the text manually.");}
  });
  window.addEventListener("resize",sizeCanvas);sizeCanvas();
  window.AuraCamera={start,stop};
})();