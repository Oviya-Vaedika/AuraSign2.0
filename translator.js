(() => {
  "use strict";
  const app=window.AuraApp,$=app.$;
  let sequence=[],index=0,playing=false,timer=null,delay=800;
  const gloss=$("#glossList"),status=$("#avatarStatus"),caption=$("#stageCaption"),loading=$("#loadingOverlay");
  const known=window.AuraDictionary;
  function tokensFor(text){
    const cleaned=text.trim().replace(/[.,!?;:]+/g," ").replace(/\s+/g," ").toUpperCase();
    if(!cleaned)return [];
    const words=cleaned.split(" ");
    const joined=[];
    for(let i=0;i<words.length;i++){
      if(i+1<words.length&&known[words[i]+" "+words[i+1]]){joined.push(words[i]+" "+words[++i]);}
      else joined.push(words[i]);
    }
    return joined;
  }
  function renderGloss(){
    gloss.replaceChildren();
    if(!sequence.length){gloss.innerHTML='<span class="empty-gloss">Your translated tokens will appear here.</span>';return;}
    sequence.forEach((token,i)=>{const el=document.createElement("span");el.className="gloss-token"+(i===index?" active":"");el.textContent=token;el.dataset.index=i;gloss.append(el);});
  }
  function markToken(i){
    index=i;[...gloss.children].forEach((el,j)=>el.classList.toggle("active",j===i));
    const token=sequence[i]||"";
    caption.textContent=token?`Illustrative motion · ${token}`:"Animation complete";
  }
  function stopTimer(){if(timer){clearTimeout(timer);timer=null;}}
  function finish(){stopTimer();playing=false;app.state.playing=false;status.textContent="READY";window.AuraAvatar?.setActive(false);$("#playButton").textContent="▶ Play";}
  function next(){
    if(!playing)return;
    if(index>=sequence.length-1){finish();return;}
    markToken(index+1);
    window.AuraAvatar?.setPose(index+1);
    timer=setTimeout(next,delay/(app.state.speed||1));
  }
  function start(){
    if(!sequence.length){app.toast("Enter a word or phrase first.");return;}
    stopTimer();playing=true;app.state.playing=true;status.textContent="PLAYING";$("#playButton").textContent="▶ Playing";
    window.AuraAvatar?.setActive(true);markToken(index);timer=setTimeout(next,delay/(app.state.speed||1));
  }
  async function translate(){
    const text=$("#sourceText").value.trim();
    if(!text){app.toast("Type a word or choose a quick phrase first.");$("#sourceText").focus();return;}
    stopTimer();playing=false;loading.classList.remove("hidden");status.textContent="MAPPING";caption.textContent="Mapping joint coordinates…";
    sequence=tokensFor(text);index=0;app.state.phrase=text;app.state.tokens=sequence;renderGloss();$("#translateButton").disabled=true;
    await new Promise(resolve=>setTimeout(resolve,1000));
    loading.classList.add("hidden");$("#translateButton").disabled=false;
    status.textContent="READY";caption.textContent=`${sequence.length} token${sequence.length===1?"":"s"} prepared · illustrative animation`;
    window.AuraAvatar?.setPose(0);start();
  }
  $("#translateButton").addEventListener("click",translate);
  $("#playButton").addEventListener("click",start);
  $("#pauseButton").addEventListener("click",()=>{finish();status.textContent="PAUSED";caption.textContent="Animation paused";app.toast("Animation paused.");});
  $("#restartButton").addEventListener("click",()=>{if(!sequence.length){app.toast("Translate a phrase first.");return;}index=0;markToken(0);start();});
  document.querySelectorAll("[data-speed]").forEach(button=>button.addEventListener("click",()=>{
    document.querySelectorAll("[data-speed]").forEach(b=>b.classList.toggle("selected",b===button));
    app.state.speed=Number(button.dataset.speed);app.toast(`Playback speed set to ${app.state.speed}×.`);
  }));
  // Dictionary page
  const grid=$("#dictionaryGrid"),search=$("#dictionarySearch");
  function drawDictionary(query=""){
    grid.replaceChildren();let count=0;
    Object.entries(known).filter(([key,item])=>(key+" "+item.label+" "+item.description).toLowerCase().includes(query.toLowerCase())).forEach(([key,item])=>{
      count++;const button=document.createElement("button");button.className="dictionary-card";
      button.innerHTML=`<span class="card-symbol">${item.symbol}</span><strong></strong><small></small>`;
      button.querySelector("strong").textContent=item.label;button.querySelector("small").textContent=item.description;
      button.addEventListener("click",()=>{app.showPage("home");document.querySelector('[data-mode="text"]').click();$("#sourceText").value=item.label;$("#sourceText").dispatchEvent(new Event("input"));$("#translateButton").click();});
      grid.append(button);
    });
    $("#dictionaryCount").textContent=`${count} phrase${count===1?"":"s"}`;
    if(!count)grid.innerHTML='<p class="muted">No matching phrases. Try another search.</p>';
  }
  search.addEventListener("input",()=>drawDictionary(search.value));drawDictionary();
})();
