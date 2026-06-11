/* =====================================================
   QUINIELA ///26 — lógica principal
   ===================================================== */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
const TS = firebase.firestore.Timestamp;

const HORA_LIMITE_MS = 60 * 60 * 1000; // 1 hora antes del partido

// -------- estado global --------
const E = {
  user: null,
  esAdmin: false,
  partidos: [],          // [{id, fase, grupo, local, visita, kickoff(Date), sede, resultado}]
  misPreds: {},          // matchId -> {home, away, confirmed}
  usuarios: {},          // uid -> nombre
  config: null,
  filtroFase: "TODOS",
  filtroDia: "TODOS",
  posAmbito: "GENERAL",  // GENERAL | GRUPO | DIA
  posValor: null,
};

const CONFIG_DEFAULT = {
  ptsExacto: 5, ptsDiferencia: 3, ptsGanador: 2,
  ptsCampeon: 10, ptsSubcampeon: 6, ptsTercero: 4,
  podiumDeadline: null, real1: "", real2: "", real3: ""
};

// -------- helpers DOM --------
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function msg(el, texto, tipo = "") {
  el.textContent = texto;
  el.className = "msg " + tipo;
  el.classList.remove("oculto");
  if (tipo === "ok") setTimeout(() => el.classList.add("oculto"), 5000);
}

function fmtDia(d) {
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}
function fmtHora(d) {
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function claveDia(d) {
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function deadlineDe(p) { return new Date(p.kickoff.getTime() - HORA_LIMITE_MS); }

// =====================================================
//  AUTH
// =====================================================
auth.onAuthStateChanged(async (user) => {
  E.user = user;
  if (!user) {
    $("#vista-app").classList.add("oculto");
    $("#vista-login").classList.remove("oculto");
    $("#cargando").classList.add("oculto");
    return;
  }
  $("#vista-login").classList.add("oculto");
  try {
    const adm = await db.collection("admins").doc(user.uid).get();
    E.esAdmin = adm.exists;
  } catch (e) { E.esAdmin = false; }

  await Promise.all([cargarConfig(), cargarUsuarios(), cargarPartidos(), cargarMisPredicciones()]);

  $("#hola-usuario").textContent = "Hola, " + (E.usuarios[user.uid] || user.email);
  $("#tab-admin").classList.toggle("oculto", !E.esAdmin);
  if (E.esAdmin && typeof initAdmin === "function") initAdmin();

  renderPartidos();
  renderPosiciones();
  renderPodio();

  $("#vista-app").classList.remove("oculto");
  $("#cargando").classList.add("oculto");
});

$("#form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("#login-error");
  err.classList.add("oculto");
  try {
    await auth.signInWithEmailAndPassword($("#login-email").value.trim(), $("#login-pass").value);
  } catch (e) {
    err.textContent = "No pudimos iniciar sesión. Revisa tu correo y contraseña.";
    err.classList.remove("oculto");
  }
});

$("#btn-olvide").addEventListener("click", async () => {
  const email = $("#login-email").value.trim();
  const err = $("#login-error");
  if (!email) { err.textContent = "Escribe tu correo arriba y vuelve a dar clic."; err.classList.remove("oculto"); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    err.textContent = "Listo: te mandamos un correo para restablecer tu contraseña.";
    err.classList.remove("oculto");
  } catch (e) {
    err.textContent = "No se pudo enviar el correo de recuperación.";
    err.classList.remove("oculto");
  }
});

$("#btn-salir").addEventListener("click", () => auth.signOut());

// =====================================================
//  CARGA DE DATOS
// =====================================================
async function cargarConfig() {
  try {
    const snap = await db.collection("config").doc("general").get();
    E.config = snap.exists ? { ...CONFIG_DEFAULT, ...snap.data() } : { ...CONFIG_DEFAULT };
  } catch (e) { E.config = { ...CONFIG_DEFAULT }; }
  // pinta los puntos en la leyenda
  $("#pts-exacto").textContent = E.config.ptsExacto;
  $("#pts-diff").textContent = E.config.ptsDiferencia;
  $("#pts-ganador").textContent = E.config.ptsGanador;
  $("#pts-campeon").textContent = E.config.ptsCampeon;
  $("#pts-sub").textContent = E.config.ptsSubcampeon;
  $("#pts-tercero").textContent = E.config.ptsTercero;
}

async function cargarUsuarios() {
  const snap = await db.collection("users").get();
  E.usuarios = {};
  snap.forEach(d => { E.usuarios[d.id] = d.data().nombre || d.data().email || d.id; });
}

async function cargarPartidos() {
  const snap = await db.collection("matches").orderBy("kickoff").get();
  E.partidos = snap.docs.map(d => {
    const x = d.data();
    return {
      id: d.id, fase: x.fase || "GRUPOS", grupo: x.grupo || "",
      local: x.local, visita: x.visita,
      kickoff: x.kickoff.toDate(), sede: x.sede || "",
      resultado: x.resultado || null
    };
  });
}

async function cargarMisPredicciones() {
  const snap = await db.collection("predictions").where("uid", "==", E.user.uid).get();
  E.misPreds = {};
  snap.forEach(d => {
    const x = d.data();
    E.misPreds[x.matchId] = { home: x.home, away: x.away, confirmed: !!x.confirmed };
  });
}

// =====================================================
//  TABS
// =====================================================
$("#tabs-nav").addEventListener("click", (ev) => {
  const btn = ev.target.closest(".tab");
  if (!btn) return;
  $$(".tab").forEach(t => t.classList.remove("activo"));
  btn.classList.add("activo");
  ["partidos","posiciones","podio","admin"].forEach(p => $("#panel-"+p).classList.add("oculto"));
  $("#panel-" + btn.dataset.tab).classList.remove("oculto");
  if (btn.dataset.tab === "posiciones") renderPosiciones();
  if (btn.dataset.tab === "podio") renderPodio();
  if (btn.dataset.tab === "admin" && typeof renderAdmin === "function") renderAdmin();
});

// =====================================================
//  PARTIDOS
// =====================================================
function renderFiltrosPartidos() {
  // fases / grupos
  const fases = ["TODOS", ...GRUPOS.map(g => "G" + g)];
  const hayElim = E.partidos.some(p => p.fase !== "GRUPOS");
  if (hayElim) fases.push("ELIM");
  $("#chips-fase").innerHTML = fases.map(f => {
    const lbl = f === "TODOS" ? "Todos" : f === "ELIM" ? "Eliminatorias" : "Grupo " + f.slice(1);
    return `<button class="chip ${E.filtroFase===f?'activo':''}" data-f="${f}">${lbl}</button>`;
  }).join("");

  // días
  const dias = [...new Set(E.partidos.map(p => claveDia(p.kickoff)))];
  const hoy = claveDia(new Date());
  $("#chips-dias").innerHTML =
    `<button class="chip ${E.filtroDia==='TODOS'?'activo':''}" data-d="TODOS">Todos los días</button>` +
    dias.map(d => {
      const f = new Date(d + "T12:00:00");
      const lbl = (d === hoy ? "HOY · " : "") + f.toLocaleDateString("es-MX", { day:"numeric", month:"short" });
      return `<button class="chip ${E.filtroDia===d?'activo':''}" data-d="${d}">${lbl}</button>`;
    }).join("");
}

$("#chips-fase").addEventListener("click", ev => {
  const c = ev.target.closest(".chip"); if (!c) return;
  E.filtroFase = c.dataset.f; renderPartidos();
});
$("#chips-dias").addEventListener("click", ev => {
  const c = ev.target.closest(".chip"); if (!c) return;
  E.filtroDia = c.dataset.d; renderPartidos();
});

function partidosFiltrados() {
  return E.partidos.filter(p => {
    if (E.filtroFase !== "TODOS") {
      if (E.filtroFase === "ELIM" && p.fase === "GRUPOS") return false;
      if (E.filtroFase.startsWith("G") && E.filtroFase !== "ELIM" &&
          (p.fase !== "GRUPOS" || p.grupo !== E.filtroFase.slice(1))) return false;
    }
    if (E.filtroDia !== "TODOS" && claveDia(p.kickoff) !== E.filtroDia) return false;
    return true;
  });
}

function renderPartidos() {
  renderFiltrosPartidos();
  const cont = $("#lista-partidos");
  const lista = partidosFiltrados();
  if (!lista.length) {
    cont.innerHTML = `<p class="vacio">No hay partidos con este filtro. ${E.esAdmin ? "Agrégalos en la pestaña Admin." : ""}</p>`;
    return;
  }
  let html = "", diaActual = "";
  for (const p of lista) {
    const d = claveDia(p.kickoff);
    if (d !== diaActual) {
      diaActual = d;
      html += `<div class="dia-encabezado">${fmtDia(p.kickoff)}</div>`;
    }
    html += tarjetaPartido(p);
  }
  cont.innerHTML = html;
}

function tarjetaPartido(p) {
  const ahora = new Date();
  const dl = deadlineDe(p);
  const cerrado = ahora >= dl;
  const mi = E.misPreds[p.id];
  const etiqueta = p.fase === "GRUPOS" ? "GRUPO " + p.grupo : (FASES[p.fase] || p.fase).toUpperCase();

  let centro, estado, pie = "";

  if (p.resultado) {
    centro = `<div class="marcador-final">${p.resultado.home} – ${p.resultado.away}</div><span class="hora-partido">Final</span>`;
  } else if (cerrado) {
    centro = `<div class="marcador-final">·</div><span class="hora-partido">${fmtHora(p.kickoff)} h</span>`;
  } else if (mi && mi.confirmed) {
    centro = `<div class="marcador-final">${mi.home} – ${mi.away}</div><span class="hora-partido">${fmtHora(p.kickoff)} h</span>`;
  } else {
    centro = `
      <div class="marcador-inputs">
        <input type="number" min="0" max="20" inputmode="numeric" id="h-${p.id}" value="${mi ? mi.home : ""}" aria-label="Goles ${nombreEquipo(p.local)}">
        <span class="vs">vs</span>
        <input type="number" min="0" max="20" inputmode="numeric" id="a-${p.id}" value="${mi ? mi.away : ""}" aria-label="Goles ${nombreEquipo(p.visita)}">
      </div>
      <span class="hora-partido">${fmtHora(p.kickoff)} h · cierra ${fmtHora(dl)}</span>`;
  }

  // estado + acciones
  if (!cerrado && (!mi || !mi.confirmed)) {
    estado = mi ? `<span class="estado borrador">Borrador guardado</span>` : `<span class="estado abierto">Abierto</span>`;
    pie = `
      <div>${estado}</div>
      <div class="acciones" style="margin:0">
        <button class="btn btn-fantasma btn-chico" data-accion="guardar" data-id="${p.id}">Guardar</button>
        <button class="btn btn-primario btn-chico" data-accion="confirmar" data-id="${p.id}">Confirmar</button>
      </div>`;
  } else if (!cerrado && mi && mi.confirmed) {
    pie = `<span class="estado confirmado">✓ Confirmada — ya no se puede cambiar</span>`;
  } else {
    // cerrado o con resultado
    const miTxt = mi ? `Mi pick: <b>${mi.home}–${mi.away}</b>${mi.confirmed ? "" : " (sin confirmar)"}` : "No pusiste predicción 😬";
    let pts = "";
    if (p.resultado && mi) {
      const g = puntosPartido(mi, p.resultado);
      pts = `<span class="pts-ganados">+${g} pts</span>`;
    }
    pie = `
      <span class="mi-pick">${miTxt}</span>
      ${pts}
      <button class="btn btn-fantasma btn-chico" data-accion="picks" data-id="${p.id}">Ver picks de todos</button>`;
  }

  return `
  <article class="partido" id="card-${p.id}">
    <div class="partido-top">
      <span class="etiqueta-grupo">${etiqueta}</span>
      <span>${esc(p.sede)}</span>
    </div>
    <div class="partido-cuerpo">
      <div class="equipo"><span class="bandera">${banderaEquipo(p.local)}</span><span class="equipo-nombre">${nombreEquipo(p.local)}</span></div>
      <div class="centro">${centro}</div>
      <div class="equipo visita"><span class="bandera">${banderaEquipo(p.visita)}</span><span class="equipo-nombre">${nombreEquipo(p.visita)}</span></div>
    </div>
    <div class="partido-pie">${pie}</div>
    <div class="picks-todos oculto" id="picks-${p.id}"></div>
  </article>`;
}

$("#lista-partidos").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-accion]");
  if (!btn) return;
  const id = btn.dataset.id;
  const accion = btn.dataset.accion;
  if (accion === "picks") return verPicks(id, btn);
  // guardar / confirmar
  const h = parseInt($(`#h-${id}`)?.value, 10);
  const a = parseInt($(`#a-${id}`)?.value, 10);
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { alert("Pon un marcador válido en ambos lados."); return; }
  const confirmar = accion === "confirmar";
  if (confirmar && !confirm(`¿Confirmar ${h}–${a}? Una vez confirmada YA NO se puede modificar.`)) return;
  btn.disabled = true;
  try {
    await db.collection("predictions").doc(`${E.user.uid}_${id}`).set({
      uid: E.user.uid, matchId: id, home: h, away: a,
      confirmed: confirmar,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    E.misPreds[id] = { home: h, away: a, confirmed: confirmar };
    renderPartidos();
  } catch (e) {
    alert("No se pudo guardar. Si el partido ya cerró (1 h antes del inicio) o ya habías confirmado, la predicción queda bloqueada.");
    btn.disabled = false;
  }
});

// --- ver picks de todos (con caché local para cuidar el tier gratis) ---
async function verPicks(matchId, btn) {
  const cont = $("#picks-" + matchId);
  if (!cont.classList.contains("oculto")) { cont.classList.add("oculto"); return; }
  btn.disabled = true;
  try {
    const preds = await obtenerPredicciones(matchId);
    const p = E.partidos.find(x => x.id === matchId);
    if (!preds.length) {
      cont.innerHTML = `<span class="nota">Nadie puso predicción para este partido.</span>`;
    } else {
      cont.innerHTML = preds
        .sort((x,y) => (E.usuarios[x.uid]||"").localeCompare(E.usuarios[y.uid]||""))
        .map(x => {
          const pts = p.resultado ? `<span class="p">+${puntosPartido(x, p.resultado)}</span>` : "";
          return `<div class="pick-item"><span>${esc(E.usuarios[x.uid] || "??")}</span><span><b>${x.home}–${x.away}</b> ${pts}</span></div>`;
        }).join("");
    }
    cont.classList.remove("oculto");
  } catch (e) {
    cont.innerHTML = `<span class="nota">Los picks de los demás se liberan cuando cierra el partido (1 h antes del inicio).</span>`;
    cont.classList.remove("oculto");
  }
  btn.disabled = false;
}

async function obtenerPredicciones(matchId) {
  const p = E.partidos.find(x => x.id === matchId);
  const llave = "preds26b_" + matchId;
  // partido con resultado → sus predicciones ya no cambian → caché permanente
  if (p && p.resultado) {
    const c = localStorage.getItem(llave);
    if (c) { try { return JSON.parse(c); } catch (e) {} }
  }
  const uids = Object.keys(E.usuarios);
  const lecturas = await Promise.allSettled(
    uids.map(u => db.collection("predictions").doc(u + "_" + matchId).get())
  );
  const arr = [];
  lecturas.forEach(r => {
    if (r.status === "fulfilled" && r.value.exists) {
      const x = r.value.data();
      arr.push({ uid: x.uid, home: x.home, away: x.away });
    }
  });
  if (p && p.resultado && arr.length) { try { localStorage.setItem(llave, JSON.stringify(arr)); } catch (e) {} }
  return arr;
}

// =====================================================
//  PUNTOS
// =====================================================
function puntosPartido(pred, res) {
  const c = E.config;
  if (pred.home === res.home && pred.away === res.away) return c.ptsExacto;
  const sg = Math.sign(pred.home - pred.away), sr = Math.sign(res.home - res.away);
  if (sg !== sr) return 0;
  if (sg !== 0 && (pred.home - pred.away) === (res.home - res.away)) return c.ptsDiferencia;
  return c.ptsGanador;
}

// =====================================================
//  POSICIONES
// =====================================================

async function renderPosiciones() {
  const cont = $("#tabla-posiciones");
  cont.innerHTML = `<p class="vacio">Calculando…</p>`;

  const conResultado = E.partidos.filter(p => p.resultado);
  const puntos = {}, aciertos = {};
  Object.keys(E.usuarios).forEach(u => { puntos[u] = 0; aciertos[u] = 0; });

  for (const p of conResultado) {
    let preds = [];
    try { preds = await obtenerPredicciones(p.id); } catch (e) { console.error(p.id, e); }
    for (const pr of preds) {
      const g = puntosPartido(pr, p.resultado);
      puntos[pr.uid] = (puntos[pr.uid] || 0) + g;
      if (g > 0) aciertos[pr.uid] = (aciertos[pr.uid] || 0) + 1;
    }
  }

  // puntos del podio (cuando el admin capture el podio real)
  if (E.config.real1) {
    try {
      const snap = await db.collection("podium").get();
      snap.forEach(d => {
        const x = d.data(); let g = 0;
        if (x.p1 === E.config.real1) g += E.config.ptsCampeon;
        if (x.p2 === E.config.real2) g += E.config.ptsSubcampeon;
        if (x.p3 === E.config.real3) g += E.config.ptsTercero;
        puntos[d.id] = (puntos[d.id] || 0) + g;
      });
    } catch (e) {}
  }

  const filas = Object.keys(E.usuarios)
    .map(u => ({ uid: u, nombre: E.usuarios[u], pts: puntos[u] || 0, ok: aciertos[u] || 0 }))
    .sort((a, b) => b.pts - a.pts || a.nombre.localeCompare(b.nombre));

  cont.innerHTML = `
  <table class="tabla">
    <thead><tr><th class="pos">#</th><th>Participante</th><th class="num">Aciertos</th><th class="num">Puntos</th></tr></thead>
    <tbody>
      ${filas.map((f, i) => `
        <tr class="${i === 0 && f.pts > 0 ? 'lider' : ''} ${f.uid === E.user.uid ? 'yo' : ''}">
          <td class="pos">${i + 1}</td><td>${esc(f.nombre)}</td>
          <td class="num">${f.ok}</td><td class="num">${f.pts}</td>
        </tr>`).join("")}
    </tbody>
  </table>
  ${conResultado.length ? "" : `<p class="nota" style="margin-top:8px">Aún no hay resultados capturados; la tabla arranca cuando registres el primero.</p>`}`;
}

// =====================================================
//  PODIO
// =====================================================
function llenarSelectEquipos(sel, conVacio = true) {
  const ops = Object.keys(EQUIPOS).filter(c => c !== "TBD")
    .sort((a,b) => EQUIPOS[a].n.localeCompare(EQUIPOS[b].n))
    .map(c => `<option value="${c}">${EQUIPOS[c].f} ${EQUIPOS[c].n}</option>`).join("");
  sel.innerHTML = (conVacio ? `<option value="">— elige —</option>` : "") + ops;
}

let podioInicializado = false;
async function renderPodio() {
  if (!podioInicializado) {
    ["#podio-1","#podio-2","#podio-3"].forEach(s => llenarSelectEquipos($(s)));
    podioInicializado = true;
  }
  const dl = E.config.podiumDeadline ? E.config.podiumDeadline.toDate() : null;
  const cerrado = dl ? new Date() >= dl : false;
  $("#podio-deadline-txt").textContent = dl
    ? (cerrado ? "El podio ya cerró. ¡Suerte!" : `Puedes confirmar tu podio hasta el ${fmtDia(dl)} a las ${fmtHora(dl)} h.`)
    : "El admin todavía no define la fecha límite del podio.";

  // mi podio
  let mio = null;
  try {
    const snap = await db.collection("podium").doc(E.user.uid).get();
    if (snap.exists) mio = snap.data();
  } catch (e) {}
  if (mio) { $("#podio-1").value = mio.p1 || ""; $("#podio-2").value = mio.p2 || ""; $("#podio-3").value = mio.p3 || ""; }

  const bloqueado = cerrado || (mio && mio.confirmed);
  ["#podio-1","#podio-2","#podio-3"].forEach(s => $(s).disabled = bloqueado);
  $("#btn-podio-guardar").disabled = bloqueado;
  $("#btn-podio-confirmar").disabled = bloqueado;
  if (mio && mio.confirmed) msg($("#podio-msg"), "✓ Tu podio está confirmado y bloqueado.", "ok");

  // podios de todos (cuando cierra)
  if (cerrado) {
    try {
      const snap = await db.collection("podium").get();
      const filas = [];
      snap.forEach(d => {
        const x = d.data();
        filas.push(`<div class="podio-fila">
          <span>${esc(E.usuarios[d.id] || "??")}</span>
          <span>🥇 ${banderaEquipo(x.p1)} ${nombreEquipo(x.p1)} · 🥈 ${banderaEquipo(x.p2)} ${nombreEquipo(x.p2)} · 🥉 ${banderaEquipo(x.p3)} ${nombreEquipo(x.p3)}</span>
        </div>`);
      });
      $("#podio-todos").innerHTML = filas.join("") || `<p class="vacio">Nadie alcanzó a poner podio.</p>`;
      $("#podio-todos-card").classList.remove("oculto");
    } catch (e) {}
  }
}

async function guardarPodio(confirmar) {
  const p1 = $("#podio-1").value, p2 = $("#podio-2").value, p3 = $("#podio-3").value;
  const m = $("#podio-msg");
  if (!p1 || !p2 || !p3) return msg(m, "Elige los tres lugares.", "error");
  if (new Set([p1,p2,p3]).size !== 3) return msg(m, "No puedes repetir equipos.", "error");
  if (confirmar && !confirm("¿Confirmar tu podio? Ya no podrás cambiarlo.")) return;
  try {
    await db.collection("podium").doc(E.user.uid).set({
      p1, p2, p3, confirmed: confirmar,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    msg(m, confirmar ? "✓ Podio confirmado." : "Borrador guardado.", "ok");
    if (confirmar) renderPodio();
  } catch (e) {
    msg(m, "No se pudo guardar: el podio ya cerró o ya estaba confirmado.", "error");
  }
}
$("#btn-podio-guardar").addEventListener("click", () => guardarPodio(false));
$("#btn-podio-confirmar").addEventListener("click", () => guardarPodio(true));
