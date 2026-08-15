
const data = window.POLLING_DATA || [];
const $ = id => document.getElementById(id);

function norm(v){
  return String(v||"").toLowerCase().normalize("NFKD")
    .replace(/[״"'׳`]/g,"").replace(/[\-–—_,.()\/\\]/g," ")
    .replace(/\s+/g," ").trim()
    .replace(/קריית/g,"קרית").replace(/תקוה/g,"תקווה")
    .replace(/תל אביב יפו/g,"תל אביב");
}
function toks(v){return norm(v).split(" ").filter(Boolean)}
function lev(a,b){
  a=norm(a);b=norm(b);const n=b.length;if(!a.length)return n;if(!n)return a.length;
  let p=Array.from({length:n+1},(_,i)=>i),c=new Array(n+1);
  for(let i=1;i<=a.length;i++){c[0]=i;for(let j=1;j<=n;j++){const k=a[i-1]===b[j-1]?0:1;c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+k)}[p,c]=[c,p]}
  return p[n];
}
function fscore(q,c){
  if(!q||!c)return 0;if(q===c)return 100;if(c.startsWith(q)||q.startsWith(c))return 86;if(c.includes(q)||q.includes(c))return 72;
  const d=lev(q,c),m=Math.max(q.length,c.length),sim=1-d/m;return m>=4&&sim>=.74?Math.round(sim*64):0;
}
function semanticScore(item,q){
  q=norm(q);if(!q)return 0;
  const city=norm(item.city),site=norm(item.site),address=norm(item.address),aliases=norm((item.aliases||[]).join(" "));
  const hay=`${city} ${site} ${address} ${aliases}`;let s=0;
  if(city===q)s+=520;if((item.aliases||[]).some(a=>norm(a)===q))s+=480;if(city.startsWith(q))s+=320;if(site.startsWith(q))s+=270;if(hay.includes(q))s+=220;
  const qs=toks(q), candidates=[...toks(city),...toks(site),...toks(address),...toks(aliases)];
  qs.forEach(qt=>{let best=0;candidates.forEach(ct=>best=Math.max(best,fscore(qt,ct)));s+=best});
  if(qs.length>1){const hits=qs.filter(qt=>candidates.some(ct=>fscore(qt,ct)>=72)).length;s+=hits===qs.length?160:hits*28}
  qs.forEach(qt=>toks(city).forEach(ct=>{const z=fscore(qt,ct);if(z>=72)s+=Math.round(z*1.25)}));
  return s;
}
function searchSemantic(q){
  return data.map(x=>({...x,_score:semanticScore(x,q)})).filter(x=>x._score>=70).sort((a,b)=>b._score-a._score);
}
function esc(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function distanceKm(a,b,c,d){const R=6371,r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b);const z=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;return R*2*Math.atan2(Math.sqrt(z),Math.sqrt(1-z))}
function navs(x){
  // GPS coords for deterministic navigation; address is still shown to the user.
  const ll=`${x.lat},${x.lng}`;
  return {w:`https://waze.com/ul?ll=${encodeURIComponent(ll)}&navigate=yes`,g:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}`}
}

const searchInput=$("searchInput"),clearBtn=$("clearBtn"),resultsList=$("resultsList"),resultsTitle=$("resultsTitle"),resultsSub=$("resultsSub"),
      msg=$("msg"),fallback=$("fallback"),citySelect=$("citySelect"),gpsBtn=$("gpsBtn"),gpsText=$("gpsText");

let map=null,markers=[],userMarker=null;
function initMap(){
  if(!window.L){$("map").innerHTML='<div class="map-fallback">המפה לא נטענה — החיפוש והניווט עדיין זמינים.</div>';return}
  map=L.map("map",{zoomControl:true,scrollWheelZoom:false}).setView([31.78,34.95],7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(map);
  const icon=L.divIcon({className:"",html:'<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#12d8e4;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 0 0 6px #12d8e433,0 0 22px #12d8e4"></div>',iconSize:[24,24],iconAnchor:[12,20]});
  data.forEach(x=>{const m=L.marker([x.lat,x.lng],{icon}).addTo(map).bindPopup(`<div dir="rtl"><b>${esc(x.city)}</b><br>${esc(x.site)}<br><small>${esc(x.address)}</small></div>`);markers.push({item:x,marker:m})});
}
function focusMap(items){
  if(!map||!items.length)return;
  if(items.length===1){map.flyTo([items[0].lat,items[0].lng],13,{duration:.7});const found=markers.find(m=>m.item.city===items[0].city);if(found)found.marker.openPopup()}
  else{const bounds=L.latLngBounds(items.map(x=>[x.lat,x.lng]));map.fitBounds(bounds.pad(.2))}
}
function cardHtml(x){
  const n=navs(x),d=Number.isFinite(x.distance)?`<div class="distance">${x.distance.toFixed(1)} ק״מ<span>ממך</span></div>`:"";
  return `<article class="result-card"><div><h4>${esc(x.city)}</h4><div class="site">${esc(x.site)}</div><div class="addr">${esc(x.address)}</div><div class="navs"><a class="waze" href="${n.w}" target="_blank" rel="noopener">Waze</a><a href="${n.g}" target="_blank" rel="noopener">Google Maps</a></div></div>${d}</article>`;
}
function render(items,title="תוצאות חיפוש",sub="בחרו אתר ופתחו ניווט"){
  resultsTitle.textContent=title;resultsSub.textContent=sub;resultsList.innerHTML="";
  if(!items.length){resultsList.innerHTML='<div class="empty-results"><strong>לא מצאנו התאמה ברורה</strong>נסו שם יישוב, אתר, רחוב או חלק מהכתובת — גם עם שגיאת כתיב קלה.</div>';return}
  items.forEach(x=>resultsList.insertAdjacentHTML("beforeend",cardHtml(x)));
  focusMap(items);
}
function showMessage(text,type="info"){msg.textContent=text;msg.className=`message show ${type}`}
function clearMessage(){msg.className="message";msg.textContent=""}

const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
function isInAppBrowser(){
  const ua=navigator.userAgent||"";
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Twitter|LinkedInApp|Telegram|Messenger/i.test(ua);
}
function resetGpsBtn(){
  gpsBtn.disabled=false;
  gpsText.textContent="מצא קלפיות קרובות אליי";
}
function gpsErrorMessage(err){
  if(!window.isSecureContext){
    return "GPS זמין רק בחיבור מאובטח (HTTPS). פתחו את הקישור ב-Safari או Chrome.";
  }
  if(isInAppBrowser()){
    return "הדפדפן שבו פתחתם את הקישור (למשל וואטסאפ) חוסם GPS. לחצו על ⋯ ובחרו «פתיחה בדפדפן».";
  }
  if(!err) return "לא הצלחנו לאתר מיקום. אפשר לבחור יישוב ידנית.";
  if(err.code===1){
    return "הגישה למיקום נחסמה. בהגדרות הדפדפן/הטלפון אפשרו מיקום לאתר זה, או בחרו יישוב ידנית.";
  }
  if(err.code===2) return "שירותי המיקום כבויים או לא זמינים כרגע. אפשר לבחור יישוב ידנית.";
  if(err.code===3) return "איתור המיקום לקח יותר מדי זמן. נסו שוב או בחרו יישוב ידנית.";
  return "לא הצלחנו לאתר מיקום. אפשר לבחור יישוב ידנית.";
}
function onGpsSuccess(p){
  const nearest=data.map(x=>({...x,distance:distanceKm(p.coords.latitude,p.coords.longitude,x.lat,x.lng)})).sort((a,b)=>a.distance-b.distance).slice(0,4);
  render(nearest,"הקלפיות הקרובות אליכם","מסודרות לפי מרחק אווירי משוער");
  if(map&&window.L){
    if(userMarker) map.removeLayer(userMarker);
    userMarker=L.circleMarker([p.coords.latitude,p.coords.longitude],{radius:8,color:"#fff",weight:3,fillColor:"#0c65ff",fillOpacity:1}).addTo(map).bindPopup("המיקום שלך");
  }
  showMessage("המיקום נמצא בהצלחה.","info");
  resetGpsBtn();
}
function onGpsError(err){
  showMessage(gpsErrorMessage(err),"error");
  fallback.classList.add("show");
  resetGpsBtn();
}
function requestNearestPolling(){
  clearMessage();
  if(!navigator.geolocation){
    showMessage("הדפדפן אינו תומך במיקום. בחרו יישוב ידנית.","error");
    fallback.classList.add("show");
    return;
  }
  if(!window.isSecureContext){
    onGpsError(null);
    fallback.classList.add("show");
    return;
  }
  if(isInAppBrowser()){
    onGpsError(null);
    fallback.classList.add("show");
    return;
  }
  gpsBtn.disabled=true;
  gpsText.textContent="מאתרים מיקום...";
  navigator.geolocation.getCurrentPosition(onGpsSuccess,onGpsError,{
    timeout:isMobile?20000:10000,
    maximumAge:0,
    enableHighAccuracy:true
  });
}

let timer;
searchInput.addEventListener("input",()=>{
  clearTimeout(timer);clearBtn.classList.toggle("show",searchInput.value.length>0);clearMessage();
  timer=setTimeout(()=>{const q=searchInput.value.trim();if(!q){render([],"תוצאות קרובות","התחילו בחיפוש או השתמשו במיקום");return}
    render(searchSemantic(q).slice(0,8),`תוצאות עבור “${q}”`,"ממוינות לפי ההתאמה הטובה ביותר");},120)
});
clearBtn.addEventListener("click",()=>{searchInput.value="";clearBtn.classList.remove("show");searchInput.focus();render([],"תוצאות קרובות","התחילו בחיפוש או השתמשו במיקום")});
document.querySelectorAll("[data-search]").forEach(b=>b.addEventListener("click",()=>{searchInput.value=b.dataset.search;clearBtn.classList.add("show");searchInput.dispatchEvent(new Event("input"))}));

gpsBtn.addEventListener("click",(e)=>{
  e.preventDefault();
  requestNearestPolling();
});

[...new Set(data.map(x=>x.city))].sort((a,b)=>a.localeCompare(b,"he")).forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;citySelect.appendChild(o)});
$("useCity").addEventListener("click",()=>{const city=citySelect.value,items=data.filter(x=>x.city===city);render(items,`אתר ההצבעה ב${city}`,"לפי רשימת אתרי ההצבעה")});

const all=$("allList");data.forEach((x,i)=>{const row=document.createElement("div");row.className="all-row";row.innerHTML=`<div class="num">${i+1}</div><div><b>${esc(x.city)} · ${esc(x.site)}</b><small>${esc(x.address)}</small></div>`;row.addEventListener("click",()=>{render([x],`אתר ההצבעה ב${x.city}`,"נבחר מתוך הרשימה");window.scrollTo({top:$("dashboard").offsetTop-70,behavior:"smooth"})});all.appendChild(row)});

let fs=1;$("plus").onclick=()=>{fs=Math.min(1.35,fs+.1);document.documentElement.style.setProperty("--fs",fs)};$("minus").onclick=()=>{fs=Math.max(.85,fs-.1);document.documentElement.style.setProperty("--fs",fs)};$("contrast").onclick=()=>document.body.classList.toggle("hc");

window.addEventListener("load",()=>{initMap();render([],"תוצאות קרובות","התחילו בחיפוש או השתמשו במיקום")});
