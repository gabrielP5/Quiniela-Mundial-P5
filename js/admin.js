/* =====================================================
   QUINIELA ///26 — panel de administración
   ===================================================== */
let adminListo = false;
let editandoPartido = null;

function initAdmin() {
  if (adminListo) return;
  adminListo = true;

  // selects de equipos y grupos
  llenarSelectEquipos($("#adm-local"), false);
  llenarSelectEquipos($("#adm-visita"), false);
  $("#adm-local").insertAdjacentHTML("afterbegin", `<option value="TBD">❔ Por definir</option>`);
  $("#adm-visita").insertAdjacentHTML("afterbegin", `<option value="TBD">❔ Por definir</option>`);
  $("#adm-grupo").innerHTML = `<option value="">—</option>` + GRUPOS.map(g => `<option>${g}</option>`).join("");
  ["#cfg-real-1","#cfg-real-2","#cfg-real-3"].forEach(s => llenarSelectEquipos($(s)));

  // autollenar grupo al elegir equipos
  $("#adm-local").addEventListener("change", () => {
    const g = (EQUIPOS[$("#adm-local").value] || {}).g;
    if (g && $("#adm-fase").value === "GRUPOS") $("#adm-grupo").value = g;
  });

  $("#btn-crear-usuario").addEventListener("click", crearUsuario);
  $("#btn-guardar-partido").addEventListener("click", guardarPartido);
  $("#btn-cancelar-edicion").addEventListener("click", () => { editandoPartido = null; limpiarFormPartido(); });
  $("#btn-importar").addEventListener("click", importarPartidos);
  $("#btn-guardar-config").addEventListener("click", guardarConfig);

  $("#adm-lista-partidos").addEventListener("click", clickListaPartidos);
  $("#adm-resultados").addEventListener("click", clickResultados);

  renderAdmin();
}

function renderAdmin() {
  if (!E.esAdmin) return;
  renderAdmPartidos();
  renderAdmResultados();
  cargarConfigEnForm();
}

/* ---------- crear usuario ---------- */
function generarPassword() {
  const palabras = ["GOL","TRI","COPA","CRACK","GOLAZO","FUT","MUNDIAL","PORTERO","TIKI","TACA"];
  const sym = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  let suf = "";
  for (let i = 0; i < 5; i++) suf += sym[Math.floor(Math.random() * sym.length)];
  return palabras[Math.floor(Math.random() * palabras.length)] + "-26-" + suf;
}

async function crearUsuario() {
  const nombre = $("#adm-nombre").value.trim();
  const email = $("#adm-email").value.trim();
  const out = $("#adm-usuario-result");
  if (!nombre || !email) { out.innerHTML = "Pon nombre y correo."; out.classList.remove("oculto"); return; }

  const pass = generarPassword();
  // app secundaria para no tumbar la sesión del admin
  const nombreApp = "secundaria-" + Date.now();
  const appSec = firebase.initializeApp(FIREBASE_CONFIG, nombreApp);
  try {
    const cred = await appSec.auth().createUserWithEmailAndPassword(email, pass);
    const uid = cred.user.uid;
    await appSec.auth().signOut();
    await db.collection("users").doc(uid).set({ nombre, email, creadoEn: firebase.firestore.FieldValue.serverTimestamp() });
    E.usuarios[uid] = nombre;
    out.innerHTML = `✅ Usuario creado.<br>
      <b>${esc(nombre)}</b> — ${esc(email)}<br>
      Contraseña: <code>${pass}</code><br>
      <span class="nota">Cópiala y mándasela; no se vuelve a mostrar. Si la pierde, puede usar “Olvidé mi contraseña”.</span>`;
    out.classList.remove("oculto");
    $("#adm-nombre").value = ""; $("#adm-email").value = "";
  } catch (e) {
    out.innerHTML = "❌ No se pudo crear: " + esc(e.message);
    out.classList.remove("oculto");
  } finally {
    appSec.delete();
  }
}

/* ---------- partidos ---------- */
function limpiarFormPartido() {
  $("#adm-fecha").value = ""; $("#adm-sede").value = "";
  $("#btn-cancelar-edicion").classList.add("oculto");
  $("#btn-guardar-partido").textContent = "Guardar partido";
}

async function guardarPartido() {
  const m = $("#adm-partido-msg");
  const fase = $("#adm-fase").value;
  const grupo = fase === "GRUPOS" ? $("#adm-grupo").value : "";
  const local = $("#adm-local").value, visita = $("#adm-visita").value;
  const fechaStr = $("#adm-fecha").value;
  if (!fechaStr) return msg(m, "Falta la fecha y hora.", "error");
  if (fase === "GRUPOS" && !grupo) return msg(m, "Elige el grupo.", "error");
  if (local === visita) return msg(m, "Local y visitante no pueden ser el mismo equipo.", "error");

  const datos = {
    fase, grupo, local, visita,
    sede: $("#adm-sede").value.trim(),
    kickoff: TS.fromDate(new Date(fechaStr)) // se interpreta en TU zona horaria local
  };
  try {
    if (editandoPartido) {
      await db.collection("matches").doc(editandoPartido).update(datos);
      msg(m, "Partido actualizado.", "ok");
    } else {
      await db.collection("matches").add({ ...datos, resultado: null });
      msg(m, "Partido agregado.", "ok");
    }
    editandoPartido = null;
    limpiarFormPartido();
    await cargarPartidos();
    renderAdmPartidos(); renderAdmResultados(); renderPartidos();
  } catch (e) { msg(m, "Error: " + e.message, "error"); }
}

function renderAdmPartidos() {
  const cont = $("#adm-lista-partidos");
  if (!E.partidos.length) { cont.innerHTML = `<p class="nota">Aún no hay partidos. Agrégalos arriba o importa el JSON.</p>`; return; }
  cont.innerHTML = E.partidos.map(p => `
    <div class="adm-partido">
      <span class="info">
        <b>${banderaEquipo(p.local)} ${nombreEquipo(p.local)} vs ${nombreEquipo(p.visita)} ${banderaEquipo(p.visita)}</b><br>
        ${p.fase === "GRUPOS" ? "Grupo " + p.grupo : FASES[p.fase]} · ${fmtDia(p.kickoff)} ${fmtHora(p.kickoff)} h
        ${p.resultado ? ` · <b>Final ${p.resultado.home}-${p.resultado.away}</b>` : ""}
      </span>
      <span>
        <button class="btn btn-fantasma btn-chico" data-edit="${p.id}">Editar</button>
        <button class="btn btn-peligro btn-chico" data-del="${p.id}">Borrar</button>
      </span>
    </div>`).join("");
}

async function clickListaPartidos(ev) {
  const e = ev.target.closest("button"); if (!e) return;
  if (e.dataset.edit) {
    const p = E.partidos.find(x => x.id === e.dataset.edit);
    editandoPartido = p.id;
    $("#adm-fase").value = p.fase; $("#adm-grupo").value = p.grupo;
    $("#adm-local").value = p.local; $("#adm-visita").value = p.visita;
    $("#adm-sede").value = p.sede;
    const d = p.kickoff;
    $("#adm-fecha").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    $("#btn-cancelar-edicion").classList.remove("oculto");
    $("#btn-guardar-partido").textContent = "Actualizar partido";
    $("#btn-guardar-partido").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (e.dataset.del) {
    if (!confirm("¿Borrar este partido? Las predicciones asociadas dejarán de contar.")) return;
    await db.collection("matches").doc(e.dataset.del).delete();
    await cargarPartidos();
    renderAdmPartidos(); renderAdmResultados(); renderPartidos();
  }
}

async function importarPartidos() {
  const m = $("#adm-import-msg");
  let arr;
  try { arr = JSON.parse($("#adm-import-json").value); }
  catch (e) { return msg(m, "El JSON no es válido.", "error"); }
  if (!Array.isArray(arr)) return msg(m, "Debe ser un arreglo [...]", "error");
  let ok = 0, err = 0;
  const lote = db.batch();
  for (const x of arr) {
    try {
      const f = new Date(x.kickoff);
      if (isNaN(f) || !x.local || !x.visita) throw 0;
      const ref = db.collection("matches").doc();
      lote.set(ref, {
        fase: x.fase || "GRUPOS", grupo: x.grupo || "",
        local: x.local, visita: x.visita,
        sede: x.sede || "", kickoff: TS.fromDate(f), resultado: null
      });
      ok++;
    } catch (e) { err++; }
  }
  await lote.commit();
  msg(m, `Importados: ${ok}. Con error: ${err}.`, err ? "error" : "ok");
  await cargarPartidos();
  renderAdmPartidos(); renderAdmResultados(); renderPartidos();
}

/* ---------- resultados ---------- */
function renderAdmResultados() {
  const cont = $("#adm-resultados");
  const ahora = new Date();
  const jugados = E.partidos.filter(p => p.kickoff <= ahora);
  if (!jugados.length) { cont.innerHTML = `<p class="nota">Todavía no inicia ningún partido.</p>`; return; }
  cont.innerHTML = jugados.map(p => `
    <div class="adm-resultado">
      <span>${banderaEquipo(p.local)} <b>${nombreEquipo(p.local)}</b> vs <b>${nombreEquipo(p.visita)}</b> ${banderaEquipo(p.visita)}
        <span class="nota">· ${fmtDia(p.kickoff)}</span></span>
      <span class="marcador-inputs">
        <input type="number" min="0" max="20" id="rh-${p.id}" value="${p.resultado ? p.resultado.home : ""}">
        <span class="vs">–</span>
        <input type="number" min="0" max="20" id="ra-${p.id}" value="${p.resultado ? p.resultado.away : ""}">
        <button class="btn btn-primario btn-chico" data-res="${p.id}">${p.resultado ? "✓" : "Guardar"}</button>
      </span>
    </div>`).join("");
}

async function clickResultados(ev) {
  const e = ev.target.closest("button[data-res]"); if (!e) return;
  const id = e.dataset.res;
  const h = parseInt($(`#rh-${id}`).value, 10), a = parseInt($(`#ra-${id}`).value, 10);
  if (isNaN(h) || isNaN(a)) return alert("Marcador inválido.");
  e.disabled = true;
  await db.collection("matches").doc(id).update({ resultado: { home: h, away: a } });
  await cargarPartidos();
  renderAdmResultados(); renderPartidos();
}

/* ---------- configuración ---------- */
function cargarConfigEnForm() {
  const c = E.config;
  $("#cfg-pts-exacto").value = c.ptsExacto;
  $("#cfg-pts-diff").value = c.ptsDiferencia;
  $("#cfg-pts-ganador").value = c.ptsGanador;
  $("#cfg-pts-campeon").value = c.ptsCampeon;
  $("#cfg-pts-sub").value = c.ptsSubcampeon;
  $("#cfg-pts-tercero").value = c.ptsTercero;
  $("#cfg-real-1").value = c.real1 || ""; $("#cfg-real-2").value = c.real2 || ""; $("#cfg-real-3").value = c.real3 || "";
  if (c.podiumDeadline) {
    const d = c.podiumDeadline.toDate();
    $("#cfg-podio-deadline").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
}

async function guardarConfig() {
  const m = $("#cfg-msg");
  const dlStr = $("#cfg-podio-deadline").value;
  const datos = {
    ptsExacto: +$("#cfg-pts-exacto").value || 0,
    ptsDiferencia: +$("#cfg-pts-diff").value || 0,
    ptsGanador: +$("#cfg-pts-ganador").value || 0,
    ptsCampeon: +$("#cfg-pts-campeon").value || 0,
    ptsSubcampeon: +$("#cfg-pts-sub").value || 0,
    ptsTercero: +$("#cfg-pts-tercero").value || 0,
    real1: $("#cfg-real-1").value, real2: $("#cfg-real-2").value, real3: $("#cfg-real-3").value,
  };
  if (dlStr) datos.podiumDeadline = TS.fromDate(new Date(dlStr));
  try {
    await db.collection("config").doc("general").set(datos, { merge: true });
    await cargarConfig();
    msg(m, "Configuración guardada.", "ok");
  } catch (e) { msg(m, "Error: " + e.message, "error"); }
}
