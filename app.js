// ════════════════════════════════════════════════════
//  WINNER Esportes de Areia — app.js com Firebase
//  Substitua os valores abaixo pelos do seu projeto
// ════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBbHnGkOYcKSDbLXe8dTub4OfLoXhx0VK8",
  authDomain:        "winner-app-d3a9b.firebaseapp.com",
  projectId:         "winner-app-d3a9b",
  storageBucket:     "winner-app-d3a9b.firebasestorage.app",
  messagingSenderId: "759539483431",
  appId:             "1:759539483431:web:88daa0612d17fbca265f02"
};

// Número da Maria para notificações WhatsApp (DDI+DDD+número, sem espaços)
const MARIA_TEL = "554998147899";

// ─── FIREBASE INIT ───────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();

// ─────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────
const TIMEZONE   = "America/Sao_Paulo";
const COURTS     = ["Coberta", "Quadra 2", "Quadra 3"];
const TIME_SLOTS = [
  "07:00","08:00","09:00","10:00","11:00","12:00",
  "13:00","14:00","15:00","16:00","17:00","18:00",
  "19:00","20:00","21:00","22:00"
];
const MONTHS_PT  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SH  = ["Jan","Fev","Mar","Abr","Mai","Jun",
                    "Jul","Ago","Set","Out","Nov","Dez"];

// Gera meses dinamicamente: Jan/2026 até 12 meses à frente
function buildMeses() {
  const now   = new Date();
  const meses = [];
  // começa sempre em Jan/2026 como início fixo
  const startYear  = 2026;
  const startMonth = 0; // Janeiro
  // vai até 12 meses após o mês atual
  const endDate = new Date(now.getFullYear(), now.getMonth() + 12, 1);

  let y = startYear;
  let m = startMonth;
  while (new Date(y, m, 1) <= endDate) {
    const key   = `${y}-${String(m+1).padStart(2,"0")}`;
    const label = `${MONTHS_SH[m]}/${String(y).slice(2)}`;
    meses.push({ key, label });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return meses;
}
const MESES = buildMeses();

// ─────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────
let adminLogged        = false;
let reserveData        = { date: null, court: null, time: null };
let reservations       = [];
let alunos             = [];
let calYear            = null;
let calMonth           = null;
let calSelectedDk      = null;
let admSelectedDate    = null;
let cancelSelectedDate = null;

// ─────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────
function nowSP() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
}
function toDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatDateLabel(dk) {
  return new Date(dk+"T00:00:00").toLocaleDateString("pt-BR",{
    weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"
  });
}
function formatPhone(v) {
  const d = v.replace(/\D/g,"").slice(0,11);
  if (d.length<=2) return d?`(${d}`:"";
  if (d.length<=3) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length<=7) return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3,7)}-${d.slice(7,11)}`;
}
function normPhone(v)  { return v.replace(/\D/g,""); }
function fmtMoney(v)   { return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function getWeekday(dk){ return new Date(dk+"T00:00:00").getDay(); }
function getWeekDates(offset=0) {
  const base=nowSP(), mon=new Date(base);
  mon.setDate(base.getDate()+(base.getDay()===0?-6:1-base.getDay())+offset*7);
  mon.setHours(0,0,0,0);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
}
function courtClass(court,tipo){
  const c=court==="Coberta"?"coberta":court==="Quadra 2"?"q2":"q3";
  return `${tipo}-${c}`;
}
function evClass(court,tipo){
  const c=court==="Coberta"?"coberta":court==="Quadra 2"?"q2":"q3";
  return `ev-${tipo}-${c}`;
}
function getRes(dk,court,time){
  const wd=getWeekday(dk);
  return reservations.find(r=>r.tipo==="avulso"&&r.date===dk&&r.court===court&&r.time===time)
    ||reservations.find(r=>r.tipo==="fixo"&&r.weekday===wd&&r.court===court&&r.time===time
        &&(!r.start_date||r.start_date<=dk)&&(!r.exceptions||!r.exceptions.includes(dk)))
    ||null;
}
function getEventsForDate(dk){
  const wd=getWeekday(dk),evs=[];
  reservations.filter(r=>r.tipo==="fixo"&&r.weekday===wd
    &&(!r.start_date||r.start_date<=dk)&&(!r.exceptions||!r.exceptions.includes(dk))
  ).forEach(r=>evs.push({r,dk}));
  reservations.filter(r=>r.tipo==="avulso"&&r.date===dk).forEach(r=>evs.push({r,dk}));
  return evs.sort((a,b)=>a.r.time.localeCompare(b.r.time));
}
function waLink(tel,msg){ return `https://wa.me/55${normPhone(tel)}?text=${encodeURIComponent(msg)}`; }
function racket(){
  return `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor">
    <path d="M10.2 3.1c-3 1.1-4.9 4.1-4.6 7.2.2 2 1.2 3.9 2.7 5.1l-4.6 4.6a1.6 1.6 0 0 0 2.3 2.3l4.6-4.6c1.3 1.5 3.1 2.5 5.1 2.7 3.1.3 6.1-1.6 7.2-4.6 1.7-4.5-1.8-9.9-6.7-10.3-1.1-.1-2.1 0-3 .3-1.1.4-2.2 1-3 1.8-.8.8-1.4 1.8-1.8 3-.9 2.5.2 5.4 2.4 6.9 1.7 1.1 3.8 1.2 5.6.4 1.8-.8 3-2.5 3.2-4.5.2-1.7-.4-3.4-1.5-4.7-1.2-1.3-2.8-2-4.5-2.1-1.4-.1-2.7.2-3.9.8z"/>
  </svg>`;
}
function closeModal(){
  document.getElementById("modalBackdrop").classList.remove("show");
  document.getElementById("modalContent").innerHTML="";
}
function showToast(msg,ok=true){
  const t=document.createElement("div");
  t.style.cssText=`position:fixed;bottom:20px;right:20px;z-index:999;padding:12px 18px;
    border-radius:12px;font-weight:700;font-size:.9rem;color:#fff;
    background:${ok?"#2d6018":"#cf3b2f"};box-shadow:0 4px 16px rgba(0,0,0,.25)`;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// ─── LOADING ─────────────────────────────
function showLoading(msg="Carregando..."){
  let el=document.getElementById("ld");
  if(!el){
    el=document.createElement("div");el.id="ld";
    el.style.cssText=`position:fixed;inset:0;z-index:200;background:rgba(245,234,208,.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;backdrop-filter:blur(4px)`;
    el.innerHTML=`<div style="width:40px;height:40px;border:4px solid #2d6018;border-top-color:transparent;
      border-radius:50%;animation:spin .7s linear infinite"></div>
      <div style="font-weight:700;color:#2d6018;font-size:1rem" id="ldMsg"></div>`;
    document.body.appendChild(el);
    const s=document.createElement("style");
    s.textContent="@keyframes spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  }
  document.getElementById("ldMsg").textContent=msg;
  el.style.display="flex";
}
function hideLoading(){ const el=document.getElementById("ld"); if(el)el.style.display="none"; }

// ════════════════════════════════════════════
//  FIREBASE — CARREGAR DADOS
// ════════════════════════════════════════════
async function loadReservations(){
  try {
    const snap=await db.collection("reservations").get();
    reservations=snap.docs.map(d=>({id:d.id,...d.data()}));
  } catch(e) {
    console.error("Erro Firestore:", e.code, e.message);
    if(e.code==="permission-denied") {
      showErroConexao("❌ Permissão negada no banco de dados.<br>Verifique as regras do Firestore.");
    } else if(e.code==="unavailable" || e.message.includes("network")) {
      showErroConexao("❌ Sem conexão com o banco de dados.<br>Verifique sua internet.");
    } else {
      showErroConexao("❌ Erro ao conectar: " + e.message);
    }
  }
}

function showErroConexao(msg) {
  hideLoading();
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;inset:0;z-index:300;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:16px;
    background:rgba(245,234,208,.96);padding:24px;text-align:center`;
  el.innerHTML = `
    <div style="font-size:2rem">🔥</div>
    <div style="font-size:1rem;font-weight:700;color:#cf3b2f;max-width:320px;line-height:1.6">${msg}</div>
    <div style="font-size:.85rem;color:#555;max-width:320px;line-height:1.6">
      Verifique:<br>
      1. Se o Firestore foi criado no Firebase<br>
      2. Se as regras foram publicadas<br>
      3. Se as credenciais no app.js estão corretas
    </div>
    <button onclick="location.reload()" style="padding:10px 20px;border-radius:12px;border:none;
      background:#2d6018;color:#fff;font-weight:700;cursor:pointer;font-size:.9rem">
      Tentar novamente
    </button>`;
  document.body.appendChild(el);
}
async function loadAlunos(){
  const snap=await db.collection("alunos").orderBy("nome").get();
  alunos=snap.docs.map(d=>({id:d.id,...d.data()}));
}

// ════════════════════════════════════════════
//  FIREBASE — SALVAR / ATUALIZAR / DELETAR
// ════════════════════════════════════════════

// Reservas
async function dbAddRes(data){
  const ref=await db.collection("reservations").add(data);
  return {id:ref.id,...data};
}
async function dbUpdateRes(id,data){
  await db.collection("reservations").doc(id).update(data);
}
async function dbDeleteRes(id){
  await db.collection("reservations").doc(id).delete();
}

// Alunos
async function dbAddAluno(data){
  const ref=await db.collection("alunos").add(data);
  return {id:ref.id,...data};
}
async function dbUpdateAluno(id,data){
  await db.collection("alunos").doc(id).update(data);
}
async function dbDeleteAluno(id){
  await db.collection("alunos").doc(id).delete();
}

// ─────────────────────────────────────────
// RENDER GERAL
// ─────────────────────────────────────────
function renderAll(){
  renderCalendar();
  renderResSummary();
  if(adminLogged){
    renderAdmCalendar();
    renderAdmDays();
    renderAdmSchedule();
    renderPayTable();
    renderAlunosTable();
  }
}

// ════════════════════════════════════════════
//  CALENDÁRIO MENSAL — AGENDA PÚBLICA
//  (zero informação de pagamento)
// ════════════════════════════════════════════
function renderCalendar(){
  const now=nowSP();
  if(calYear===null)  calYear=now.getFullYear();
  if(calMonth===null) calMonth=now.getMonth();
  document.getElementById("calMonthLabel").textContent=`${MONTHS_PT[calMonth]} ${calYear}`;

  const grid=document.getElementById("calGrid"),todayKey=toDateKey(now);
  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInM=new Date(calYear,calMonth+1,0).getDate();
  const prevDays=new Date(calYear,calMonth,0).getDate();
  const cells=[];

  for(let i=firstDay-1;i>=0;i--){
    cells.push({dk:toDateKey(new Date(calYear,calMonth-1,prevDays-i)),num:prevDays-i,other:true});
  }
  for(let d=1;d<=daysInM;d++){
    cells.push({dk:toDateKey(new Date(calYear,calMonth,d)),num:d,other:false});
  }
  let nx=1;
  while(cells.length%7!==0) cells.push({dk:toDateKey(new Date(calYear,calMonth+1,nx++)),num:nx-1,other:true});

  const isMobile=window.innerWidth<=640;
  const MAX=isMobile?0:3;

  grid.innerHTML=cells.map(({dk,num,other})=>{
    const evs=getEventsForDate(dk);
    const isToday=dk===todayKey,isSel=dk===calSelectedDk;
    const pills=evs.slice(0,MAX).map(({r})=>`
      <div class="cal-event ${evClass(r.court,r.tipo)}" title="${r.time} · ${r.nome} · ${r.court}">
        <div class="cal-event-dot"></div>${r.time} ${r.nome}
      </div>`).join("");
    const more=evs.length>MAX&&!isMobile?`<div class="cal-more">+${evs.length-MAX} mais</div>`:"";
    const dots=[...new Set(evs.map(({r})=>evClass(r.court,r.tipo)))].slice(0,5)
      .map(cls=>`<div class="cal-dot ${cls}"></div>`).join("");
    const dotHtml=evs.length?`<div class="cal-dots">${dots}</div>`:"";
    return `<div class="cal-cell${other?" other-month":""}${isToday?" today":""}${isSel?" cal-selected":""}"
      onclick="calSelectDay('${dk}')">
      <div class="cal-day-num">${num}</div>${pills}${more}${dotHtml}
    </div>`;
  }).join("");

  if(calSelectedDk) renderCalDayDetail(calSelectedDk);
}

function calSelectDay(dk){
  calSelectedDk=dk; renderCalendar(); renderCalDayDetail(dk);
  document.getElementById("calDayDetail").classList.remove("hidden");
}
function renderCalDayDetail(dk){
  const evs=getEventsForDate(dk);
  const d=new Date(dk+"T00:00:00");
  document.getElementById("calDetailDate").textContent=
    d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  const list=document.getElementById("calDetailList");

  // Horários ocupados
  const ocupadosHtml = evs.length
    ? evs.map(({r})=>`
        <div class="cal-detail-item ${evClass(r.court,r.tipo)}">
          <span class="det-time">${r.time}</span>
          <span class="det-name">${r.nome}</span>
          <span class="det-court">${r.court} · ${r.tipo}</span>
        </div>`).join("")
    : `<div style="color:#777;font-size:.9rem;padding:8px 0">Nenhuma reserva neste dia.</div>`;

  // Calcula horários livres por quadra
  const livres = [];
  for(const time of TIME_SLOTS){
    const livresPorHora = [];
    for(const court of COURTS){
      if(!getRes(dk, court, time)) livresPorHora.push(court);
    }
    if(livresPorHora.length){
      livres.push({time, courts: livresPorHora});
    }
  }

  const livresHtml = livres.length ? livres.map(({time, courts})=>`
    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;
      border-radius:10px;margin-bottom:5px;background:rgba(255,255,255,.55);
      border:1px dashed rgba(45,96,24,.3);cursor:pointer"
      onclick="openReserveFromCalSlot('${dk}','${time}')">
      <span style="font-size:.78rem;font-weight:800;color:#555;min-width:44px">${time}</span>
      <span style="flex:1;font-size:.8rem;color:#2d6018;font-weight:600">${courts.join(" · ")}</span>
      <span style="font-size:.75rem;color:#2d6018;font-weight:700">+ Reservar</span>
    </div>`).join("")
    : `<div style="color:#777;font-size:.85rem;padding:6px 0">Nenhum horário livre neste dia.</div>`;

  list.innerHTML=`
    ${ocupadosHtml}
    <div style="margin-top:14px;margin-bottom:6px;font-size:.78rem;font-weight:800;
      color:#2d6018;text-transform:uppercase;letter-spacing:.06em">
      🟢 Horários disponíveis
    </div>
    ${livresHtml}`;
}

function openReserveFromCalSlot(dk, time){
  reserveData.date  = dk;
  reserveData.time  = time;
  reserveData.court = null;
  closeModal();
  closeCalDetail();
  showScreen("reservar");
  syncResFormFields();
}
function closeCalDetail(){
  calSelectedDk=null;
  document.getElementById("calDayDetail").classList.add("hidden");
  renderCalendar();
}
function openReserveFromCal(){
  if(calSelectedDk) reserveData.date=calSelectedDk;
  showScreen("reservar"); renderResSummary();
}

// ─────────────────────────────────────────
// RESERVAR (público) — campos editáveis
// ─────────────────────────────────────────
function prefillReserve(date,court,time){
  reserveData={date,court,time};
  showScreen("reservar");
  syncResFormFields();
}
function openReserveFromCal(){
  if(calSelectedDk) reserveData.date=calSelectedDk;
  reserveData.court=null; reserveData.time=null;
  showScreen("reservar");
  syncResFormFields();
}

// Sincroniza os selects/inputs com reserveData
function syncResFormFields(){
  const dateEl   =document.getElementById("resData");
  const quadraEl =document.getElementById("resQuadra");
  const horarioEl=document.getElementById("resHorario");
  if(dateEl    && reserveData.date)  dateEl.value   =reserveData.date;
  if(quadraEl  && reserveData.court) quadraEl.value =reserveData.court;
  if(horarioEl && reserveData.time)  horarioEl.value=reserveData.time;
  checkConflict();
}

// Callbacks dos selects
function resDataChanged(){
  const v=document.getElementById("resData").value;
  reserveData.date=v||null;
  checkConflict();
}
function resQuadraChanged(){
  const v=document.getElementById("resQuadra").value;
  reserveData.court=v||null;
  checkConflict();
}
function resHorarioChanged(){
  const v=document.getElementById("resHorario").value;
  reserveData.time=v||null;
  checkConflict();
}

// Verifica se o horário escolhido está ocupado
function checkConflict(){
  const msgEl=document.getElementById("resHorarioOcupadoMsg");
  if(!msgEl)return;
  if(reserveData.date&&reserveData.court&&reserveData.time){
    const ocupado=!!getRes(reserveData.date,reserveData.court,reserveData.time);
    msgEl.style.display=ocupado?"block":"none";
  } else {
    msgEl.style.display="none";
  }
}

// Mantém renderResSummary vazio (campos ocultos no HTML)
function renderResSummary(){ syncResFormFields(); }

function clearResForm(){
  reserveData={date:null,court:null,time:null};
  const fields=["resData","resQuadra","resHorario","resNome","resTelefone","resObs"];
  fields.forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("resValor").value="60.00";
  document.getElementById("resTipo").value="avulso";
  const msgEl=document.getElementById("resHorarioOcupadoMsg");
  if(msgEl)msgEl.style.display="none";
}

async function confirmReservation(){
  // Lê data, quadra e horário dos novos selects do formulário
  const dataEl   =document.getElementById("resData");
  const quadraEl =document.getElementById("resQuadra");
  const horarioEl=document.getElementById("resHorario");
  if(dataEl    && dataEl.value)    reserveData.date  =dataEl.value;
  if(quadraEl  && quadraEl.value)  reserveData.court =quadraEl.value;
  if(horarioEl && horarioEl.value) reserveData.time  =horarioEl.value;

  const nome    =document.getElementById("resNome").value.trim();
  const telefone=normPhone(document.getElementById("resTelefone").value);
  const tipo    =document.getElementById("resTipo").value;
  const valor   =Number(document.getElementById("resValor").value||60);

  if(!reserveData.date)  {alert("Selecione a data.");return;}
  if(!reserveData.court) {alert("Selecione a quadra.");return;}
  if(!reserveData.time)  {alert("Selecione o horário.");return;}
  if(!nome)              {alert("Informe o nome completo.");return;}
  if(telefone.length<10) {alert("Informe um telefone válido.");return;}
  if(getRes(reserveData.date,reserveData.court,reserveData.time)){alert("Este horário já está ocupado. Escolha outro horário ou quadra.");return;}

  const newR={
    tipo,time:reserveData.time,court:reserveData.court,nome,telefone,valor,
    status_pagamento:"pendente",
    date:      tipo==="avulso"?reserveData.date:null,
    weekday:   tipo==="fixo"  ?getWeekday(reserveData.date):null,
    start_date:tipo==="fixo"  ?reserveData.date:null,
    exceptions:[],
    created_at:new Date().toISOString()
  };

  showLoading("Salvando reserva...");
  try{
    const saved=await dbAddRes(newR);
    reservations.push(saved);
    hideLoading();

    // Notifica a Maria no WhatsApp
    const msg=`🎾 *Nova reserva — Winner!*\n\n👤 ${nome}\n📱 ${formatPhone(telefone)}\n📅 ${formatDateLabel(reserveData.date)}\n⏰ ${reserveData.time} — ${reserveData.court}\n💰 ${fmtMoney(valor)} · ${tipo}\n\nResponda para confirmar ou entrar em contato.`;
    document.getElementById("modalContent").innerHTML=`
      <h3 style="margin-bottom:12px">✅ Reserva enviada!</h3>
      <p style="color:#555;margin-bottom:16px">Sua reserva foi registrada.<br>A Maria vai confirmar em breve.</p>
      <a class="btn btn-lime" href="${waLink(MARIA_TEL,msg)}" target="_blank"
        style="display:inline-block;text-decoration:none;margin-bottom:10px">
        📲 Avisar a Maria no WhatsApp
      </a><br>
      <button class="btn btn-outline" style="margin-top:8px" onclick="closeModal();showScreen('agenda')">Voltar à agenda</button>`;
    document.getElementById("modalBackdrop").classList.add("show");
    clearResForm(); renderAll();
  } catch(e){
    hideLoading();
    showToast("Erro ao salvar. Tente novamente.",false);
    console.error(e);
  }
}

// ─────────────────────────────────────────
// CANCELAR (público — valida telefone)
// ─────────────────────────────────────────
function renderCancelDays(){
  const container=document.getElementById("cancelDaysContainer");
  const dates=getWeekDates(0);
  if(!cancelSelectedDate) cancelSelectedDate=toDateKey(dates[0]);
  container.innerHTML=dates.map(d=>{
    const dk=toDateKey(d);
    const dow=d.toLocaleDateString("pt-BR",{weekday:"short"});
    const mon=d.toLocaleDateString("pt-BR",{month:"short"});
    return `<div class="day-card ${dk===cancelSelectedDate?"active":""}" onclick="cancelSelectDate('${dk}')">
      <div class="dow">${dow}</div><div class="num">${String(d.getDate()).padStart(2,"0")}</div>
      <div class="month">${mon}</div></div>`;
  }).join("");
}
function cancelSelectDate(dk){cancelSelectedDate=dk;renderCancelDays();renderCancelGrid();}

function renderCancelGrid(){
  const grid=document.getElementById("cancelGrid"),now=nowSP();
  let h=`<div class="schedule-grid"><div class="cell head">Horário</div>`
    +COURTS.map(c=>`<div class="cell head">${c}</div>`).join("");
  for(const time of TIME_SLOTS){
    h+=`<div class="cell time-cell">${time}</div>`;
    for(const court of COURTS){
      const r=getRes(cancelSelectedDate,court,time);
      if(r){
        const diff=(new Date(`${cancelSelectedDate}T${time}:00`)-now)/36e5;
        h+=diff>=2
          ?`<div class="cell"><div class="slot ${courtClass(court,r.tipo)}" onclick="openCancelModal('${r.id}','${cancelSelectedDate}','${time}')">
              ${r.nome}<br><small>cancelar</small></div></div>`
          :`<div class="cell"><div class="slot locked">${r.nome}<br><small>sem prazo</small></div></div>`;
      } else {
        h+=`<div class="cell"><div class="slot free-cancel">—</div></div>`;
      }
    }
  }
  grid.innerHTML=h+`</div>`;
}

function openCancelModal(id,dk,time){
  const r=reservations.find(x=>x.id===id); if(!r)return;
  document.getElementById("modalContent").innerHTML=`
    <h3 style="margin-bottom:12px">Cancelar reserva</h3>
    <p><strong>Cliente:</strong> ${r.nome}</p>
    <p><strong>Data:</strong> ${formatDateLabel(dk)}</p>
    <p><strong>Horário:</strong> ${time} — ${r.court}</p>
    <div class="field full" style="margin-top:14px">
      <label>Seu telefone (para confirmar)</label>
      <input type="text" id="cancelPhoneInput" placeholder="(49) 9 9999-9999" maxlength="16">
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-danger" onclick="confirmCancel('${id}','${dk}')">Confirmar cancelamento</button>
      <button class="btn btn-outline" onclick="closeModal()">Voltar</button>
    </div>`;
  document.getElementById("cancelPhoneInput").addEventListener("input",e=>{e.target.value=formatPhone(e.target.value);});
  document.getElementById("modalBackdrop").classList.add("show");
}

async function confirmCancel(id,dk){
  const r=reservations.find(x=>x.id===id); if(!r)return;
  if(normPhone(document.getElementById("cancelPhoneInput").value)!==r.telefone){alert("Telefone não confere.");return;}
  await removeRes(id,dk);
  closeModal(); renderCancelGrid();
  alert("Reserva cancelada com sucesso.");
}

// ─────────────────────────────────────────
// REMOÇÃO
// ─────────────────────────────────────────
async function removeRes(id,dk){
  const r=reservations.find(x=>x.id===id); if(!r)return;
  showLoading("Removendo...");
  try{
    if(r.tipo==="fixo"){
      const exc=[...(r.exceptions||[]),dk];
      await dbUpdateRes(id,{exceptions:exc});
      r.exceptions=exc;
    } else {
      await dbDeleteRes(id);
      reservations=reservations.filter(x=>x.id!==id);
    }
  }catch(e){showToast("Erro ao remover.",false);console.error(e);}
  hideLoading(); closeModal(); renderAll();
}

async function removeResSeries(id){
  if(!confirm("Remover a série inteira desta reserva fixa?"))return;
  showLoading("Removendo série...");
  try{
    await dbDeleteRes(id);
    reservations=reservations.filter(r=>r.id!==id);
  }catch(e){showToast("Erro.",false);console.error(e);}
  hideLoading(); closeModal(); renderAll();
}

// ════════════════════════════════════════════
//  ADMIN — LOGIN / LOGOUT (Firebase Auth)
// ════════════════════════════════════════════
async function doAdminLogin(){
  const email=document.getElementById("adminUser").value.trim();
  const pass =document.getElementById("adminPass").value;
  const errEl=document.getElementById("loginErrMsg");
  errEl.style.display="none";
  showLoading("Autenticando...");
  try{
    await auth.signInWithEmailAndPassword(email,pass);
    // onAuthStateChanged vai cuidar do restante
  }catch(e){
    hideLoading();
    errEl.style.display="block";
    errEl.textContent="Email ou senha incorretos.";
  }
}
async function doAdminLogout(){
  await auth.signOut();
  // onAuthStateChanged reseta o estado
}

// ── Listener de autenticação — único ponto de controle ──
auth.onAuthStateChanged(async user=>{
  adminLogged=!!user;
  if(user){
    document.getElementById("adminLogin").classList.add("hidden");
    document.getElementById("adminPanel").classList.remove("hidden");
    showLoading("Carregando dados...");
    try{ await loadAlunos(); }catch(e){console.error(e);}
    hideLoading();
    renderAll();
  } else {
    alunos=[];
    document.getElementById("adminLogin").classList.remove("hidden");
    document.getElementById("adminPanel").classList.add("hidden");
    renderAll();
  }
});

// ════════════════════════════════════════════
//  ADMIN — AGENDA COM CHECK PAGO / PENDENTE
// ════════════════════════════════════════════
function renderAdmDays(){
  const container=document.getElementById("adminDaysContainer");
  const dates=getWeekDates(0);
  if(!admSelectedDate) admSelectedDate=toDateKey(dates[0]);
  container.innerHTML=dates.map(d=>{
    const dk=toDateKey(d);
    const dow=d.toLocaleDateString("pt-BR",{weekday:"short"});
    const mon=d.toLocaleDateString("pt-BR",{month:"short"});
    return `<div class="day-card ${dk===admSelectedDate?"active":""}" onclick="admSelectDate('${dk}')">
      <div class="dow">${dow}</div><div class="num">${String(d.getDate()).padStart(2,"0")}</div>
      <div class="month">${mon}</div></div>`;
  }).join("");
}
function admSelectDate(dk){admSelectedDate=dk;renderAdmDays();renderAdmSchedule();}

function renderAdmSchedule(){
  const grid=document.getElementById("adminGrid");
  let h=`<div class="schedule-grid"><div class="cell head">Horário</div>`
    +COURTS.map(c=>`<div class="cell head">${c}</div>`).join("");
  for(const time of TIME_SLOTS){
    h+=`<div class="cell time-cell">${time}</div>`;
    for(const court of COURTS){
      const r=getRes(admSelectedDate,court,time);
      if(r){
        const pago=r.status_pagamento==="pago";
        const wamsg=`Olá ${r.nome}! 🎾 Lembrete de pagamento da reserva na Winner.\n\n📅 ${formatDateLabel(admSelectedDate)}\n⏰ ${r.time} — ${r.court}\n💰 ${fmtMoney(r.valor)}\n\nObrigada! 😊`;
        h+=`<div class="cell">
          <div class="slot ${courtClass(court,r.tipo)}" style="flex-direction:column;align-items:flex-start;gap:3px;cursor:default;padding:8px">
            <div style="font-weight:700;font-size:.82rem">${r.nome}</div>
            <div style="font-size:.68rem;opacity:.75">${r.tipo} · ${fmtMoney(r.valor)}</div>
            <!-- CHECK PAGAMENTO — só visível no admin -->
            <label style="display:flex;align-items:center;gap:6px;margin-top:5px;cursor:pointer;font-size:.75rem;font-weight:800"
              onclick="togglePago('${r.id}')">
              <div style="width:20px;height:20px;border-radius:5px;
                border:2px solid ${pago?"#1e8e3e":"#cf3b2f"};
                background:${pago?"#1e8e3e":"transparent"};
                display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${pago?`<svg viewBox="0 0 12 12" style="width:11px;height:11px;fill:#fff"><path d="M1 6l3.5 3.5L11 2"/></svg>`:""}
              </div>
              <span style="color:${pago?"#1e8e3e":"#cf3b2f"}">${pago?"Pago":"Pendente"}</span>
            </label>
            ${!pago?`<a href="${waLink(r.telefone,wamsg)}" target="_blank"
              style="display:flex;align-items:center;gap:4px;margin-top:4px;padding:4px 8px;
              background:#25D366;color:#fff;border-radius:8px;text-decoration:none;font-size:.7rem;font-weight:800">
              📲 WhatsApp</a>`:""}
            <button onclick="openAdmModal('${r.id}','${admSelectedDate}')"
              style="margin-top:4px;padding:3px 8px;font-size:.65rem;border-radius:8px;
              border:1px solid rgba(0,0,0,.15);background:rgba(255,255,255,.5);cursor:pointer;font-weight:700">
              ⋯ opções</button>
          </div></div>`;
      } else {
        h+=`<div class="cell"><div class="slot free" onclick="openAdmNewRes('${admSelectedDate}','${court}','${time}')">${racket()}</div></div>`;
      }
    }
  }
  grid.innerHTML=h+`</div>`;
}

// ── Toggle pago (salva no Firebase) ──
async function togglePago(id){
  const r=reservations.find(x=>x.id===id); if(!r)return;
  const novo=r.status_pagamento==="pago"?"pendente":"pago";
  try{
    await dbUpdateRes(id,{status_pagamento:novo});
    r.status_pagamento=novo;
    renderAdmSchedule(); renderPayTable();
    showToast(novo==="pago"?"✔ Marcado como pago!":"↩ Marcado como pendente");
  }catch(e){showToast("Erro ao atualizar.",false);console.error(e);}
}

// ── Modal admin ──
function openAdmModal(id,dk){
  const r=reservations.find(x=>x.id===id); if(!r)return;
  const pago=r.status_pagamento==="pago";
  const dl=r.tipo==="fixo"?`${formatDateLabel(dk)} (fixa semanal)`:formatDateLabel(r.date||dk);
  const msg=`Olá ${r.nome}! 🎾 Lembrete de pagamento na Winner.\n\n📅 ${dl}\n⏰ ${r.time} — ${r.court}\n💰 ${fmtMoney(r.valor)}\n\nObrigada! 😊`;
  document.getElementById("modalContent").innerHTML=`
    <h3 style="margin-bottom:14px">Reserva — Admin</h3>
    <div style="display:grid;gap:6px;margin-bottom:16px;font-size:.95rem">
      <p><strong>Cliente:</strong> ${r.nome}</p>
      <p><strong>Telefone:</strong> ${formatPhone(r.telefone)}</p>
      <p><strong>Data:</strong> ${dl}</p>
      <p><strong>Horário:</strong> ${r.time} — ${r.court}</p>
      <p><strong>Tipo:</strong> ${r.tipo}</p>
      <p><strong>Valor:</strong> ${fmtMoney(r.valor)}</p>
      <p><strong>Pagamento:</strong>
        <span style="font-weight:800;color:${pago?"#1e8e3e":"#cf3b2f"}">${pago?"✔ Pago":"⚠ Pendente"}</span></p>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${!pago
        ?`<button class="btn btn-primary" onclick="togglePago('${r.id}');closeModal()">✔ Marcar como pago</button>
          <a class="btn btn-lime" href="${waLink(r.telefone,msg)}" target="_blank" style="text-decoration:none">📲 WhatsApp</a>`
        :`<button class="btn btn-outline" onclick="togglePago('${r.id}');closeModal()">↩ Desmarcar</button>`}
      ${r.tipo==="fixo"
        ?`<button class="btn btn-danger" onclick="removeRes('${r.id}','${dk}')">Remover esta data</button>
          <button class="btn btn-outline" onclick="removeResSeries('${r.id}')">Remover série</button>`
        :`<button class="btn btn-danger" onclick="removeRes('${r.id}','${dk}')">Remover reserva</button>`}
      <button class="btn btn-outline" onclick="closeModal()">Fechar</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
}

// ── Nova reserva pela grade admin ──
function openAdmNewRes(dk,court,time){
  document.getElementById("modalContent").innerHTML=`
    <h3 style="margin-bottom:12px">Nova reserva</h3>
    <p style="color:#555;margin-bottom:16px">${formatDateLabel(dk)} · ${time} · ${court}</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label>Nome completo</label><input type="text" id="mdNome" placeholder="Nome do cliente"></div>
      <div class="field"><label>Telefone</label><input type="text" id="mdTel" placeholder="(49) 9 9999-9999" maxlength="16"></div>
      <div class="field"><label>Tipo</label>
        <select id="mdTipo"><option value="avulso">Avulso</option><option value="fixo">Fixo (semanal)</option></select>
      </div>
      <div class="field"><label>Valor (R$)</label><input type="text" id="mdValor" value="60.00"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button class="btn btn-primary" onclick="saveAdmNewRes('${dk}','${court}','${time}')">Salvar</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    </div>`;
  document.getElementById("mdTel").addEventListener("input",e=>{e.target.value=formatPhone(e.target.value);});
  document.getElementById("modalBackdrop").classList.add("show");
}

async function saveAdmNewRes(dk,court,time){
  const nome    =document.getElementById("mdNome").value.trim();
  const telefone=normPhone(document.getElementById("mdTel").value);
  const tipo    =document.getElementById("mdTipo").value;
  const valor   =Number(document.getElementById("mdValor").value||60);
  if(!nome)              {alert("Informe o nome.");return;}
  if(telefone.length<10) {alert("Informe um telefone válido.");return;}
  const newR={
    tipo,time,court,nome,telefone,valor,status_pagamento:"pendente",
    date:      tipo==="avulso"?dk:null,
    weekday:   tipo==="fixo"  ?getWeekday(dk):null,
    start_date:tipo==="fixo"  ?dk:null,
    exceptions:[],created_at:new Date().toISOString()
  };
  showLoading("Salvando...");
  try{
    const saved=await dbAddRes(newR);
    reservations.push(saved);
    showToast("Reserva criada!");
    closeModal(); renderAll();
  }catch(e){showToast("Erro ao salvar.",false);console.error(e);}
  hideLoading();
}

// ── Tabela de pagamentos ──
function renderPayTable(){
  const tbody=document.getElementById("paymentsTableBody");
  const rows=[];
  for(const d of getWeekDates(0)){
    const dk=toDateKey(d);
    for(const time of TIME_SLOTS) for(const court of COURTS){
      const r=getRes(dk,court,time); if(r) rows.push({r,dk});
    }
  }
  const total=rows.length,pagos=rows.filter(x=>x.r.status_pagamento==="pago").length;
  document.getElementById("kpiTotal").textContent=total;
  document.getElementById("kpiPagos").textContent=pagos;
  document.getElementById("kpiPendentes").textContent=total-pagos;
  document.getElementById("kpiValor").textContent=fmtMoney(
    rows.filter(x=>x.r.status_pagamento!=="pago").reduce((s,x)=>s+Number(x.r.valor||0),0)
  );
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:#999;padding:20px">Nenhuma reserva nesta semana</td></tr>`;
    return;
  }
  tbody.innerHTML=rows.map(({r,dk})=>{
    const pago=r.status_pagamento==="pago";
    const msg=`Olá ${r.nome}! 🎾 Lembrete de pagamento na Winner.\n\n📅 ${formatDateLabel(dk)}\n⏰ ${r.time} — ${r.court}\n💰 ${fmtMoney(r.valor)}\n\nObrigada! 😊`;
    return `<tr>
      <td>${formatDateLabel(dk)}</td><td>${r.time}</td><td>${r.court}</td>
      <td>${r.nome}<br><small style="color:#888">${formatPhone(r.telefone)}</small></td>
      <td>${r.tipo}</td>
      <td><label style="display:flex;align-items:center;gap:7px;cursor:pointer" onclick="togglePago('${r.id}')">
        <div style="width:20px;height:20px;border-radius:5px;
          border:2px solid ${pago?"#1e8e3e":"#cf3b2f"};
          background:${pago?"#1e8e3e":"transparent"};
          display:flex;align-items:center;justify-content:center">
          ${pago?`<svg viewBox="0 0 12 12" style="width:11px;height:11px;fill:#fff"><path d="M1 6l3.5 3.5L11 2"/></svg>`:""}
        </div>
        <span style="font-weight:800;color:${pago?"#1e8e3e":"#cf3b2f"}">${pago?"Pago":"Pendente"}</span>
      </label></td>
      <td><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:700">${fmtMoney(r.valor)}</span>
        ${!pago?`<a class="btn btn-lime" style="padding:5px 10px;font-size:.78rem;text-decoration:none"
          href="${waLink(r.telefone,msg)}" target="_blank">📲 WhatsApp</a>`:""}
      </div></td></tr>`;
  }).join("");
}

// ════════════════════════════════════════════
//  ALUNOS — MENSALIDADES
// ════════════════════════════════════════════
function renderAlunosTable(){
  const tbody=document.getElementById("alunosTableBody");
  if(!tbody)return;

  // Injeta cabeçalhos dos meses dinamicamente
  const hdrEl=document.getElementById("meses-header-cols");
  if(hdrEl) hdrEl.outerHTML=MESES.map(m=>`<th style="min-width:48px;text-align:center">${m.label}</th>`).join("");

  if(!alunos.length){
    tbody.innerHTML=`<tr><td colspan="${4+MESES.length+1}"
      style="text-align:center;color:#999;padding:24px">
      Nenhum aluno cadastrado. Clique em <strong>+ Novo aluno</strong> para começar.</td></tr>`;
    return;
  }
  tbody.innerHTML=alunos.map(a=>{
    const ativo=a.ativo!==false;
    const mesesHtml=MESES.map(m=>{
      const pago=a.pagamentos&&a.pagamentos[m.key];
      return `<td style="text-align:center;padding:6px 4px">
        <button onclick="toggleMes('${a.id}','${m.key}')"
          style="width:38px;height:28px;border-radius:7px;border:none;cursor:pointer;
            font-size:.8rem;font-weight:800;transition:.15s;
            background:${pago?"#1e8e3e":"#e0e0e0"};color:${pago?"#fff":"#aaa"}">
          ${pago?"✔":"—"}</button></td>`;
    }).join("");
    const msg=`Olá ${a.nome}! 🎾 Lembrete da mensalidade de beach tennis na Winner${a.horario?` — ${a.horario}`:""}.${"\n\n"}💰 Valor: ${fmtMoney(a.valor)}${"\n\n"}Obrigada! 😊`;
    return `<tr style="opacity:${ativo?1:.45}">
      <td><span style="font-weight:700;${ativo?"":"text-decoration:line-through;color:#999"}">${a.nome}</span>
        ${!ativo?`<br><span style="font-size:.7rem;color:#cf3b2f;font-weight:800">INATIVO</span>`:""}</td>
      <td style="font-size:.85rem;white-space:nowrap">${formatPhone(a.telefone)}</td>
      <td style="font-size:.85rem">${a.horario||"—"}</td>
      <td style="font-weight:700;white-space:nowrap">${fmtMoney(a.valor)}</td>
      ${mesesHtml}
      <td><div style="display:flex;gap:5px;flex-wrap:wrap;min-width:180px">
        <a class="btn btn-lime" style="padding:5px 9px;font-size:.75rem;text-decoration:none"
          href="${waLink(a.telefone,msg)}" target="_blank">📲</a>
        <button class="btn ${ativo?"btn-outline":"btn-secondary"}" style="padding:5px 9px;font-size:.75rem"
          onclick="toggleAtivo('${a.id}')">${ativo?"⏸ Inativar":"▶ Reativar"}</button>
        <button class="btn btn-outline" style="padding:5px 9px;font-size:.75rem" onclick="editAluno('${a.id}')">✏️</button>
        <button class="btn btn-danger"  style="padding:5px 9px;font-size:.75rem" onclick="delAluno('${a.id}')">🗑</button>
      </div></td></tr>`;
  }).join("");
}

async function toggleMes(id,mesKey){
  const a=alunos.find(x=>x.id===id); if(!a)return;
  if(!a.pagamentos)a.pagamentos={};
  a.pagamentos[mesKey]=!a.pagamentos[mesKey];
  try{
    await dbUpdateAluno(id,{pagamentos:a.pagamentos});
    renderAlunosTable();
  }catch(e){showToast("Erro ao atualizar.",false);console.error(e);}
}
async function toggleAtivo(id){
  const a=alunos.find(x=>x.id===id); if(!a)return;
  a.ativo=!(a.ativo!==false);
  try{
    await dbUpdateAluno(id,{ativo:a.ativo});
    renderAlunosTable();
    showToast(a.ativo?"Aluno reativado":"Aluno inativado");
  }catch(e){showToast("Erro.",false);console.error(e);}
}
async function delAluno(id){
  if(!confirm("Remover aluno permanentemente?"))return;
  showLoading("Removendo...");
  try{
    await dbDeleteAluno(id);
    alunos=alunos.filter(a=>a.id!==id);
    renderAlunosTable();
  }catch(e){showToast("Erro.",false);console.error(e);}
  hideLoading();
}
function editAluno(id){
  const a=alunos.find(x=>x.id===id); if(!a)return;
  document.getElementById("modalContent").innerHTML=`
    <h3 style="margin-bottom:14px">Editar aluno</h3>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label>Nome</label><input type="text" id="eaNome" value="${a.nome}"></div>
      <div class="field"><label>Telefone</label><input type="text" id="eaTel" value="${formatPhone(a.telefone)}" maxlength="16"></div>
      <div class="field"><label>Horário / Turma</label><input type="text" id="eaHor" value="${a.horario||""}"></div>
      <div class="field"><label>Valor mensalidade (R$)</label><input type="text" id="eaVal" value="${a.valor||""}"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button class="btn btn-primary" onclick="saveEditAluno('${id}')">Salvar</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    </div>`;
  document.getElementById("eaTel").addEventListener("input",e=>{e.target.value=formatPhone(e.target.value);});
  document.getElementById("modalBackdrop").classList.add("show");
}
async function saveEditAluno(id){
  const a=alunos.find(x=>x.id===id); if(!a)return;
  const changes={
    nome:     document.getElementById("eaNome").value.trim(),
    telefone: normPhone(document.getElementById("eaTel").value),
    horario:  document.getElementById("eaHor").value.trim(),
    valor:    Number(document.getElementById("eaVal").value||0)
  };
  showLoading("Salvando...");
  try{
    await dbUpdateAluno(id,changes);
    Object.assign(a,changes);
    showToast("Aluno atualizado!");
    closeModal(); renderAlunosTable();
  }catch(e){showToast("Erro.",false);console.error(e);}
  hideLoading();
}
function openNovoAlunoModal(){
  document.getElementById("modalContent").innerHTML=`
    <h3 style="margin-bottom:14px">Novo aluno de aula</h3>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label>Nome completo</label><input type="text" id="naNome" placeholder="Nome do aluno"></div>
      <div class="field"><label>Telefone</label><input type="text" id="naTel" placeholder="(49) 9 9999-9999" maxlength="16"></div>
      <div class="field"><label>Horário / Turma</label><input type="text" id="naHor" placeholder="Ex: Ter/Qui 19:00 — Coberta"></div>
      <div class="field"><label>Valor mensalidade (R$)</label><input type="text" id="naVal" placeholder="200.00"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button class="btn btn-primary" onclick="saveNovoAluno()">Adicionar aluno</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    </div>`;
  document.getElementById("naTel").addEventListener("input",e=>{e.target.value=formatPhone(e.target.value);});
  document.getElementById("modalBackdrop").classList.add("show");
}
async function saveNovoAluno(){
  const nome    =document.getElementById("naNome").value.trim();
  const telefone=normPhone(document.getElementById("naTel").value);
  const horario =document.getElementById("naHor").value.trim();
  const valor   =Number(document.getElementById("naVal").value||0);
  if(!nome)              {alert("Informe o nome.");return;}
  if(telefone.length<10) {alert("Informe um telefone válido.");return;}
  showLoading("Salvando...");
  try{
    const saved=await dbAddAluno({nome,telefone,horario,valor,ativo:true,pagamentos:{},created_at:new Date().toISOString()});
    alunos.push(saved);
    showToast("Aluno adicionado!");
    closeModal(); renderAlunosTable();
  }catch(e){showToast("Erro.",false);console.error(e);}
  hideLoading();
}

// ─────────────────────────────────────────
// NAVEGAÇÃO
// ─────────────────────────────────────────
function showScreen(name){
  document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
  document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active"));
  const sc=document.getElementById(`screen-${name}`);
  if(sc)sc.classList.remove("hidden");
  const nb=document.querySelector(`.nav button[data-screen="${name}"]`);
  if(nb)nb.classList.add("active");
  if(name==="cancelar"){renderCancelDays();renderCancelGrid();}
  if(name==="agenda")  renderCalendar();
}


// ════════════════════════════════════════════
//  ADMIN — CALENDÁRIO MENSAL COM PAGAMENTOS
// ════════════════════════════════════════════
let admCalYear  = null;
let admCalMonth = null;
let admCalSelectedDk = null;

function renderAdmCalendar(){
  const now = nowSP();
  if(admCalYear===null)  admCalYear  = now.getFullYear();
  if(admCalMonth===null) admCalMonth = now.getMonth();

  const label = document.getElementById("admCalMonthLabel");
  if(label) label.textContent = `${MONTHS_PT[admCalMonth]} ${admCalYear}`;

  const grid    = document.getElementById("admCalGrid");
  if(!grid) return;
  const todayKey = toDateKey(now);
  const firstDay = new Date(admCalYear, admCalMonth, 1).getDay();
  const daysInM  = new Date(admCalYear, admCalMonth+1, 0).getDate();
  const prevDays = new Date(admCalYear, admCalMonth, 0).getDate();
  const cells    = [];

  for(let i=firstDay-1;i>=0;i--)
    cells.push({dk:toDateKey(new Date(admCalYear,admCalMonth-1,prevDays-i)),num:prevDays-i,other:true});
  for(let d=1;d<=daysInM;d++)
    cells.push({dk:toDateKey(new Date(admCalYear,admCalMonth,d)),num:d,other:false});
  let nx=1;
  while(cells.length%7!==0)
    cells.push({dk:toDateKey(new Date(admCalYear,admCalMonth+1,nx++)),num:nx-1,other:true});

  const isMobile = window.innerWidth<=640;
  const MAX = isMobile ? 0 : 2;

  grid.innerHTML = cells.map(({dk,num,other})=>{
    const evs     = getEventsForDate(dk);
    const isToday = dk===todayKey;
    const isSel   = dk===admCalSelectedDk;

    // Pills com indicador de pagamento para o admin
    const pills = evs.slice(0,MAX).map(({r})=>{
      const pago = r.status_pagamento==="pago";
      const cls  = evClass(r.court, r.tipo);
      return `<div class="cal-event ${cls}" style="position:relative" title="${r.time} · ${r.nome} · ${r.court} · ${pago?'Pago':'Pendente'}">
        <div class="cal-event-dot" style="background:${pago?'#a5d6a7':'#ef9a9a'}"></div>
        ${r.time} ${r.nome}
      </div>`;
    }).join("");

    const more = evs.length>MAX&&!isMobile
      ? `<div class="cal-more">+${evs.length-MAX} mais</div>` : "";

    // Pontos mobile: vermelho=pendente, verde=pago
    const dots = evs.slice(0,5).map(({r})=>{
      const pago = r.status_pagamento==="pago";
      return `<div class="cal-dot" style="background:${pago?'#1e8e3e':'#cf3b2f'}"></div>`;
    }).join("");
    const dotHtml = evs.length ? `<div class="cal-dots">${dots}</div>` : "";

    // Indicador de livres/ocupados
    const totalSlots = TIME_SLOTS.length * COURTS.length;
    const occupied   = evs.length;
    const free       = totalSlots - occupied;

    return `<div class="cal-cell${other?" other-month":""}${isToday?" today":""}${isSel?" cal-selected":""}"
      onclick="admCalSelectDay('${dk}')">
      <div class="cal-day-num">${num}</div>
      ${pills}${more}${dotHtml}
      ${!other&&evs.length>0?`<div style="font-size:.6rem;color:#888;margin-top:2px">${occupied} res · ${free} livres</div>`:""}
    </div>`;
  }).join("");

  if(admCalSelectedDk) renderAdmCalDayDetail(admCalSelectedDk);
}

function admCalSelectDay(dk){
  admCalSelectedDk = dk;
  renderAdmCalendar();
  renderAdmCalDayDetail(dk);
  document.getElementById("admCalDayDetail").classList.remove("hidden");
}

function renderAdmCalDayDetail(dk){
  const evs = getEventsForDate(dk);
  const d   = new Date(dk+"T00:00:00");
  document.getElementById("admCalDetailDate").textContent =
    d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});

  const list = document.getElementById("admCalDetailList");

  // Ocupados — com status de pagamento
  const ocupHtml = evs.length ? evs.map(({r})=>{
    const pago = r.status_pagamento==="pago";
    const msg  = `Olá ${r.nome}! 🎾 Lembrete de pagamento na Winner.\n\n📅 ${formatDateLabel(dk)}\n⏰ ${r.time} — ${r.court}\n💰 ${fmtMoney(r.valor)}\n\nObrigada! 😊`;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;
      border-radius:10px;margin-bottom:6px;background:${pago?"rgba(30,142,62,.12)":"rgba(207,59,47,.08)"};
      border:1px solid ${pago?"#1e8e3e44":"#cf3b2f44"}">
      <div style="flex:1">
        <div style="font-weight:700;font-size:.88rem">${r.time} — ${r.nome}</div>
        <div style="font-size:.75rem;color:#666">${r.court} · ${r.tipo}</div>
      </div>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.78rem;font-weight:700;flex-shrink:0"
        onclick="togglePago('${r.id}');renderAdmCalDayDetail('${dk}');renderAdmCalendar()">
        <div style="width:18px;height:18px;border-radius:4px;border:2px solid ${pago?"#1e8e3e":"#cf3b2f"};
          background:${pago?"#1e8e3e":"transparent"};display:flex;align-items:center;justify-content:center">
          ${pago?`<svg viewBox="0 0 12 12" style="width:10px;height:10px;fill:#fff"><path d="M1 6l3.5 3.5L11 2"/></svg>`:""}
        </div>
        <span style="color:${pago?"#1e8e3e":"#cf3b2f"}">${pago?"Pago":"Pendente"}</span>
      </label>
      ${!pago?`<a href="${waLink(r.telefone,msg)}" target="_blank"
        style="padding:4px 8px;background:#25D366;color:#fff;border-radius:7px;text-decoration:none;font-size:.72rem;font-weight:700;flex-shrink:0">📲</a>`:""}
      <button onclick="openAdmModal('${r.id}','${dk}')"
        style="padding:4px 8px;border:1px solid #ccc;border-radius:7px;background:#fff;cursor:pointer;font-size:.72rem;flex-shrink:0">⋯</button>
    </div>`;
  }).join("")
  : `<div style="color:#777;font-size:.88rem;padding:6px 0">Nenhuma reserva neste dia.</div>`;

  // Livres
  const livres = [];
  for(const time of TIME_SLOTS){
    const livresNaHora = COURTS.filter(c=>!getRes(dk,c,time));
    if(livresNaHora.length) livres.push({time,courts:livresNaHora});
  }

  const livresHtml = livres.slice(0,8).map(({time,courts})=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;
      border-radius:8px;margin-bottom:4px;background:rgba(255,255,255,.55);
      border:1px dashed rgba(45,96,24,.3)">
      <span style="font-size:.78rem;font-weight:800;color:#555;min-width:42px">${time}</span>
      <span style="flex:1;font-size:.78rem;color:#2d6018;font-weight:600">${courts.join(" · ")}</span>
      <button onclick="openAdmNewResDay('${dk}','${time}')"
        style="padding:3px 9px;border:1px solid #2d6018;border-radius:6px;
        background:transparent;color:#2d6018;cursor:pointer;font-size:.72rem;font-weight:700">+ Add</button>
    </div>`).join("");

  list.innerHTML=`
    <div style="font-size:.75rem;font-weight:800;color:#333;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
      Reservas (${evs.length})
    </div>
    ${ocupHtml}
    <div style="font-size:.75rem;font-weight:800;color:#2d6018;text-transform:uppercase;letter-spacing:.06em;margin:12px 0 8px">
      🟢 Disponíveis
    </div>
    ${livresHtml||'<div style="color:#777;font-size:.85rem">Todos os horários ocupados.</div>'}`;
}

function openAdmNewResDay(dk, time){
  // Abre modal de nova reserva já com dia e hora
  admSelectedDate = dk;
  document.getElementById("modalContent").innerHTML=`
    <h3 style="margin-bottom:12px">Nova reserva</h3>
    <p style="color:#555;margin-bottom:16px">${formatDateLabel(dk)} · ${time}</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label>Nome completo</label><input type="text" id="mdNome" placeholder="Nome do cliente"></div>
      <div class="field"><label>Telefone</label><input type="text" id="mdTel" placeholder="(49) 9 9999-9999" maxlength="16"></div>
      <div class="field"><label>Quadra</label>
        <select id="mdCourt">
          ${COURTS.filter(c=>!getRes(dk,c,time)).map(c=>`<option value="${c}">${c}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Tipo</label>
        <select id="mdTipo"><option value="avulso">Avulso</option><option value="fixo">Fixo (semanal)</option></select>
      </div>
      <div class="field"><label>Valor (R$)</label><input type="text" id="mdValor" value="60.00"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button class="btn btn-primary" onclick="saveAdmNewRes('${dk}',''+document.getElementById('mdCourt').value,'${time}')">Salvar</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    </div>`;
  document.getElementById("mdTel").addEventListener("input",e=>{e.target.value=formatPhone(e.target.value);});
  document.getElementById("modalBackdrop").classList.add("show");
}

function openAdmNewResFromCal(){
  if(admCalSelectedDk) openAdmNewResDay(admCalSelectedDk, "08:00");
}

function closeAdmCalDetail(){
  admCalSelectedDk = null;
  document.getElementById("admCalDayDetail").classList.add("hidden");
  renderAdmCalendar();
}
function closeAdmGrid(){
  document.getElementById("admGridSection").classList.add("hidden");
}


// ════════════════════════════════════════════
//  HORÁRIOS FIXOS — importação pela Maria
// ════════════════════════════════════════════
const HORARIOS_FIXOS = [
  // SEGUNDA
  {nome:"Julia",  weekday:1, time:"18:00", court:"Quadra 3"},
  {nome:"Thaís",  weekday:1, time:"19:00", court:"Quadra 3"},
  {nome:"Susana", weekday:1, time:"20:00", court:"Quadra 3"},
  // TERÇA
  {nome:"Maira",  weekday:2, time:"18:00", court:"Quadra 3"},
  {nome:"Fran",   weekday:2, time:"19:00", court:"Quadra 3"},
  {nome:"Daia",   weekday:2, time:"20:00", court:"Quadra 3"},
  // QUARTA
  {nome:"Susi",   weekday:3, time:"18:00", court:"Quadra 3"},
  {nome:"Borsoi", weekday:3, time:"19:00", court:"Quadra 3"},
  {nome:"Juli",   weekday:3, time:"20:00", court:"Quadra 3"},
  // QUINTA
  {nome:"Gabriel",weekday:4, time:"17:00", court:"Quadra 3"},
  {nome:"Gerusa", weekday:4, time:"19:00", court:"Quadra 3"},
  {nome:"Esthé",  weekday:4, time:"19:00", court:"Quadra 2"},
  {nome:"Gerusa", weekday:4, time:"20:00", court:"Quadra 3"},
  {nome:"Daia",   weekday:4, time:"20:00", court:"Quadra 2"},
  // SEXTA
  {nome:"Paola",  weekday:5, time:"19:00", court:"Quadra 3"},
  // SÁBADO
  {nome:"Janda",  weekday:6, time:"08:00", court:"Coberta"},
  {nome:"Pri",    weekday:6, time:"17:00", court:"Quadra 3"},
  {nome:"Borsoi", weekday:6, time:"18:00", court:"Quadra 2"},
  {nome:"Luan",   weekday:6, time:"18:00", court:"Quadra 3"},
  // DOMINGO
  {nome:"Borsoi", weekday:0, time:"17:00", court:"Quadra 3"},
  {nome:"Borsoi", weekday:0, time:"18:00", court:"Quadra 2"},
  {nome:"Tália",  weekday:0, time:"18:00", court:"Quadra 3"},
];

function openImportFixosModal() {
  const dias = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const lista = HORARIOS_FIXOS.map(h=>
    `<div style="padding:5px 0;border-bottom:1px solid #eee;font-size:.85rem">
      <strong>${dias[h.weekday]}</strong> ${h.time} — ${h.nome} — ${h.court}
    </div>`
  ).join("");

  document.getElementById("modalContent").innerHTML=`
    <h3 style="margin-bottom:8px">Importar horários fixos</h3>
    <p style="font-size:.85rem;color:#555;margin-bottom:14px">
      Serão cadastrados <strong>${HORARIOS_FIXOS.length} horários fixos</strong> na agenda.<br>
      Depois você pode remover qualquer um pelo painel Admin → Agenda → ⋯ opções.
    </p>
    <div style="max-height:320px;overflow-y:auto;border:1px solid #eee;border-radius:10px;padding:8px 12px;margin-bottom:16px">
      ${lista}
    </div>
    <div style="background:#fff3e0;border-radius:8px;padding:10px 12px;font-size:.82rem;color:#e65100;margin-bottom:16px">
      ⚠️ Se já importou antes, vai duplicar. Verifique a agenda antes de importar.
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="doImportFixos()">✅ Importar tudo</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
}

async function doImportFixos() {
  showLoading("Importando horários fixos...");
  const hoje = toDateKey(new Date());
  let ok = 0, err = 0;

  for (const h of HORARIOS_FIXOS) {
    try {
      const newR = {
        tipo:             "fixo",
        time:             h.time,
        court:            h.court,
        nome:             h.nome,
        telefone:         "",
        valor:            60,
        status_pagamento: "pendente",
        date:             null,
        weekday:          h.weekday,
        start_date:       hoje,
        exceptions:       [],
        created_at:       new Date().toISOString()
      };
      const saved = await dbAddRes(newR);
      reservations.push(saved);
      ok++;
    } catch(e) {
      console.error("Erro ao importar", h.nome, e);
      err++;
    }
  }

  hideLoading();
  closeModal();
  renderAll();

  if(err===0) {
    showToast(`✅ ${ok} horários fixos importados com sucesso!`);
  } else {
    showToast(`⚠️ ${ok} importados, ${err} com erro.`, false);
  }
}


// ─────────────────────────────────────────
// MATTER.JS
// ─────────────────────────────────────────
function initMatter(){
  const canvas=document.getElementById("matter-bg");
  if(!canvas||!window.Matter)return;
  const{Engine,Render,Runner,World,Bodies,Mouse,MouseConstraint,Events}=Matter;
  const engine=Engine.create(),world=engine.world;
  const render=Render.create({canvas,engine,options:{width:window.innerWidth,height:window.innerHeight,wireframes:false,background:"transparent"}});
  const W=window.innerWidth,H=window.innerHeight;
  World.add(world,[
    Bodies.rectangle(W/2,-20,W,40,{isStatic:true,render:{fillStyle:"transparent"}}),
    Bodies.rectangle(W/2,H+20,W,40,{isStatic:true,render:{fillStyle:"transparent"}}),
    Bodies.rectangle(-20,H/2,40,H,{isStatic:true,render:{fillStyle:"transparent"}}),
    Bodies.rectangle(W+20,H/2,40,H,{isStatic:true,render:{fillStyle:"transparent"}}),
  ]);
  const balls=Array.from({length:10},()=>
    Bodies.circle(Math.random()*W,Math.random()*H,18,{restitution:.9,friction:.001,frictionAir:.003,
      render:{fillStyle:"#c8e63a",strokeStyle:"#94ac22",lineWidth:2}})
  );
  World.add(world,balls);
  const mc=MouseConstraint.create(engine,{mouse:Mouse.create(render.canvas),constraint:{stiffness:.2,render:{visible:false}}});
  World.add(world,mc);render.mouse=mc.mouse;
  Events.on(render,"afterRender",()=>{
    const ctx=render.context;
    balls.forEach(b=>{
      ctx.save();ctx.translate(b.position.x,b.position.y);ctx.rotate(b.angle);
      ctx.strokeStyle="#fff";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,b.circleRadius*.72,.4,2.7);ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,b.circleRadius*.72,3.55,5.85);ctx.stroke();
      ctx.restore();
    });
  });
  Runner.run(engine);Render.run(render);
  window.addEventListener("resize",()=>{
    render.canvas.width=window.innerWidth;render.canvas.height=window.innerHeight;renderAll();
  });
}

// ─────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────
document.querySelectorAll(".nav button").forEach(btn=>{
  btn.addEventListener("click",()=>showScreen(btn.dataset.screen));
});
document.getElementById("calPrevBtn").addEventListener("click",()=>{
  calMonth--;if(calMonth<0){calMonth=11;calYear--;}calSelectedDk=null;renderCalendar();
});
document.getElementById("calNextBtn").addEventListener("click",()=>{
  calMonth++;if(calMonth>11){calMonth=0;calYear++;}calSelectedDk=null;renderCalendar();
});
document.getElementById("calTodayBtn").addEventListener("click",()=>{
  const n=nowSP();calYear=n.getFullYear();calMonth=n.getMonth();calSelectedDk=null;renderCalendar();
});

// Admin calendar nav
document.addEventListener("click", e=>{
  if(e.target.id==="admCalPrevBtn"){
    admCalMonth--;if(admCalMonth<0){admCalMonth=11;admCalYear--;}admCalSelectedDk=null;renderAdmCalendar();
  }
  if(e.target.id==="admCalNextBtn"){
    admCalMonth++;if(admCalMonth>11){admCalMonth=0;admCalYear++;}admCalSelectedDk=null;renderAdmCalendar();
  }
  if(e.target.id==="admCalTodayBtn"){
    const n=nowSP();admCalYear=n.getFullYear();admCalMonth=n.getMonth();admCalSelectedDk=null;renderAdmCalendar();
  }
});
document.getElementById("backToAgendaBtn").addEventListener("click",()=>showScreen("agenda"));
document.getElementById("clearReserveBtn").addEventListener("click",clearResForm);
document.getElementById("confirmReserveBtn").addEventListener("click",confirmReservation);
document.getElementById("resTelefone").addEventListener("input",e=>{e.target.value=formatPhone(e.target.value);});
document.getElementById("adminLoginBtn").addEventListener("click",doAdminLogin);
document.getElementById("adminPass").addEventListener("keydown",e=>{if(e.key==="Enter")doAdminLogin();});
document.getElementById("adminLogoutBtn").addEventListener("click",doAdminLogout);
document.querySelectorAll(".admin-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".admin-tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".admin-tab-content").forEach(c=>c.classList.add("hidden"));
    document.getElementById(`admin-tab-${btn.dataset.adminTab}`).classList.remove("hidden");
    if(btn.dataset.adminTab==="agenda")    {renderAdmCalendar();renderAdmDays();renderAdmSchedule();}
    if(btn.dataset.adminTab==="pagamentos") renderPayTable();
    if(btn.dataset.adminTab==="alunos")     renderAlunosTable();
  });
});
document.getElementById("modalBackdrop").addEventListener("click",e=>{
  if(e.target.id==="modalBackdrop")closeModal();
});

// ── BOOT ──────────────────────────────────
(async()=>{
  const n=nowSP();
  calYear=n.getFullYear(); calMonth=n.getMonth();
  admSelectedDate    =toDateKey(getWeekDates(0)[0]);
  cancelSelectedDate =toDateKey(getWeekDates(0)[0]);

  showLoading("Carregando agenda...");
  try{ await loadReservations(); }catch(e){console.error("Erro ao carregar reservas:",e);}
  hideLoading();

  initMatter();
  renderAll();
})();