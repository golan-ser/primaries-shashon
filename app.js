
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
  const ll=`${x.lat},${x.lng}`;
  return {
    w:`https://waze.com/ul?ll=${encodeURIComponent(ll)}&navigate=yes`,
    g:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}`
  };
}
function navButtonsHtml(n){
  return `<a class="nav-icon waze" href="${n.w}" aria-label="ניווט ב-Waze" title="Waze"><img src="assets/waze-icon.png" alt="" width="22" height="22" loading="lazy" decoding="async"></a><a class="nav-icon maps" href="${n.g}" aria-label="ניווט ב-Google Maps" title="Google Maps"><img src="assets/google-maps-icon.png" alt="" width="22" height="22" loading="lazy" decoding="async"></a>`;
}

const searchInput=$("searchInput"),clearBtn=$("clearBtn"),resultsPanel=$("resultsPanel"),resultsList=$("resultsList"),
      resultsSummaryTitle=$("resultsSummaryTitle"),resultsSummaryCount=$("resultsSummaryCount"),resultsSub=$("resultsSub"),
      msg=$("msg"),fallback=$("fallback"),citySelect=$("citySelect"),gpsBtn=$("gpsBtn"),gpsText=$("gpsText");

let map=null,markers=[],userMarker=null,mapReady=false;

function initMap(){
  if(!window.L){$("map").innerHTML='<div class="map-fallback">המפה לא נטענה — החיפוש והניווט עדיין זמינים.</div>';return}
  map=L.map("map",{zoomControl:true,scrollWheelZoom:false}).setView([31.78,34.95],7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(map);
  const icon=L.divIcon({className:"",html:'<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#12d8e4;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 0 0 6px #12d8e433,0 0 22px #12d8e4"></div>',iconSize:[24,24],iconAnchor:[12,20]});
  data.forEach(x=>{
    const n=navs(x);
    const m=L.marker([x.lat,x.lng],{icon}).addTo(map).bindPopup(`<div dir="rtl"><b>${esc(x.city)}</b><br>${esc(x.site)}<br><small>${esc(x.address)}</small><div class="navs navs-pill map-popup-navs">${navButtonsHtml(n)}</div></div>`);
    markers.push({item:x,marker:m});
  });
  mapReady=true;
}
function focusMap(items){
  if(!map||!items.length)return;
  if(items.length===1){map.flyTo([items[0].lat,items[0].lng],13,{duration:.7})}
  else{const bounds=L.latLngBounds(items.map(x=>[x.lat,x.lng]));map.fitBounds(bounds.pad(.2))}
}
function cardHtml(x){
  const n=navs(x),d=Number.isFinite(x.distance)?`<div class="distance">${x.distance.toFixed(1)} ק״מ<span>ממך</span></div>`:"";
  return `<article class="result-card"><div><h4>${esc(x.city)}</h4><div class="site">${esc(x.site)}</div><div class="result-foot"><div class="addr">${esc(x.address)}</div><div class="navs navs-pill">${navButtonsHtml(n)}</div></div></div>${d}</article>`;
}
function showResults(items,{title,sub,countLabel,isNearby=false}){
  if(!items.length){hideResults();return}
  resultsSummaryTitle.textContent=title;
  resultsSummaryCount.textContent=countLabel||`${items.length} תוצאות`;
  resultsSub.textContent=sub||(isNearby?"מסודרות לפי מרחק אווירי — לחצו על Waze או Google Maps.":"לחצו על Waze או Google Maps לניווט.");
  resultsList.innerHTML=items.map(cardHtml).join("");
  resultsPanel.open=true;
  resultsPanel.classList.toggle("nearby",!!isNearby);
  focusMap(items.slice(0,8));
  if(isNearby) resultsPanel.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function hideResults(){
  resultsPanel.open=false;
  resultsPanel.classList.remove("nearby");
  resultsList.innerHTML="";
  resultsSummaryCount.textContent="";
}
function showMessage(text,type="info"){msg.textContent=text;msg.className=`message show ${type}`}
function clearMessage(){msg.className="message";msg.textContent=""}

const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
function isSafariBrowser(){
  const ua=navigator.userAgent||"";
  return /Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|Chrome|Chromium|OPR|Edg/i.test(ua);
}
function isInAppBrowser(){
  const ua=navigator.userAgent||"";
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Twitter|LinkedInApp|Telegram|Messenger/i.test(ua);
}
function isChromeMobile(){
  const ua=navigator.userAgent||"";
  return isMobile&&(/CriOS|Chrome/i.test(ua)&&!/EdgA|EdgiOS|OPR|SamsungBrowser/i.test(ua));
}
function locationDeniedHelp(){
  if(isIOS&&isChromeMobile()) return "Chrome חוסם מיקום. הגדרות iPhone ← Chrome ← מיקום: «בזמן שימוש». או: הגדרות ← פרטיות ← שירותי מיקום ← Chrome. אפשר גם לבחור יישוב ידנית למטה.";
  if(isSafariBrowser()) return "Safari חוסם מיקום. הגדרות iPhone ← Safari ← מיקום: «שאל». או: הגדרות ← פרטיות ← שירותי מיקום ← Safari. אפשר גם לבחור יישוב ידנית למטה.";
  if(isMobile) return "הגישה למיקום נחסמה. בהגדרות הטלפון אפשרו מיקום לדפדפן ולאתר sasson110.co.il, או בחרו יישוב ידנית למטה.";
  return "הגישה למיקום נחסמה. אפשרו מיקום בדפדפן לאתר זה, או בחרו יישוב ידנית למטה.";
}
function resetGpsBtn(){
  gpsBtn.disabled=false;
  gpsText.textContent="מצא קלפיות קרובות אליי";
}
function gpsErrorMessage(err){
  if(!window.isSecureContext) return "GPS זמין רק בחיבור מאובטח (HTTPS). פתחו את הקישור ב-Safari או Chrome.";
  if(isInAppBrowser()) return "הדפדפן שבו פתחתם את הקישור (למשל וואטסאפ) חוסם GPS. לחצו על ⋯ ובחרו «פתיחה בדפדפן».";
  if(!err) return "לא הצלחנו לאתר מיקום. אפשר לבחור יישוב ידנית.";
  if(err.code===1) return locationDeniedHelp();
  if(err.code===2) return "שירותי המיקום כבויים או לא זמינים כרגע. ודאו ש«שירותי מיקום» פועלים בהגדרות ה-iPhone. אפשר לבחור יישוב ידנית.";
  if(err.code===3) return isSafariBrowser()
    ? "Safari לא הצליח לאתר מיקום בזמן. נסו שוב בחוץ/ליד חלון, או בחרו יישוב ידנית."
    : "איתור המיקום לקח יותר מדי זמן. נסו שוב או בחרו יישוב ידנית.";
  return "לא הצלחנו לאתר מיקום. אפשר לבחור יישוב ידנית.";
}
function geoOptions(highAccuracy){
  return {
    enableHighAccuracy:highAccuracy,
    timeout:isIOS?(highAccuracy?30000:18000):isMobile?20000:10000,
    maximumAge:highAccuracy?0:isIOS?300000:60000
  };
}
function requestGeoPosition(onSuccess,onError,{highAccuracy=false,allowRetry=true}={}){
  navigator.geolocation.getCurrentPosition(
    onSuccess,
    err=>{
      if(allowRetry&&isIOS&&!highAccuracy&&err&&err.code===3){
        requestGeoPosition(onSuccess,onError,{highAccuracy:true,allowRetry:false});
        return;
      }
      onError(err);
    },
    geoOptions(highAccuracy)
  );
}
function onGpsSuccess(p){
  const nearest=data.map(x=>({...x,distance:distanceKm(p.coords.latitude,p.coords.longitude,x.lat,x.lng)})).sort((a,b)=>a.distance-b.distance).slice(0,4);
  showResults(nearest,{title:"הקלפיות הקרובות אליכם",sub:"מסודרות לפי מרחק אווירי — לחצו על Waze או Google Maps.",countLabel:`${nearest.length} קרובות`,isNearby:true});
  if(map&&window.L){
    if(userMarker) map.removeLayer(userMarker);
    userMarker=L.circleMarker([p.coords.latitude,p.coords.longitude],{radius:8,color:"#fff",weight:3,fillColor:"#0c65ff",fillOpacity:1}).addTo(map).bindPopup("המיקום שלך");
  }
  showMessage("המיקום נמצא בהצלחה.","info");
  resetGpsBtn();
}
function onGpsError(err){
  hideResults();
  showMessage(gpsErrorMessage(err),"error");
  fallback.classList.add("show");
  resetGpsBtn();
  msg.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function requestNearestPolling(){
  clearMessage();
  if(!navigator.geolocation){showMessage("הדפדפן אינו תומך במיקום. בחרו יישוב ידנית.","error");fallback.classList.add("show");return}
  if(!window.isSecureContext||isInAppBrowser()){onGpsError(null);fallback.classList.add("show");return}
  gpsBtn.disabled=true;
  gpsText.textContent="מאתרים מיקום...";
  requestGeoPosition(onGpsSuccess,onGpsError,{highAccuracy:!isIOS});
}

let timer;
searchInput.addEventListener("input",()=>{
  clearTimeout(timer);clearBtn.classList.toggle("show",searchInput.value.length>0);clearMessage();
  timer=setTimeout(()=>{
    const q=searchInput.value.trim();
    if(!q){hideResults();return}
    const items=searchSemantic(q).slice(0,8);
    showResults(items,{title:`תוצאות עבור “${q}”`,sub:"ממוינות לפי ההתאמה הטובה ביותר."});
  },120);
});
clearBtn.addEventListener("click",()=>{searchInput.value="";clearBtn.classList.remove("show");searchInput.focus();hideResults()});
document.querySelectorAll("[data-search]").forEach(b=>b.addEventListener("click",()=>{searchInput.value=b.dataset.search;clearBtn.classList.add("show");searchInput.dispatchEvent(new Event("input"))}));

gpsBtn.addEventListener("click",(e)=>{e.preventDefault();searchInput.value="";clearBtn.classList.remove("show");requestNearestPolling()});

[...new Set(data.map(x=>x.city))].sort((a,b)=>a.localeCompare(b,"he")).forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;citySelect.appendChild(o)});
$("useCity").addEventListener("click",()=>{
  const city=citySelect.value,items=data.filter(x=>x.city===city);
  if(items.length===1) window.location.href=navs(items[0]).w;
  else showResults(items,{title:`אתרי ההצבעה ב${city}`,sub:"לפי רשימת אתרי ההצבעה."});
});

const all=$("allList");
data.forEach((x,i)=>{
  const n=navs(x);
  const row=document.createElement("div");
  row.className="all-row";
  row.innerHTML=`<div class="num">${i+1}</div><div class="all-row-body"><b>${esc(x.city)} · ${esc(x.site)}</b><small>${esc(x.address)}</small></div><div class="navs navs-pill">${navButtonsHtml(n)}</div>`;
  all.appendChild(row);
});

document.querySelector(".map-wrap")?.addEventListener("toggle",e=>{
  if(e.target.open && mapReady && map) setTimeout(()=>map.invalidateSize(),120);
});

let fs=1;
$("plus").onclick=()=>{fs=Math.min(1.35,fs+.1);document.documentElement.style.setProperty("--fs",fs)};
$("minus").onclick=()=>{fs=Math.max(.85,fs-.1);document.documentElement.style.setProperty("--fs",fs)};
$("contrast").onclick=()=>document.body.classList.toggle("hc");

window.addEventListener("load",()=>initMap());
