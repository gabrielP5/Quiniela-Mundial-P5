/* =====================================================
   QUINIELA ///26 — Gráfica de evolución
   Línea del tiempo del avance de puntos / posición por partido.
   - Eje X: partidos finalizados en orden cronológico (no reloj).
   - Eje Y: puntos acumulados  ó  posición en la tabla (toggle).
   - Slider "Top N" (default 7): resalta a los N que TERMINAN arriba.
   - Slider temporal + play: avanza partido por partido.
   - Cero lecturas extra a Firestore: reusa obtenerPredicciones() + su caché.
   SVG nativo, sin librerías, sin build. Respeta prefers-reduced-motion.
   ===================================================== */

const EVO = {
  modo: "puntos",        // "puntos" | "posicion"
  topN: 7,
  step: 0,               // step actual del slider (0..maxStep)
  maxStep: 0,
  playing: false,
  timer: null,
  data: null,            // { uids, etiquetas, series, ranks, finalOrden }
  construido: false,
};

const EVO_REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Paleta para las líneas resaltadas: deriva de tus tokens tricolor + acentos.
const EVO_COLORES = [
  "#00B560", // verde MEX
  "#29C2FF", // cian USA
  "#FF3B4E", // rojo CAN
  "#FFC233", // oro
  "#C9A6FF", // violeta
  "#FF9F45", // naranja
  "#5BE0B0", // verde agua
  "#FF6FB5", // rosa
  "#9AD24A", // lima
  "#7FB2FF", // azul claro
];

/* ---------- construir las series (una sola pasada) ---------- */
async function evoConstruirDatos() {
  const conResultado = E.partidos.filter(p => p.resultado); // ya vienen ordenados por kickoff
  if (!conResultado.length) return null;

  const acum = {};
  const series = {};
  const etiquetas = [{ idx: 0, label: "Inicio", sub: "" }];

  // sembrar a todos en 0
  Object.keys(E.usuarios).forEach(u => { acum[u] = 0; series[u] = [0]; });

  for (let i = 0; i < conResultado.length; i++) {
    const p = conResultado[i];
    let preds = [];
    try { preds = await obtenerPredicciones(p.id); } catch (e) {}
    for (const pr of preds) {
      acum[pr.uid] = (acum[pr.uid] || 0) + puntosPartido(pr, p.resultado);
    }
    // snapshot de TODOS para mantener líneas continuas
    Object.keys(E.usuarios).forEach(u => series[u].push(acum[u] || 0));
    etiquetas.push({
      idx: i + 1,
      label: `${banderaEquipo(p.local)}${banderaEquipo(p.visita)}`,
      sub: `${p.resultado.home}–${p.resultado.away}`,
    });
  }

  const uids = Object.keys(E.usuarios);
  const nSteps = etiquetas.length;

  // rankings por step (1 = líder). Empates: mismo puntaje => orden estable por nombre.
  const ranks = {};
  uids.forEach(u => ranks[u] = []);
  for (let s = 0; s < nSteps; s++) {
    const ordenados = [...uids].sort((a, b) =>
      series[b][s] - series[a][s] ||
      (E.usuarios[a] || "").localeCompare(E.usuarios[b] || "")
    );
    ordenados.forEach((u, pos) => ranks[u][s] = pos + 1);
  }

  // orden final (último step) → define quiénes son "Top N" y el color asignado
  const finalOrden = [...uids].sort((a, b) =>
    series[b][nSteps - 1] - series[a][nSteps - 1] ||
    (E.usuarios[a] || "").localeCompare(E.usuarios[b] || "")
  );

  return { uids, etiquetas, series, ranks, finalOrden, nSteps };
}

/* ---------- render principal ---------- */
async function renderEvolucion() {
  const cont = $("#evo-cuerpo");
  if (!cont) return;

  if (!EVO.data) {
    cont.innerHTML = `<p class="vacio">Calculando la evolución…</p>`;
    EVO.data = await evoConstruirDatos();
  }
  if (!EVO.data) {
    cont.innerHTML = `<p class="vacio">La gráfica arranca cuando haya al menos un resultado capturado.</p>`;
    $("#evo-controles")?.classList.add("oculto");
    return;
  }
  $("#evo-controles")?.classList.remove("oculto");

  EVO.maxStep = EVO.data.nSteps - 1;
  if (EVO.step > EVO.maxStep) EVO.step = EVO.maxStep;
  if (!EVO.construido) {
    // primera vez: arranca mostrando todo el recorrido
    EVO.step = EVO.maxStep;
    EVO.construido = true;
    evoSincronizarControles();
  }

  evoDibujar();
}

/* ---------- controles ---------- */
function evoSincronizarControles() {
  const sTop = $("#evo-top");
  const total = EVO.data ? EVO.data.uids.length : EVO.topN;
  sTop.max = Math.max(2, total);
  sTop.value = Math.min(EVO.topN, total);
  EVO.topN = +sTop.value;
  $("#evo-top-val").textContent = EVO.topN;

  const sT = $("#evo-tiempo");
  sT.max = EVO.maxStep;
  sT.step = "any";          // permite que el play mueva el thumb de forma continua
  sT.value = EVO.step;
  evoActualizarEtiquetaTiempo();

  $$(".evo-modo-btn").forEach(b => b.classList.toggle("activo", b.dataset.modo === EVO.modo));
}

function evoActualizarEtiquetaTiempo() {
  const et = EVO.data.etiquetas[EVO.step];
  $("#evo-tiempo-val").innerHTML = EVO.step === 0
    ? `Inicio`
    : `Partido ${EVO.step}/${EVO.maxStep} · ${et.label} <b>${et.sub}</b>`;
}

/* ---------- dibujo SVG ----------
   pos: posición continua en el eje X (float). El entero floor(pos) marca los
   índices ya "cumplidos" (con su vértice); la fracción interpola el último tramo
   para que el play se vea continuo aunque los datos sean discretos. */
function evoDibujar(pos) {
  const cont = $("#evo-cuerpo");
  const { uids, series, ranks, finalOrden } = EVO.data;
  if (pos == null) pos = EVO.step;
  pos = Math.max(0, Math.min(EVO.maxStep, pos));
  const base = Math.floor(pos + 1e-9);      // índice entero alcanzado
  const frac = pos - base;                   // 0..1 dentro del tramo base→base+1
  const esPuntos = EVO.modo === "puntos";

  // valor (puntos o ranking) de un uid en una posición continua
  const crudo = (u, s) => esPuntos ? series[u][s] : ranks[u][s];
  const valEn = (u, p) => {
    const a = Math.floor(p + 1e-9);
    const f = p - a;
    if (f === 0 || a >= EVO.maxStep) return crudo(u, a);
    return crudo(u, a) + (crudo(u, a + 1) - crudo(u, a)) * f;
  };

  // top N por orden final
  const destacados = finalOrden.slice(0, EVO.topN);
  const colorDe = {};
  destacados.forEach((u, i) => colorDe[u] = EVO_COLORES[i % EVO_COLORES.length]);

  // geometría — responsiva al ancho del contenedor
  const W = Math.max(320, cont.clientWidth || 320);
  const altoBase = W < 520 ? 300 : 380;
  const H = altoBase;
  const m = { t: 14, r: 12, b: 16, l: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const xDe = (s) => m.l + (EVO.maxStep === 0 ? 0 : (s / EVO.maxStep) * iw);

  // dominio Y
  let yDe;
  if (esPuntos) {
    // techo estable: máximo de TODO el recorrido, para que el eje no salte al animar
    let maxTotal = 1;
    for (const u of uids) maxTotal = Math.max(maxTotal, series[u][EVO.maxStep]);
    const top = Math.max(maxTotal, 1);
    yDe = (v) => m.t + ih - (v / top) * ih;
    EVO._yTop = top;
  } else {
    const n = uids.length;
    yDe = (r) => m.t + ((r - 1) / Math.max(1, n - 1)) * ih;  // 1 arriba, n abajo
  }

  // y en pantalla de un uid en posición continua
  const yEn = (u, p) => yDe(valEn(u, p));

  // path continuo: vértices enteros 0..base, más el punto interpolado en pos
  function pathDe(u) {
    let d = "";
    for (let s = 0; s <= base; s++)
      d += (s === 0 ? "M" : "L") + xDe(s).toFixed(1) + " " + yEn(u, s).toFixed(1) + " ";
    if (frac > 0) d += "L" + xDe(pos).toFixed(1) + " " + yEn(u, pos).toFixed(1) + " ";
    return d.trim();
  }

  // grid del eje Y
  let grid = "";
  if (esPuntos) {
    const top = EVO._yTop, pasos = 4;
    for (let k = 0; k <= pasos; k++) {
      const v = Math.round((top / pasos) * k), y = yDe(v);
      grid += `<line class="evo-grid" x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}"/>
               <text class="evo-axis" x="${m.l - 6}" y="${y + 3}" text-anchor="end">${v}</text>`;
    }
  } else {
    const n = uids.length, marcas = [1];
    if (n >= 3) marcas.push(Math.ceil(n / 2));
    if (n >= 2) marcas.push(n);
    [...new Set(marcas)].forEach(r => {
      const y = yDe(r);
      grid += `<line class="evo-grid" x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}"/>
               <text class="evo-axis" x="${m.l - 6}" y="${y + 3}" text-anchor="end">${r}°</text>`;
    });
  }

  // eje X: un tic por índice; los ya alcanzados (<= base) en sólido, el resto tenue
  const yEjeX = m.t + ih;
  let ejeX = "";
  for (let s = 0; s <= EVO.maxStep; s++) {
    const xs = xDe(s);
    ejeX += `<line class="evo-tic ${s <= base ? "" : "evo-tic-off"}" x1="${xs.toFixed(1)}" y1="${m.t}" x2="${xs.toFixed(1)}" y2="${yEjeX}"/>`;
  }

  // líneas de fondo (no destacados)
  const noDest = uids.filter(u => !colorDe[u]);
  let lineasFondo = noDest.map(u => `<path class="evo-linea-fondo" d="${pathDe(u)}"/>`).join("");

  // líneas destacadas + vértices SOLO en índices enteros alcanzados
  let lineasTop = "", vertices = "";
  destacados.forEach(u => {
    const col = colorDe[u];
    lineasTop += `<path class="evo-linea" stroke="${col}" d="${pathDe(u)}"/>`;
    const hasta = frac > 0 ? base : base - 1; // el índice "actual" lo dibuja la punta
    for (let s = 0; s <= hasta; s++)
      vertices += `<circle class="evo-vertice" cx="${xDe(s).toFixed(1)}" cy="${yEn(u, s).toFixed(1)}" r="2.6" fill="${col}"/>`;
  });

  // Puntas: marcador + etiqueta en la posición interpolada, con anti-colisión
  const x = xDe(pos);
  const puntas = destacados.map(u => {
    const y = yEn(u, pos);
    // el valor de la etiqueta es el del índice más cercano (no fracciones raras)
    const sLabel = frac >= 0.5 ? Math.min(base + 1, EVO.maxStep) : base;
    const val = esPuntos ? series[u][sLabel] : (ranks[u][sLabel] + "°");
    return { u, col: colorDe[u], yLinea: y, yLabel: y - 7, val };
  }).sort((a, b) => a.yLabel - b.yLabel);

  const MIN = 13;
  for (let i = 1; i < puntas.length; i++)
    if (puntas[i].yLabel - puntas[i - 1].yLabel < MIN)
      puntas[i].yLabel = puntas[i - 1].yLabel + MIN;
  const exceso = puntas.length ? puntas[puntas.length - 1].yLabel - (H - m.b + 2) : 0;
  if (exceso > 0) puntas.forEach(p => p.yLabel -= exceso);

  let puntasTop = "";
  puntas.forEach(p => {
    puntasTop += `<circle cx="${x.toFixed(1)}" cy="${p.yLinea.toFixed(1)}" r="3.5" fill="${p.col}"/>`;
    // conector tenue si la etiqueta se movió lejos de su punto
    if (Math.abs(p.yLabel - (p.yLinea - 7)) > 5)
      puntasTop += `<line x1="${x.toFixed(1)}" y1="${p.yLinea.toFixed(1)}" x2="${(x - 5).toFixed(1)}" y2="${(p.yLabel - 1).toFixed(1)}" stroke="${p.col}" stroke-width="1" opacity=".4"/>`;
    puntasTop += `<text class="evo-punta" x="${(x - 7).toFixed(1)}" y="${p.yLabel.toFixed(1)}" text-anchor="end" fill="${p.col}">${esc(E.usuarios[p.u] || "?")} <tspan font-weight="700">${p.val}</tspan></text>`;
  });

  const svg = `
  <svg class="evo-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
       aria-label="Evolución de ${EVO.modo === 'puntos' ? 'puntos' : 'posición'} por partido">
    ${grid}
    ${ejeX}
    ${lineasFondo}
    ${lineasTop}
    ${vertices}
    ${puntasTop}
  </svg>`;

  // leyenda (solo destacados, en orden final) — valor en el índice base
  const sLeg = frac >= 0.5 ? Math.min(base + 1, EVO.maxStep) : base;
  const leyenda = destacados.map((u) => {
    const col = colorDe[u];
    const val = esPuntos ? series[u][sLeg] : (ranks[u][sLeg] + "°");
    return `<span class="evo-leg-item"><i style="background:${col}"></i>${esc(E.usuarios[u] || "?")} <b>${val}</b></span>`;
  }).join("");

  cont.innerHTML = svg + `<div class="evo-leyenda">${leyenda}</div>`;
}

/* ---------- animación (play / pausa) ----------
   Recorre el eje X de forma CONTINUA con requestAnimationFrame.
   Aunque los datos son discretos, el lápiz avanza fraccionariamente entre
   índices con un easing suave por tramo. reduce-motion → salto discreto. */
const EVO_MS_POR_TRAMO = 700;   // duración de cada paso índice→índice
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function evoPlay() {
  if (EVO.step >= EVO.maxStep) EVO.step = 0; // reinicia si está al final
  EVO.playing = true;
  $("#evo-play").textContent = "❚❚";
  $("#evo-play").setAttribute("aria-label", "Pausar");

  // reduce-motion: mantener el avance discreto, sin interpolar
  if (EVO_REDUCE_MOTION) {
    const avanzar = () => {
      if (!EVO.playing) return;
      if (EVO.step >= EVO.maxStep) { evoPausa(); return; }
      EVO.step++;
      $("#evo-tiempo").value = EVO.step;
      evoActualizarEtiquetaTiempo();
      evoDibujar();
      EVO.timer = setTimeout(avanzar, 140);
    };
    EVO.timer = setTimeout(avanzar, 140);
    return;
  }

  const inicio = EVO.step;
  const t0 = performance.now();
  const totalTramos = EVO.maxStep - inicio;
  const duracion = totalTramos * EVO_MS_POR_TRAMO;

  const frame = (ahora) => {
    if (!EVO.playing) return;
    const transcurrido = ahora - t0;
    const prog = Math.min(1, transcurrido / duracion); // 0..1 sobre todo el recorrido

    // easing por-tramo: suaviza la entrada/salida de cada índice
    const bruto = inicio + prog * totalTramos;
    const b = Math.floor(bruto);
    const f = bruto - b;
    const pos = Math.min(EVO.maxStep, b + easeInOut(f));

    EVO.step = Math.round(pos);
    $("#evo-tiempo").value = pos;       // el slider sigue el movimiento continuo
    evoActualizarEtiquetaTiempo();
    evoDibujar(pos);

    if (prog >= 1) { EVO.step = EVO.maxStep; evoPausa(); return; }
    EVO.raf = requestAnimationFrame(frame);
  };
  EVO.raf = requestAnimationFrame(frame);
}

function evoPausa() {
  EVO.playing = false;
  clearTimeout(EVO.timer);
  if (EVO.raf) cancelAnimationFrame(EVO.raf);
  // al pausar, asienta en el índice entero más cercano
  EVO.step = Math.round(Math.max(0, Math.min(EVO.maxStep, +$("#evo-tiempo").value)));
  $("#evo-tiempo").value = EVO.step;
  evoActualizarEtiquetaTiempo();
  evoDibujar();
  $("#evo-play").textContent = "▶";
  $("#evo-play").setAttribute("aria-label", "Reproducir");
}

/* ---------- wiring de eventos (se llama una vez) ---------- */
let evoCableado = false;
function initEvolucion() {
  if (evoCableado) return;
  evoCableado = true;

  $("#evo-controles").addEventListener("click", (ev) => {
    const b = ev.target.closest(".evo-modo-btn");
    if (!b) return;
    EVO.modo = b.dataset.modo;
    $$(".evo-modo-btn").forEach(x => x.classList.toggle("activo", x === b));
    evoDibujar();
  });

  $("#evo-top").addEventListener("input", (e) => {
    EVO.topN = +e.target.value;
    $("#evo-top-val").textContent = EVO.topN;
    evoDibujar();
  });

  $("#evo-tiempo").addEventListener("input", (e) => {
    evoPausa();
    EVO.step = +e.target.value;
    evoActualizarEtiquetaTiempo();
    evoDibujar();
  });

  $("#evo-play").addEventListener("click", () => {
    EVO.playing ? evoPausa() : evoPlay();
  });

  // redibujar al cambiar tamaño (debounce simple)
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (EVO.data && !$("#panel-evolucion").classList.contains("oculto")) evoDibujar(); }, 150);
  });
}

// Invalida la data cacheada en memoria cuando cambian resultados
// (llámalo desde donde recargas partidos, p.ej. tras capturar un resultado).
function evoInvalidar() { EVO.data = null; EVO.construido = false; }
