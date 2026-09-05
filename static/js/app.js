/* ==========================================================================
   Jockey Club Handball · frontend
   Router por hash + pantallas. Todo se dibuja dentro de #view.

   Roles:
     cuerpo_tecnico -> ve todo el plantel, no registra carga/hidratacion
     jugador        -> registra SU carga/hidratacion, ve solo lo suyo
   ========================================================================== */

const SEED_HINT = "Staff (pass handball2025): entrenador@ · pf@ · medico@ · fisio@ · ct@jockey.com  —  jugador: facundo.gomez@jockey.com / jugador2025";
const POSICIONES = ["Arquero", "Lateral", "Central", "Extremo", "Pivote"];
const TIPOS_SESION = ["Entrenamiento", "Partido", "Gimnasio", "Recuperacion", "Otro"];
const SUENO_OPCIONES = [
  "Menos de 6 h / Poco reparador",
  "6-7 h / Regular",
  "7-8 h / Reparador",
  "Mas de 8 h / Muy reparador",
];
const TIPOS_EVENTO = ["entrenamiento", "partido", "gimnasio", "recuperacion", "otro"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DOW = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

// iconos (SVG inline) para los botones de tipo de evento
const ICON_CONO = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px"><path d="M12 3 5 20h14L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.6 12h6.8M7.3 16h9.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_BALON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 3c3 3 3 15 0 18M3 12c3-3 15-3 18 0M6 6c4 1 8 1 12 0M6 18c4-1 8-1 12 0" stroke="currentColor" stroke-width="1.4"/></svg>`;

const ROLES_CT = ["entrenador", "preparador_fisico", "medico", "fisioterapeuta", "cuerpo_tecnico"];
const ROLES_LESIONES = ["medico", "fisioterapeuta", "cuerpo_tecnico"];
const ROLES_CALENDARIO = ["entrenador", "preparador_fisico", "cuerpo_tecnico"];
const ROL_LABEL = {
  jugador: "Jugador", entrenador: "Entrenador", preparador_fisico: "Preparador fisico",
  medico: "Medico deportologo", fisioterapeuta: "Fisioterapeuta", cuerpo_tecnico: "Cuerpo tecnico",
};

const NAV = {
  entrenador: [
    ["inicio", "Inicio"], ["plantel", "Plantel"], ["carga", "Carga"], ["registro", "Registro"],
    ["sep"], ["calendario", "Calendario"], ["informes", "Informes"], ["config", "Mi perfil"],
  ],
  preparador_fisico: [
    ["inicio", "Inicio"], ["plantel", "Plantel"], ["carga", "Carga"], ["registro", "Registro"],
    ["sep"], ["calendario", "Calendario"], ["informes", "Informes"], ["config", "Mi perfil"],
  ],
  medico: [
    ["inicio", "Inicio"], ["plantel", "Plantel"], ["lesiones", "Lesiones"], ["carga", "Carga"],
    ["sep"], ["calendario", "Calendario"], ["config", "Mi perfil"],
  ],
  fisioterapeuta: [
    ["inicio", "Inicio"], ["plantel", "Plantel"], ["lesiones", "Lesiones"], ["carga", "Carga"],
    ["sep"], ["calendario", "Calendario"], ["config", "Mi perfil"],
  ],
  cuerpo_tecnico: [
    ["inicio", "Inicio"], ["plantel", "Plantel"], ["carga", "Carga"], ["lesiones", "Lesiones"], ["registro", "Registro"],
    ["sep"], ["calendario", "Calendario"], ["informes", "Informes"], ["config", "Cuentas"],
  ],
  jugador: [
    ["inicio", "Inicio"], ["micarga", "Mi carga"], ["registro", "Registrar sesion"],
    ["hidratacion", "Hidratacion"], ["mislesiones", "Mis lesiones"],
    ["sep"], ["calendario", "Calendario"], ["config", "Mi perfil"],
  ],
};
const ACCESO = {};
for (const rol of Object.keys(NAV)) {
  ACCESO[rol] = NAV[rol].filter(i => i[0] !== "sep").map(i => i[0]);
}
// rutas extra (no van en el menu pero se acceden desde otras pantallas)
ROLES_CT.forEach(r => ACCESO[r].push("jugador"));
ROLES_LESIONES.forEach(r => { if (!ACCESO[r].includes("lesiones")) ACCESO[r].push("lesiones"); ACCESO[r].push("lesion"); });

const state = { perfil: null, jugadores: null };
const esCT = () => ROLES_CT.includes(state.perfil.rol);
const esLesiones = () => ROLES_LESIONES.includes(state.perfil.rol);
const esCalendarioEditor = () => ROLES_CALENDARIO.includes(state.perfil.rol);
const yo = () => state.perfil.id;

/* -------------------------------------------------------------- charts ---- */

const COL = {
  verde: "#2A9D8F", amarillo: "#E9C46A", naranja: "#F4A261", rojo: "#E63946",
  line: "#2A2A2D", ink: "#9A9AA1", surface: "#1F1F22", accent: "#E63946", gris: "#5C5C63",
};

if (window.Chart) {
  Chart.defaults.color = COL.ink;
  Chart.defaults.borderColor = COL.line;
  Chart.defaults.font.family = "Archivo, system-ui, sans-serif";
  Chart.defaults.plugins.legend.display = false;
}

let _charts = [];
function destroyCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  _charts = [];
}
function chart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const c = new Chart(el.getContext("2d"), config);
  _charts.push(c);
  return c;
}
function colorPorCarga(v, media) {
  if (!v) return COL.surface;
  if (v <= media) return COL.verde;
  if (v <= media * 1.3) return COL.amarillo;
  if (v <= media * 1.6) return COL.naranja;
  return COL.rojo;
}
const ejeSinGrilla = { grid: { display: false }, border: { color: COL.line } };
const ejeGrillaTenue = { grid: { color: COL.line }, border: { display: false } };

/* --------------------------------------------------------------- utils ---- */

const $ = (sel, root = document) => root.querySelector(sel);
const view = () => $("#view");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function iniciales(nombre, apellido) {
  return (((nombre || "")[0] || "") + ((apellido || "")[0] || "")).toUpperCase();
}
function inicialesDe(nombreCompleto) {
  return (nombreCompleto || "").split(" ").map(x => x[0] || "").join("").slice(0, 2).toUpperCase();
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function nombreJugador(j) {
  return `${j.nombre} ${j.apellido}`.trim();
}
function ddmm(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function zonaLabel(z) {
  return { adecuada: "Adecuada", atencion: "Atencion", alta: "Alta", muy_alta: "Muy alta", sin_datos: "Sin datos" }[z] || z;
}
function spinner() {
  view().innerHTML = '<div class="spinner"></div>';
}
function crumbs(...parts) {
  $("#crumbs").innerHTML = parts
    .map((p, i) => (i === parts.length - 1 ? `<b>${esc(p)}</b>` : esc(p)))
    .join(" <span>&rsaquo;</span> ");
}
async function jugadores() {
  if (!state.jugadores) state.jugadores = await API.get("/jugadores");
  return state.jugadores;
}

function pageHead(titulo, sub) {
  return `<div class="page-head">
    <div class="glyph">◆</div>
    <div><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div>
  </div>`;
}
function kpi(label, value, cls = "") {
  return `<div class="card kpi">
    <span class="k-label">${esc(label)}</span>
    <span class="k-value ${cls} tnum">${esc(value)}</span>
  </div>`;
}

/* ---------------------------------------------------------------- auth ---- */

async function boot() {
  $("#seed-hint").textContent = SEED_HINT;
  $("#seed-hint").hidden = false;

  $("#login-form").addEventListener("submit", onLogin);
  $("#btn-logout").addEventListener("click", onLogout);
  window.addEventListener("hashchange", router);

  if (API.token) {
    try {
      state.perfil = await API.get("/perfil");
      showApp();
      return;
    } catch (e) { /* token vencido: cae a login */ }
  }
  showLogin();
}

function showLogin() {
  $("#app").classList.remove("ready");
  $("#login").hidden = false;
}

function showApp() {
  $("#login").hidden = true;
  $("#app").classList.add("ready");
  const p = state.perfil;
  $("#who-av").textContent = iniciales(p.nombre, p.apellido) || "–";
  $("#who-name").textContent = `${nombreJugador(p)} · ${ROL_LABEL[p.rol] || p.rol}`;

  $("#nav").innerHTML = (NAV[p.rol] || NAV.jugador).map(item => (
    item[0] === "sep" ? `<div class="sep"></div>`
      : `<a href="#/${item[0]}" data-route="${item[0]}">${esc(item[1])}</a>`
  )).join("");

  if (!location.hash || location.hash === "#/") location.hash = "#/inicio";
  router();
}

async function onLogin(ev) {
  ev.preventDefault();
  const errBox = $("#login-error");
  errBox.hidden = true;
  try {
    const r = await API.post("/login", {
      email: $("#li-email").value.trim(),
      password: $("#li-pass").value,
    });
    API.setToken(r.token);
    location.reload();
  } catch (e) {
    errBox.textContent = e.message;
    errBox.hidden = false;
  }
}

async function onLogout() {
  try { await API.post("/logout"); } catch (e) { /* da igual */ }
  API.setToken(null);
  location.reload();
}

/* -------------------------------------------------------------- router ---- */

const ROUTES = {
  inicio: screenInicio,
  plantel: screenPlantel,
  jugador: screenFichaJugador,
  carga: screenCarga,
  micarga: screenMiCarga,
  registro: () => (esCT() ? screenRegistroEvento() : screenRegistro()),
  hidratacion: screenHidratacion,
  mislesiones: screenMisLesiones,
  lesiones: screenLesionesCT,
  lesion: screenLesionRTS,
  config: screenConfig,
  calendario: screenCalendario,
  informes: () => screenSoon("Informes", "Resumenes exportables por jugador y por plantel."),
};

function router() {
  if (!state.perfil) return;  // todavia no cargo la sesion
  destroyCharts();
  const partes = (location.hash.replace("#/", "") || "inicio").split("/");
  let route = partes[0];
  if (!ACCESO[state.perfil.rol].includes(route)) route = "inicio";

  document.querySelectorAll("#nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.route === route);
  });
  const fn = ROUTES[route] || screenInicio;
  Promise.resolve()
    .then(() => { spinner(); return fn(partes.slice(1)); })
    .catch(err => {
      view().innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
    });
}

function screenSoon(titulo, sub) {
  crumbs(titulo);
  view().innerHTML = pageHead(titulo, sub) +
    `<div class="card"><div class="empty">
      <div class="big">En construccion</div>
      <p>Este modulo llega en el proximo paso.</p>
    </div></div>`;
}

/* ======================================================================
   INICIO
   ====================================================================== */

function screenInicio() {
  return esCT() ? screenInicioCT() : screenInicioJugador();
}

const ALERTA_META = {
  lesion: { ic: "✚", label: "Lesion" },
  carga: { ic: "▲", label: "Carga" },
  hidratacion: { ic: "◐", label: "Hidratacion" },
};

async function screenInicioCT() {
  crumbs("Inicio");
  const [js, lesiones, resumen, alertas] = await Promise.all([
    jugadores(),
    API.get("/lesiones?activas=1"),
    API.get("/carga/resumen?dias=7"),
    API.get("/alertas"),
  ]);
  const fueraIds = new Set(lesiones.filter(l => ["lesionado", "disponible_entrenar"].includes(l.estado)).map(l => l.jugador_id));
  const total = js.length;
  const disponibles = total - fueraIds.size;
  const pctDisp = total ? Math.round((disponibles / total) * 100) : 100;
  const jugConAlerta = new Set(alertas.map(a => a.jugador_id)).size;
  const rojas = alertas.filter(a => a.semaforo === "rojo").length;
  const puedeRTS = esLesiones();

  view().innerHTML = pageHead("Panel del plantel", "Lo que necesita atencion hoy") + `
    <div class="grid cols-4">
      ${kpi("Jugadores", total)}
      ${kpi("Disponibles", disponibles)}
      ${kpi("Con alerta", jugConAlerta, jugConAlerta ? "accent" : "")}
      ${kpi("Disponibilidad", pctDisp + "%")}
    </div>

    <div class="card section-gap">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h3 style="margin:0">Alertas de hoy</h3>
        <span class="muted" style="font-size:.82rem">${alertas.length} alerta${alertas.length === 1 ? "" : "s"}${rojas ? " · " + rojas + " urgente" + (rojas === 1 ? "" : "s") : ""}</span>
      </div>
      <div style="margin-top:14px">${
        alertas.length
          ? `<div class="alerta-list">${alertas.map(a => filaAlerta(a, puedeRTS)).join("")}</div>`
          : `<p class="muted">Sin alertas. Todo el plantel en zona adecuada.</p>`
      }</div>
    </div>

    <div class="card section-gap">
      <h3>Carga del plantel · ultimos 7 dias</h3>
      <p class="card-sub">Suma diaria en UA. La linea marca el promedio.</p>
      <div style="height:230px"><canvas id="ch-carga7"></canvas></div>
    </div>`;

  graficoCargaDiaria("ch-carga7", resumen.serie_diaria);

  view().querySelectorAll("[data-alerta]").forEach(el =>
    el.addEventListener("click", () => { location.hash = el.dataset.alerta; }));
}

function filaAlerta(a, puedeRTS) {
  const meta = ALERTA_META[a.tipo] || { ic: "•", label: a.tipo };
  let link = `#/jugador/${a.jugador_id}`;
  if (a.tipo === "lesion") link = puedeRTS && a.lesion_id ? `#/lesion/${a.lesion_id}` : `#/jugador/${a.jugador_id}/lesiones`;
  else if (a.tipo === "carga") link = `#/jugador/${a.jugador_id}/carga`;
  else if (a.tipo === "hidratacion") link = `#/jugador/${a.jugador_id}/hidratacion`;
  return `<div class="alerta-item" data-alerta="${link}">
    <span class="alerta-ic ${esc(a.semaforo)}">${meta.ic}</span>
    <div class="alerta-main">
      <div class="alerta-t"><b>${esc(a.jugador)}</b> <span class="muted">${esc(a.posicion || "")}</span></div>
      <div class="alerta-d">${esc(meta.label)} — ${esc(a.titulo)} · ${esc(a.detalle)}</div>
    </div>
    <span class="chip ${esc(a.semaforo)}">${esc(a.semaforo === "rojo" ? "Urgente" : a.semaforo === "naranja" ? "Atencion" : "Seguir")}</span>
  </div>`;
}

async function screenInicioJugador() {
  crumbs("Inicio");
  const [carga, hidra, lesiones] = await Promise.all([
    API.get("/carga/jugador/" + yo()),
    API.get("/hidratacion/" + yo()),
    API.get("/lesiones/" + yo()),
  ]);
  const activa = lesiones.find(l => l.activa);
  const ultH = hidra[0];
  const acwr = carga.acwr_ewma ?? carga.acwr_ra;

  view().innerHTML = pageHead(`Hola, ${state.perfil.nombre}`, "Tu resumen de la semana") + `
    <div class="grid cols-3">
      ${kpi("Carga 7 dias", carga.carga_7d.toLocaleString("es") + " UA")}
      <div class="card kpi">
        <span class="k-label">ACWR (EWMA)</span>
        <span class="k-value tnum">${acwr ?? "–"}</span>
        <span class="chip ${esc(carga.semaforo)}" style="align-self:flex-start;margin-top:6px">${esc(zonaLabel(carga.zona))}</span>
      </div>
      ${activa
        ? `<div class="card kpi"><span class="k-label">Lesion</span>
           <span class="k-value" style="font-size:1.15rem">${esc(activa.diagnostico)}</span>
           <span class="chip ${esc(activa.semaforo)}" style="align-self:flex-start;margin-top:6px">${esc(activa.estado_label)}</span></div>`
        : kpi("Lesiones", "Sin lesion activa")}
    </div>

    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <h3>Tu carga · ultimos 28 dias</h3>
        <div style="height:220px"><canvas id="ch-mia"></canvas></div>
      </div>
      <div class="card">
        <h3>Ultima hidratacion</h3>
        ${ultH ? `
          <div class="metric-row" style="display:flex;align-items:flex-end;gap:14px;margin-bottom:10px">
            <span class="k-value tnum" style="font-family:'Archivo Narrow';font-weight:700;font-size:2rem">${ultH.porcentaje_perdida}%</span>
            <span class="muted">${esc(ultH.fecha)} · deficit ${ultH.deficit_kg} kg
            <br><span class="chip ${esc(ultH.semaforo)}">${esc(ultH.clasificacion)}</span></span>
          </div>
          ${ultH.deficit_kg > 0 ? `<p class="muted" style="font-size:.88rem">Reposicion sugerida: <b style="color:var(--verde)">${ultH.reposicion_min_l}–${ultH.reposicion_max_l} L</b></p>` : ""}
          <a class="btn ghost" href="#/hidratacion" style="display:inline-block;margin-top:8px;text-decoration:none">Cargar nuevo registro</a>
        ` : `<p class="muted">Todavia no cargaste ningun registro de hidratacion.</p>
          <a class="btn" href="#/hidratacion" style="display:inline-block;margin-top:8px;text-decoration:none">Cargar el primero</a>`}
      </div>
    </div>`;

  graficoCargaDiaria("ch-mia", carga.serie_diaria, { thin: true });
}

/* ======================================================================
   CARGA
   ====================================================================== */

function graficoCargaDiaria(canvasId, serie, opts = {}) {
  const valores = serie.map(d => d.carga);
  const conCarga = valores.filter(v => v > 0);
  const media = conCarga.length ? Math.round(conCarga.reduce((a, b) => a + b, 0) / conCarga.length) : 0;
  const datasets = [{
    type: "bar", label: "Carga", data: valores,
    backgroundColor: valores.map(v => colorPorCarga(v, media)),
    borderRadius: 3, maxBarThickness: opts.thin ? 14 : 40, order: 2,
  }];
  if (media) {
    datasets.push({
      type: "line", label: "Promedio", data: valores.map(() => media),
      borderColor: COL.ink, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, order: 1,
    });
  }
  chart(canvasId, {
    data: { labels: serie.map(d => ddmm(d.fecha)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ...ejeSinGrilla, ticks: { maxRotation: 0, autoSkip: true } },
        y: { ...ejeGrillaTenue, beginAtZero: true },
      },
      plugins: {
        tooltip: { filter: c => c.dataset.label === "Carga", callbacks: { label: c => c.parsed.y + " UA" } },
      },
    },
  });
}

let cargaDias = 7;

async function screenCarga() {
  destroyCharts();
  crumbs("Carga", "Carga del plantel");
  const r = await API.get("/carga/resumen?dias=" + cargaDias);
  const d = r.distribucion;
  const zonas = [
    ["Adecuada", d.adecuada, COL.verde],
    ["Atencion", d.atencion, COL.amarillo],
    ["Alta", d.alta, COL.naranja],
    ["Muy alta", d.muy_alta, COL.rojo],
  ].filter(z => z[1] > 0);
  const conDatos = r.por_jugador.length - d.sin_datos;

  view().innerHTML = pageHead("Carga del plantel", "Carga interna del equipo · ACWR y distribucion") + `
    <div class="grid cols-3">
      ${kpi(`Carga total · ${cargaDias} d`, r.totales.carga_total.toLocaleString("es") + " UA")}
      ${kpi("Carga media / jugador", r.totales.carga_promedio.toLocaleString("es") + " UA")}
      ${kpi("Sesiones", r.totales.sesiones)}
    </div>

    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0">Carga diaria del equipo</h3>
          <div class="seg" id="seg-dias">
            ${[7, 28].map(n => `<button type="button" data-n="${n}" class="${n === cargaDias ? "on" : ""}">${n} dias</button>`).join("")}
          </div>
        </div>
        <div style="height:250px;margin-top:12px"><canvas id="ch-serie"></canvas></div>
      </div>
      <div class="card">
        <h3>Distribucion por ACWR</h3>
        <p class="card-sub">Ratio carga aguda (7 d) : cronica (EWMA 28 d).</p>
        <div style="display:flex;gap:20px;align-items:center">
          <div style="position:relative;width:150px;height:150px;flex:0 0 auto">
            <canvas id="ch-dist"></canvas>
            <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
              <div><div style="font-family:'Archivo Narrow';font-weight:700;font-size:1.6rem;line-height:1">${conDatos}</div>
              <div class="muted" style="font-size:.72rem">jugadores</div></div>
            </div>
          </div>
          <div style="flex:1">
            ${zonas.map(z => leyenda(z[0], z[1], z[2])).join("")}
            ${d.sin_datos ? leyenda("Sin datos", d.sin_datos, COL.surface, true) : ""}
          </div>
        </div>
      </div>
    </div>

    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <h3>Carga media por posicion · 7 dias</h3>
        <div style="height:${Math.max(160, r.por_posicion.length * 42)}px;margin-top:10px"><canvas id="ch-pos"></canvas></div>
      </div>
      <div class="card">
        <h3>Jugadores con mayor carga · 7 dias</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Jugador</th><th style="text-align:right">Carga</th><th style="text-align:right">ACWR</th><th style="text-align:right">Zona</th></tr></thead>
          <tbody>${r.por_jugador.slice(0, 10).map(p => `<tr>
            <td><div class="cell-player">
              <span class="avatar">${esc(inicialesDe(p.nombre))}</span>
              <div><div class="cp-name">${esc(p.nombre)}</div><div class="cp-pos">${esc(p.posicion || "—")}</div></div>
            </div></td>
            <td style="text-align:right"><b class="tnum">${p.carga_7d.toLocaleString("es")}</b></td>
            <td style="text-align:right" class="tnum">${p.acwr_ewma ?? "–"}<span class="muted" style="font-size:.75rem"> · RA ${p.acwr_ra ?? "–"}</span></td>
            <td style="text-align:right"><span class="chip ${esc(p.semaforo)}">${esc(zonaLabel(p.zona))}</span></td>
          </tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>`;

  graficoCargaDiaria("ch-serie", r.serie_diaria, { thin: cargaDias > 14 });

  chart("ch-dist", {
    type: "doughnut",
    data: {
      labels: zonas.map(z => z[0]).concat(d.sin_datos ? ["Sin datos"] : []),
      datasets: [{
        data: zonas.map(z => z[1]).concat(d.sin_datos ? [d.sin_datos] : []),
        backgroundColor: zonas.map(z => z[2]).concat(d.sin_datos ? [COL.surface] : []),
        borderWidth: 0,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: "70%" },
  });

  chart("ch-pos", {
    type: "bar",
    data: {
      labels: r.por_posicion.map(p => p.posicion),
      datasets: [{ data: r.por_posicion.map(p => p.carga_promedio), backgroundColor: COL.accent, borderRadius: 3, maxBarThickness: 18 }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      scales: { x: { ...ejeGrillaTenue, beginAtZero: true }, y: ejeSinGrilla },
      plugins: { tooltip: { callbacks: { label: c => c.parsed.x + " UA" } } },
    },
  });

  $("#seg-dias").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    cargaDias = +b.dataset.n;
    screenCarga();
  });
}

function leyenda(nombre, valor, color, dim) {
  return `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:.86rem" class="${dim ? "muted" : ""}">
    <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};margin-right:8px"></span>${esc(nombre)}</span>
    <b class="tnum">${valor}</b>
  </div>`;
}

async function screenMiCarga() {
  crumbs("Mi carga");
  const [carga, ses] = await Promise.all([
    API.get("/carga/jugador/" + yo()),
    API.get("/sesiones/" + yo()),
  ]);
  const acwr = carga.acwr_ewma ?? carga.acwr_ra;

  view().innerHTML = pageHead("Mi carga", "Tu carga interna y relacion aguda:cronica") + `
    <div class="grid cols-3">
      ${kpi("Carga 7 dias", carga.carga_7d.toLocaleString("es") + " UA")}
      ${kpi("Carga 28 dias", carga.carga_28d.toLocaleString("es") + " UA")}
      <div class="card kpi">
        <span class="k-label">ACWR (EWMA / RA)</span>
        <span class="k-value tnum">${acwr ?? "–"} <span class="muted" style="font-size:1rem">/ ${carga.acwr_ra ?? "–"}</span></span>
        <span class="chip ${esc(carga.semaforo)}" style="align-self:flex-start;margin-top:6px">${esc(zonaLabel(carga.zona))}</span>
      </div>
    </div>
    <div class="card section-gap">
      <h3>Carga diaria · ultimos 28 dias</h3>
      <div style="height:240px"><canvas id="ch-mc"></canvas></div>
    </div>
    <div class="card section-gap">
      <h3>Ultimas sesiones</h3>
      ${ses.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Duracion</th><th>sRPE</th><th>Sueno</th><th style="text-align:right">Carga</th></tr></thead>
        <tbody>${ses.slice().reverse().slice(0, 12).map(s => `<tr>
          <td class="tnum muted">${esc(s.fecha)}</td>
          <td>${esc(s.tipo)}</td>
          <td class="tnum">${esc(s.duracion_min)} min</td>
          <td class="tnum">${esc(s.srpe)}</td>
          <td class="muted">${esc(s.sueno || "—")}</td>
          <td style="text-align:right"><b class="tnum">${esc(s.carga_total)} UA</b></td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="muted">Todavia no registraste sesiones. <a href="#/registro">Registrar la primera</a>.</p>`}
    </div>`;

  graficoCargaDiaria("ch-mc", carga.serie_diaria, { thin: true });
}

/* ======================================================================
   PLANTEL (CT)
   ====================================================================== */

async function screenPlantel() {
  crumbs("Plantel");
  const [js, lesiones] = await Promise.all([jugadores(), API.get("/lesiones?activas=1")]);
  const lesionPorJugador = {};
  lesiones.forEach(l => { lesionPorJugador[l.jugador_id] = l; });
  const fueraIds = new Set(lesiones.filter(l => ["lesionado", "disponible_entrenar"].includes(l.estado)).map(l => l.jugador_id));

  // conteo por posicion (orden fijo de la cancha)
  const conteo = Object.fromEntries(POSICIONES.map(p => [p, 0]));
  js.forEach(j => { if (j.posicion_principal in conteo) conteo[j.posicion_principal]++; });
  const posConDatos = POSICIONES.filter(p => conteo[p] > 0);

  view().innerHTML = pageHead("Plantel", "Resumen general y ficha de cada jugador") + `
    <div class="grid cols-2" style="align-items:start">
      <div class="grid cols-2" style="align-content:start">
        ${kpi("Jugadores", js.length)}
        ${kpi("Disponibles", js.length - fueraIds.size)}
        ${kpi("No disponibles", fueraIds.size, fueraIds.size ? "accent" : "")}
        ${kpi("Posiciones cubiertas", posConDatos.length + " / " + POSICIONES.length)}
      </div>
      <div class="card">
        <h3>Jugadores por posicion</h3>
        <div style="height:200px"><canvas id="ch-plantel-pos"></canvas></div>
      </div>
    </div>

    <div class="card section-gap">
      <h3>Jugadores</h3>
      ${js.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>Jugador</th><th>Posicion sec.</th><th>Edad</th><th style="text-align:right">Estado</th></tr></thead>
        <tbody>${js.map(j => {
          const les = lesionPorJugador[j.id];
          const chip = les ? `<span class="chip ${esc(les.semaforo)}">${esc(les.estado_label)}</span>` : `<span class="chip verde">Disponible</span>`;
          return `<tr class="clickable" data-id="${j.id}">
            <td class="num-col">${esc(j.numero_camiseta ?? "–")}</td>
            <td><div class="cell-player">
              <span class="avatar">${esc(iniciales(j.nombre, j.apellido))}</span>
              <div><div class="cp-name">${esc(nombreJugador(j))}</div>
              <div class="cp-pos">${esc(j.posicion_principal || "—")}</div></div>
            </div></td>
            <td class="muted">${esc(j.posicion_secundaria || "—")}</td>
            <td class="tnum">${esc(j.edad ?? "—")}</td>
            <td style="text-align:right">${chip}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>` : `<div class="empty"><div class="big">Todavia no hay jugadores</div>
        <p>Corre <code>python seed.py</code> para cargar un plantel de ejemplo.</p></div>`}
    </div>`;

  chart("ch-plantel-pos", {
    type: "bar",
    data: {
      labels: POSICIONES,
      datasets: [{ data: POSICIONES.map(p => conteo[p]), backgroundColor: COL.accent, borderRadius: 3, maxBarThickness: 34 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: ejeSinGrilla, y: { ...ejeGrillaTenue, beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { tooltip: { callbacks: { label: c => c.parsed.y + " jugador" + (c.parsed.y === 1 ? "" : "es") } } },
    },
  });

  view().querySelectorAll("tr.clickable").forEach(tr =>
    tr.addEventListener("click", () => { location.hash = "#/jugador/" + tr.dataset.id; }));
}

/* ======================================================================
   FICHA DEL JUGADOR (CT)
   ====================================================================== */

const FICHA_TABS = [["resumen", "Resumen"], ["carga", "Carga"], ["hidratacion", "Hidratacion"], ["lesiones", "Lesiones"]];
let _fichaCache = null;

async function screenFichaJugador(params) {
  const id = +(params && params[0]);
  if (!id) { location.hash = "#/plantel"; return; }
  const tab = (params && params[1]) || "resumen";
  crumbs("Plantel", nombreJugadorCorto(id));

  let j, carga;
  if (_fichaCache && _fichaCache.id === id) {
    ({ j, carga } = _fichaCache);
  } else {
    [j, carga] = await Promise.all([API.get("/jugadores/" + id), API.get("/carga/jugador/" + id)]);
    _fichaCache = { id, j, carga };
  }

  const lesiones = j.lesiones || [];
  const activas = lesiones.filter(l => l.activa);
  const peor = activas.sort((a, b) => a.fase_idx - b.fase_idx)[0];
  const estadoPill = peor
    ? `<span class="chip ${esc(peor.semaforo)}">${esc(peor.estado_label)}</span>`
    : `<span class="chip verde">Disponible</span>`;
  const diasSinLesion = calcDiasSinLesion(lesiones, activas);
  const diasBaja365 = lesiones
    .filter(l => (Date.now() - new Date(l.fecha_lesion)) < 365 * 86400000)
    .reduce((s, l) => s + (l.dias_baja || 0), 0);
  const dispTemporada = Math.max(0, Math.min(100, Math.round(100 - diasBaja365 / 3.65)));

  view().innerHTML = `
    <div class="ficha-head">
      <span class="ficha-foto" style="background-image:url('/api/jugadores/${id}/foto')">${j.foto ? "" : esc(iniciales(j.nombre, j.apellido))}</span>
      <div class="ficha-id">
        <div class="fh-num tnum">#${esc(j.numero_camiseta ?? "–")}</div>
        <h1>${esc(nombreJugador(j))}</h1>
        <p>${esc(j.posicion_principal || "—")}${j.posicion_secundaria ? " / " + esc(j.posicion_secundaria) : ""} · ${esc(j.edad ?? "—")} años${j.altura_cm ? " · " + esc((j.altura_cm / 100).toFixed(2)) + " m" : ""}${j.peso_kg ? " · " + esc(j.peso_kg) + " kg" : ""}${j.lateralidad ? " · " + esc(j.lateralidad) : ""}</p>
        <div style="margin-top:8px">${estadoPill}</div>
      </div>
      <div class="ficha-stats">
        ${miniStat("Disponibilidad", dispTemporada + "%", "temporada")}
        ${miniStat("Dias sin lesion", diasSinLesion ?? "—", diasSinLesion === null ? "lesion activa" : "")}
      </div>
      <a class="btn ghost" href="#/plantel" style="text-decoration:none">‹ Plantel</a>
    </div>

    <div class="ftabs" id="ficha-tabs">
      ${FICHA_TABS.map(t => `<button data-t="${t[0]}" class="${t[0] === tab ? "on" : ""}">${t[1]}</button>`).join("")}
    </div>
    <div id="ficha-panel"></div>`;

  $("#ficha-tabs").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b) location.hash = `#/jugador/${id}/${b.dataset.t}`;
  });

  renderFichaTab(tab, j, carga);
}

function nombreJugadorCorto(id) {
  if (_fichaCache && _fichaCache.id === id) return nombreJugador(_fichaCache.j);
  const cache = (state.jugadores || []).find(x => x.id === id);
  return cache ? nombreJugador(cache) : "Ficha";
}
function miniStat(label, valor, sub) {
  return `<div class="mini-stat">
    <span class="ms-v tnum">${esc(valor)}</span>
    <span class="ms-l">${esc(label)}</span>
    ${sub ? `<span class="ms-s">${esc(sub)}</span>` : ""}
  </div>`;
}
function calcDiasSinLesion(lesiones, activas) {
  if (activas.length) return null;
  const fines = lesiones
    .map(l => l.fecha_disponible_competir || l.fecha_alta || l.fecha_lesion)
    .filter(Boolean)
    .map(f => new Date(f));
  if (!fines.length) return null;
  const ultima = new Date(Math.max(...fines));
  return Math.max(0, Math.floor((Date.now() - ultima) / 86400000));
}

function renderFichaTab(tab, j, carga) {
  const panel = $("#ficha-panel");
  if (tab === "carga") return fichaTabCarga(panel, j, carga);
  if (tab === "hidratacion") return fichaTabHidra(panel, j);
  if (tab === "lesiones") return fichaTabLesiones(panel, j, carga);
  return fichaTabResumen(panel, j, carga);
}

function fichaTabResumen(panel, j, carga) {
  const acwr = carga.acwr_ewma ?? carga.acwr_ra;
  const activas = (j.lesiones || []).filter(l => l.activa);
  const hidra = j.hidratacion || [];
  panel.innerHTML = `
    <div class="grid cols-4">
      ${kpi("Carga 7 dias", carga.carga_7d.toLocaleString("es") + " UA")}
      ${kpi("Carga 28 dias", carga.carga_28d.toLocaleString("es") + " UA")}
      <div class="card kpi">
        <span class="k-label">ACWR (EWMA / RA)</span>
        <span class="k-value tnum">${acwr ?? "–"} <span class="muted" style="font-size:1rem">/ ${carga.acwr_ra ?? "–"}</span></span>
        <span class="chip ${esc(carga.semaforo)}" style="align-self:flex-start;margin-top:6px">${esc(zonaLabel(carga.zona))}</span>
      </div>
      ${kpi("Lesiones activas", activas.length, activas.length ? "accent" : "")}
    </div>
    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <h3>Perfil deportivo</h3>
        <div class="kv"><span class="muted">Posicion (ataque)</span><b>${esc(j.posicion_principal || "—")}${j.posicion_secundaria ? " / " + esc(j.posicion_secundaria) : ""}</b></div>
        <div class="kv"><span class="muted">Posicion defensiva</span><b>${esc(POS_DEFENSIVA_LABEL[j.posicion_defensiva] || "—")}</b></div>
        <div class="kv"><span class="muted">Mano habil</span><b>${esc(j.lateralidad || "—")}</b></div>
        <div class="kv"><span class="muted">Altura / peso</span><b>${j.altura_cm ? (j.altura_cm / 100).toFixed(2) + " m" : "—"} · ${j.peso_kg ? j.peso_kg + " kg" : "—"}</b></div>
        <div class="kv"><span class="muted">Numero</span><b>#${esc(j.numero_camiseta ?? "–")}</b></div>
      </div>
      <div class="card">
        <h3>Carga diaria · ultimos 28 dias</h3>
        <div style="height:200px"><canvas id="ch-fj-carga"></canvas></div>
      </div>
    </div>
    ${hidra.length ? `<div class="card section-gap"><h3>Ultima hidratacion</h3>
      <div style="display:flex;align-items:flex-end;gap:14px">
        <span class="tnum" style="font-family:'Archivo Narrow';font-weight:700;font-size:2rem">${hidra[0].porcentaje_perdida}%</span>
        <span class="muted">${esc(hidra[0].fecha)} · deficit ${hidra[0].deficit_kg} kg · <span class="chip ${esc(hidra[0].semaforo)}">${esc(hidra[0].clasificacion)}</span></span>
      </div></div>` : ""}`;
  graficoCargaDiaria("ch-fj-carga", carga.serie_diaria, { thin: true });
}

function fichaTabCarga(panel, j, carga) {
  const acwr = carga.acwr_ewma ?? carga.acwr_ra;
  panel.innerHTML = `
    <div class="grid cols-3">
      ${kpi("Carga 7 dias", carga.carga_7d.toLocaleString("es") + " UA")}
      ${kpi("Carga 28 dias", carga.carga_28d.toLocaleString("es") + " UA")}
      <div class="card kpi"><span class="k-label">ACWR (EWMA / RA)</span>
        <span class="k-value tnum">${acwr ?? "–"} / ${carga.acwr_ra ?? "–"}</span>
        <span class="chip ${esc(carga.semaforo)}" style="align-self:flex-start;margin-top:6px">${esc(zonaLabel(carga.zona))}</span></div>
    </div>
    <div class="card section-gap"><h3>Carga diaria · ultimos 28 dias</h3>
      <div style="height:260px"><canvas id="ch-fj-carga"></canvas></div></div>`;
  graficoCargaDiaria("ch-fj-carga", carga.serie_diaria, { thin: true });
}

function fichaTabHidra(panel, j) {
  const hidra = j.hidratacion || [];
  if (!hidra.length) { panel.innerHTML = `<div class="card"><p class="muted">Sin registros de hidratacion.</p></div>`; return; }
  panel.innerHTML = `
    <div class="card">
      <h3>Hidratacion</h3>
      <div style="display:flex;align-items:flex-end;gap:14px;margin-bottom:12px">
        <span class="tnum" style="font-family:'Archivo Narrow';font-weight:700;font-size:2.2rem">${hidra[0].porcentaje_perdida}%</span>
        <span class="muted">${esc(hidra[0].fecha)} · deficit ${hidra[0].deficit_kg} kg<br><span class="chip ${esc(hidra[0].semaforo)}">${esc(hidra[0].clasificacion)}</span></span>
      </div>
      ${hidra.length > 1 ? `<div style="height:170px;margin-bottom:12px"><canvas id="ch-fj-hidra"></canvas></div>` : ""}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Fecha</th><th>Contexto</th><th>Deficit</th><th style="text-align:right">% perdido</th></tr></thead>
        <tbody>${hidra.slice(0, 8).map(h => `<tr>
          <td class="tnum muted">${esc(h.fecha)}</td><td class="muted">${esc(h.contexto)}</td>
          <td class="tnum">${h.deficit_kg} kg</td>
          <td style="text-align:right"><span class="chip ${esc(h.semaforo)}">${h.porcentaje_perdida}%</span></td>
        </tr>`).join("")}</tbody></table></div>
    </div>`;
  if (hidra.length > 1) {
    const orden = hidra.slice().reverse();
    chart("ch-fj-hidra", {
      type: "line",
      data: { labels: orden.map(h => ddmm(h.fecha)), datasets: [{
        data: orden.map(h => h.porcentaje_perdida), borderColor: COL.accent, backgroundColor: "transparent",
        pointBackgroundColor: orden.map(h => COL[h.semaforo] || COL.ink), pointRadius: 3, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { x: ejeSinGrilla, y: { ...ejeGrillaTenue, beginAtZero: true, ticks: { callback: v => v + "%" } } },
        plugins: { tooltip: { callbacks: { label: c => c.parsed.y + "% perdido" } } } },
    });
  }
}

/* ---- ficha: pestaña Lesiones (dashboard) ---- */

const ZONAS_MI = ["isquio", "cuadriceps", "cuádriceps", "aductor", "gemelo", "gastrocnemio",
  "soleo", "sóleo", "tobillo", "rodilla", "tibial", "pantorrilla", "pie", "aquiles", "psoas", "recto femoral"];

// posicion aproximada de cada zona en el mapa corporal (viewBox 120 x 300)
const ZONA_MAPA = {
  hombro: { v: "ant", x: 84, y: 58 }, pecho: { v: "ant", x: 60, y: 74 },
  abdomen: { v: "ant", x: 60, y: 100 }, cadera: { v: "ant", x: 60, y: 122 },
  aductor: { v: "ant", x: 68, y: 140 }, cuadriceps: { v: "ant", x: 74, y: 162 },
  "cuádriceps": { v: "ant", x: 74, y: 162 }, "recto femoral": { v: "ant", x: 72, y: 158 },
  psoas: { v: "ant", x: 64, y: 128 }, rodilla: { v: "ant", x: 76, y: 202 },
  tibial: { v: "ant", x: 76, y: 230 }, tobillo: { v: "ant", x: 78, y: 262 },
  pie: { v: "ant", x: 80, y: 278 },
  lumbar: { v: "post", x: 60, y: 100 }, "isquiotibiales": { v: "post", x: 74, y: 168 },
  isquiotibial: { v: "post", x: 74, y: 168 }, isquio: { v: "post", x: 74, y: 168 },
  gemelo: { v: "post", x: 76, y: 232 }, gastrocnemio: { v: "post", x: 76, y: 232 },
  pantorrilla: { v: "post", x: 76, y: 232 }, "soleo": { v: "post", x: 76, y: 244 },
  "sóleo": { v: "post", x: 76, y: 244 }, aquiles: { v: "post", x: 78, y: 258 },
};

function zonaPos(zona, lado) {
  const z = (zona || "").toLowerCase().trim();
  let hit = ZONA_MAPA[z];
  if (!hit) { const k = Object.keys(ZONA_MAPA).find(k => z.includes(k)); hit = k ? ZONA_MAPA[k] : null; }
  if (!hit) return null;
  const izq = (lado || "").toLowerCase().includes("izq");
  return { v: hit.v, x: izq ? 120 - hit.x : hit.x, y: hit.y };
}

function siluetaSVG(marcas, vista) {
  const dots = marcas.filter(m => m.pos && m.pos.v === vista).map(m =>
    `<circle cx="${m.pos.x}" cy="${m.pos.y}" r="5.5" fill="var(--rojo)" stroke="var(--surface)" stroke-width="1.5"/>`).join("");
  return `<svg viewBox="0 0 120 300" role="img" aria-label="Mapa corporal de lesiones (${vista === "ant" ? "vista anterior" : "vista posterior"})" style="width:110px;height:auto">
    <g fill="var(--surface-2)" stroke="var(--line)" stroke-width="1">
      <circle cx="60" cy="24" r="13"/>
      <path d="M46 40 h28 l6 26 -4 30 -3 34 h-6 l-4 -30 h-6 l-4 30 h-6 l-3 -34 -4 -30 z"/>
      <path d="M44 44 l-12 8 -6 34 6 4 10 -32 z"/>
      <path d="M76 44 l12 8 6 34 -6 4 -10 -32 z"/>
      <path d="M48 128 l-4 60 -2 66 h9 l4 -62 3 -46 z"/>
      <path d="M72 128 l4 60 2 66 h-9 l-4 -62 -3 -46 z"/>
    </g>
    ${dots}
  </svg>`;
}

async function fichaTabLesiones(panel, j, carga) {
  const lesiones = (j.lesiones || []).slice().sort((a, b) => (b.fecha_lesion > a.fecha_lesion ? 1 : -1));
  const activas = lesiones.filter(l => l.activa);
  const total = lesiones.length;
  const diasTotBaja = lesiones.reduce((s, l) => s + (l.dias_baja || 0), 0);
  const diasSinLesion = calcDiasSinLesion(lesiones, activas);
  const puedeRTS = esLesiones();

  if (!total) {
    panel.innerHTML = `<div class="card"><p class="muted">Este jugador no tiene lesiones registradas.</p></div>`;
    return;
  }

  // historial por año
  const porAnio = {};
  lesiones.forEach(l => {
    const y = (l.fecha_lesion || "").slice(0, 4);
    if (y) porAnio[y] = (porAnio[y] || 0) + (l.dias_baja || 0);
  });
  const anios = Object.keys(porAnio).sort();

  // tiempo de baja por lesion (top)
  const porBaja = lesiones.slice().sort((a, b) => (b.dias_baja || 0) - (a.dias_baja || 0)).slice(0, 6);

  // mapa de zonas
  const porZona = {};
  lesiones.forEach(l => { const z = (l.zona || "sin zona").toLowerCase(); porZona[z] = (porZona[z] || 0) + 1; });
  const zonas = Object.entries(porZona).sort((a, b) => b[1] - a[1]);
  const marcas = lesiones.map(l => ({ zona: l.zona, pos: zonaPos(l.zona, l.lado) }));

  // factores de riesgo
  const miInf = lesiones.filter(l => ZONAS_MI.some(z => (l.zona || "").toLowerCase().includes(z))).length;
  const fHist = miInf >= 2 ? ["Alto", "rojo"] : miInf === 1 ? ["Moderado", "amarillo"] : ["Bajo", "verde"];
  const fCarga = carga.zona === "adecuada" ? ["Adecuada", "verde"]
    : carga.zona === "atencion" ? ["Atencion", "amarillo"] : ["Alta", "rojo"];
  const fRec = diasSinLesion === null || diasSinLesion < 30 ? ["Alto", "rojo"]
    : diasSinLesion < 90 ? ["Medio", "amarillo"] : ["Bajo", "verde"];

  // recomendaciones
  const recs = [];
  activas.forEach(l => { if (l.criterios_proxima) recs.push(l.criterios_proxima); });
  if (miInf >= 1) recs.push("Sostener el programa de fuerza excentrica del grupo muscular afectado.");
  if (carga.zona !== "adecuada") recs.push("Controlar la progresion de carga en los entrenamientos de alta intensidad.");
  recs.push("Reportar cualquier molestia temprana al cuerpo medico.");

  panel.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3>Resumen de lesiones</h3>
        <div style="display:flex;gap:22px;align-items:center">
          <div style="text-align:center">
            <div class="tnum" style="font-family:'Archivo Narrow';font-weight:700;font-size:3rem;line-height:1;color:var(--accent)">${total}</div>
            <div class="muted" style="font-size:.78rem">lesiones registradas</div>
          </div>
          <div style="flex:1">
            <div class="risk-row"><span class="muted">Actualmente lesionado</span><b class="tnum">${activas.length}</b></div>
            <div class="risk-row"><span class="muted">Dias sin lesion</span><b class="tnum">${diasSinLesion ?? "—"}</b></div>
            <div class="risk-row"><span class="muted">Dias totales de baja</span><b class="tnum">${diasTotBaja}</b></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Historial temporal</h3>
        <p class="card-sub">Dias de baja por año</p>
        <div style="height:180px"><canvas id="ch-inj-anio"></canvas></div>
      </div>
    </div>

    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <h3>Detalle de lesiones</h3>
        ${lesiones.map(l => `<div class="inj-row" data-lesion="${l.id}">
          <span class="inj-ico">✚</span>
          <div class="inj-main">
            <div class="d0 tnum">${esc(l.fecha_lesion)}</div>
            <div class="d1">${esc(l.diagnostico)}</div>
            <div class="d0">${esc(l.zona || "—")}${l.lado ? " · " + esc(l.lado) : ""}</div>
          </div>
          <div class="inj-right">
            <span class="chip ${esc(l.semaforo)}">${esc(l.estado_label)}</span>
            <div class="dias muted" style="font-size:.8rem;margin-top:4px">${l.dias_baja ?? "—"} dias${puedeRTS ? " ›" : ""}</div>
          </div>
        </div>`).join("")}
      </div>
      <div class="card">
        <h3>Mapa de lesiones</h3>
        <div class="seg" id="map-toggle" style="margin-bottom:12px">
          <button type="button" data-v="ant" class="on">Anterior</button>
          <button type="button" data-v="post">Posterior</button>
        </div>
        <div class="bodymap">
          <div id="body-svg">${siluetaSVG(marcas, "ant")}</div>
          <div class="zone-legend">
            ${zonas.map(([z, n]) => `<div><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--rojo);margin-right:7px"></span>${esc(z)}</span><b class="tnum">${n} (${Math.round(n / total * 100)}%)</b></div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <h3>Tiempo de baja por lesion</h3>
        <div style="height:${Math.max(140, porBaja.length * 34)}px"><canvas id="ch-inj-baja"></canvas></div>
      </div>
      <div class="card">
        <h3>Factores de riesgo</h3>
        <div class="risk-row"><span>Historial de lesiones en miembro inferior</span><span class="chip ${fHist[1]}">${fHist[0]}</span></div>
        <div class="risk-row"><span>Carga semanal actual</span><span class="chip ${fCarga[1]}">${fCarga[0]}</span></div>
        <div class="risk-row"><span>Riesgo por lesion reciente</span><span class="chip ${fRec[1]}">${fRec[0]}</span></div>
      </div>
    </div>

    <div class="card section-gap">
      <h3>Recomendaciones</h3>
      <ul class="recs-list">${recs.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
    </div>`;

  if (puedeRTS) {
    panel.querySelectorAll("[data-lesion]").forEach(el =>
      el.addEventListener("click", () => { location.hash = "#/lesion/" + el.dataset.lesion; }));
  }

  $("#map-toggle").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    $("#map-toggle").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    $("#body-svg").innerHTML = siluetaSVG(marcas, b.dataset.v);
  });

  chart("ch-inj-anio", {
    type: "bar",
    data: { labels: anios, datasets: [{ data: anios.map(a => porAnio[a]), backgroundColor: COL.accent, borderRadius: 3, maxBarThickness: 46 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: ejeSinGrilla, y: { ...ejeGrillaTenue, beginAtZero: true } },
      plugins: { tooltip: { callbacks: { label: c => c.parsed.y + " dias" } } },
    },
  });

  chart("ch-inj-baja", {
    type: "bar",
    data: {
      labels: porBaja.map(l => l.diagnostico.length > 22 ? l.diagnostico.slice(0, 21) + "…" : l.diagnostico),
      datasets: [{
        data: porBaja.map(l => l.dias_baja || 0),
        backgroundColor: porBaja.map(l => COL[l.semaforo] || COL.accent),
        borderRadius: 3, maxBarThickness: 18,
      }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      scales: { x: { ...ejeGrillaTenue, beginAtZero: true }, y: ejeSinGrilla },
      plugins: { tooltip: { callbacks: { label: c => c.parsed.x + " dias de baja" } } },
    },
  });
}

/* ======================================================================
   REGISTRO DE EVENTO (CT) - agenda entrenamientos y partidos
   ====================================================================== */

async function screenRegistroEvento() {
  crumbs("Registro");
  let tipo = "entrenamiento";
  const valores = await API.get("/eventos/valores").catch(() => ({ lugares: [], rivales: [] }));

  view().innerHTML = pageHead("Registro", "Agenda entrenamientos y partidos · se ven en el calendario") + `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <form id="form-evento" class="form-grid">
          <div class="field full"><label>Que se registra</label>
            <div class="seg" id="seg-evtipo">
              <button type="button" data-t="entrenamiento" class="on">${ICON_CONO} Entrenamiento</button>
              <button type="button" data-t="partido">${ICON_BALON} Partido</button>
            </div>
          </div>
          <div class="field"><label>Fecha</label><input id="e-fecha" type="date" value="${hoyISO()}" required></div>
          <div class="field"><label>Hora inicio</label><input id="e-hi" type="time" value="19:00"></div>
          <div class="field"><label>Hora fin</label><input id="e-hf" type="time"></div>

          <div class="field" id="wrap-condicion" hidden><label>Condicion</label>
            <div class="seg" id="seg-cond">
              <button type="button" data-c="local" class="on">Local</button>
              <button type="button" data-c="visitante">Visitante</button>
            </div>
          </div>
          <div class="field" id="wrap-rival" hidden><label>Rival</label>
            <input id="e-rival" list="dl-rivales" placeholder="Nombre del club">
            <datalist id="dl-rivales">${valores.rivales.map(r => `<option value="${esc(r)}">`).join("")}</datalist>
          </div>
          <div class="field full" id="wrap-lugar" hidden><label>Lugar / ciudad</label>
            <input id="e-lugar" list="dl-lugares" placeholder="Estadio, ciudad…">
            <datalist id="dl-lugares">${valores.lugares.map(l => `<option value="${esc(l)}">`).join("")}</datalist>
            <span class="hint">Los lugares y rivales que cargues quedan guardados para la proxima.</span>
          </div>

          <div class="field full"><label>Notas (opcional)</label><textarea id="e-notas" placeholder="Detalles del entrenamiento o del partido…"></textarea></div>
          <div class="field full"><button class="btn" type="submit">Agendar</button></div>
          <div class="field full"><div id="evento-msg" class="notice ok" hidden></div></div>
        </form>
      </div>
      <div class="card">
        <h3>Proximos eventos</h3>
        <div id="proximos"><p class="muted">Cargando…</p></div>
      </div>
    </div>`;

  let condicion = "local";

  function refrescarCampos() {
    const esPartido = tipo === "partido";
    ["wrap-condicion", "wrap-rival", "wrap-lugar"].forEach(w => { $("#" + w).hidden = !esPartido; });
    $("#seg-evtipo").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.t === tipo));
  }
  $("#seg-evtipo").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    tipo = b.dataset.t;
    refrescarCampos();
  });
  $("#seg-cond").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    condicion = b.dataset.c;
    $("#seg-cond").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  });
  refrescarCampos();
  cargarProximos();

  $("#form-evento").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("#evento-msg");
    const esPartido = tipo === "partido";
    const rival = $("#e-rival").value.trim();
    const payload = {
      fecha: $("#e-fecha").value,
      tipo,
      titulo: esPartido ? (rival ? "vs " + rival : "Partido") : "Entrenamiento",
      hora_inicio: $("#e-hi").value || null,
      hora_fin: $("#e-hf").value || null,
      condicion: esPartido ? condicion : null,
      lugar: esPartido ? ($("#e-lugar").value.trim() || null) : null,
      rival: esPartido ? (rival || null) : null,
      notas: $("#e-notas").value.trim() || null,
    };
    try {
      await API.post("/eventos", payload);
      msg.className = "notice ok";
      msg.textContent = "Evento agendado. Ya aparece en el calendario.";
      msg.hidden = false;
      $("#e-notas").value = "";
      $("#e-rival").value = "";
      $("#e-lugar").value = "";
      cargarProximos();
    } catch (e) {
      msg.className = "notice err";
      msg.textContent = e.message;
      msg.hidden = false;
    }
  });
}

async function cargarProximos() {
  const box = $("#proximos");
  const hoy = hoyISO();
  const hasta = isoLocal(new Date(Date.now() + 45 * 86400000));
  const evs = await API.get(`/eventos?desde=${hoy}&hasta=${hasta}`);
  if (!evs.length) { box.innerHTML = `<p class="muted">No hay eventos agendados.</p>`; return; }
  box.innerHTML = `<div class="table-wrap"><table class="table"><tbody>${evs.slice(0, 12).map(e => `<tr>
    <td class="tnum muted" style="white-space:nowrap">${esc(ddmm(e.fecha))}${e.hora_inicio ? " · " + esc(e.hora_inicio) : ""}</td>
    <td><span class="chip ${esc(e.tipo)}" style="background:none;padding:0;color:var(--ink)">${esc(e.titulo)}</span>
      ${e.condicion ? `<span class="muted"> · ${esc(e.condicion)}</span>` : ""}
      ${e.lugar ? `<span class="muted"> · ${esc(e.lugar)}</span>` : ""}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

/* ======================================================================
   REGISTRO DE SESION (jugador)
   ====================================================================== */

async function screenRegistro() {
  crumbs("Registrar sesion");
  let tipo = "Entrenamiento";

  view().innerHTML = pageHead("Registrar sesion", "Tu carga interna del dia (duracion x sRPE)") + `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3>Datos de la sesion</h3>
        <form id="form-sesion" class="form-grid">
          <div class="field"><label>Fecha</label><input id="f-fecha" type="date" value="${hoyISO()}" required></div>
          <div class="field"><label>Tipo</label>
            <select id="f-tipo">${TIPOS_SESION.map(t => `<option>${t}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Duracion (min)</label><input id="f-dur" type="number" min="1" value="90" required></div>
          <div class="field"><label>sRPE (1–10)</label><input id="f-srpe" type="number" min="1" max="10" value="7" required></div>
          <div class="field full"><label>Calidad de sueno (noche previa)</label>
            <select id="f-sueno">
              <option value="">— elegir —</option>
              ${SUENO_OPCIONES.map(s => `<option>${esc(s)}</option>`).join("")}
            </select>
          </div>
          <div class="field full"><label>Carga calculada</label>
            <div class="calc-box"><span class="cb-value tnum" id="calc">630</span>
            <span class="cb-formula" id="calc-f">90 min x 7 = 630 UA</span></div>
          </div>
          <div class="field full"><label>Notas (opcional)</label><textarea id="f-notas" placeholder="Observaciones de la sesion…"></textarea></div>
          <div class="field full"><button class="btn" type="submit">Guardar sesion</button></div>
          <div class="field full"><div id="sesion-msg" class="notice ok" hidden></div></div>
        </form>
      </div>
      <div class="card">
        <h3>Tus ultimas sesiones</h3>
        <div id="hist-sesiones"><p class="muted">Cargando…</p></div>
      </div>
    </div>`;

  const dur = $("#f-dur"), srpe = $("#f-srpe"), calc = $("#calc"), calcF = $("#calc-f");
  function recalcular() {
    const d = +dur.value || 0, s = +srpe.value || 0;
    calc.textContent = d * s;
    calcF.textContent = `${d} min x ${s} = ${d * s} UA`;
  }
  dur.addEventListener("input", recalcular);
  srpe.addEventListener("input", recalcular);

  $("#f-tipo").addEventListener("change", e => { tipo = e.target.value; });

  cargarHistSesiones();

  $("#form-sesion").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("#sesion-msg");
    try {
      const r = await API.post("/sesiones", {
        fecha: $("#f-fecha").value,
        tipo,
        duracion_min: +dur.value,
        srpe: +srpe.value,
        sueno: $("#f-sueno").value || null,
        notas: $("#f-notas").value,
      });
      msg.className = "notice ok";
      msg.textContent = `Sesion guardada · ${r.carga_total} UA`;
      msg.hidden = false;
      $("#f-notas").value = "";
      cargarHistSesiones();
    } catch (e) {
      msg.className = "notice err";
      msg.textContent = e.message;
      msg.hidden = false;
    }
  });
}

async function cargarHistSesiones() {
  const box = $("#hist-sesiones");
  const ses = await API.get("/sesiones/" + yo());
  if (!ses.length) { box.innerHTML = `<p class="muted">Todavia no registraste sesiones.</p>`; return; }
  box.innerHTML = `<div class="table-wrap"><table class="table"><tbody>${
    ses.slice().reverse().slice(0, 8).map(s => `<tr>
      <td class="tnum muted">${esc(s.fecha)}</td>
      <td>${esc(s.tipo)}</td>
      <td class="tnum">${esc(s.duracion_min)}′ · sRPE ${esc(s.srpe)}</td>
      <td style="text-align:right"><b class="tnum">${esc(s.carga_total)} UA</b></td>
    </tr>`).join("")
  }</tbody></table></div>`;
}

/* ======================================================================
   HIDRATACION (jugador)
   ====================================================================== */

async function screenHidratacion() {
  crumbs("Hidratacion");
  let contexto = "partido";

  view().innerHTML = pageHead("Hidratacion", "Peso pre/post y reposicion (ACSM / AMSSM)") + `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3>Nuevo registro</h3>
        <form id="form-hidra" class="form-grid">
          <div class="field"><label>Fecha</label><input id="h-fecha" type="date" value="${hoyISO()}" required></div>
          <div class="field"><label>Contexto</label>
            <div class="seg" id="seg-ctx">
              <button type="button" data-c="partido" class="on">Partido</button>
              <button type="button" data-c="entrenamiento">Entrenamiento</button>
            </div>
          </div>
          <div class="field"><label>Peso pre (kg)</label><input id="h-pre" type="number" step="0.1" min="1" required></div>
          <div class="field"><label>Peso post (kg)</label><input id="h-post" type="number" step="0.1" min="1" required></div>
          <div class="field"><label>Liquido ingerido (L) · opcional</label><input id="h-liq" type="number" step="0.1" min="0"></div>
          <div class="field"><label>Duracion (min) · opcional</label><input id="h-dur" type="number" min="1"></div>
          <div class="field"><label>Horas a la proxima competencia · opcional</label><input id="h-prox" type="number" step="0.5" min="0"></div>
          <div class="field" style="justify-content:flex-end">
            <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0">
              <input id="h-salado" type="checkbox" style="width:auto"> Sudador salado
            </label>
          </div>
          <div class="field full"><label>% de perdida (estimado)</label>
            <div class="calc-box"><span class="cb-value tnum" id="h-calc">–</span>
            <span class="cb-formula">(peso pre − peso post) / peso pre × 100</span></div>
          </div>
          <div class="field full"><label>Notas (opcional)</label><textarea id="h-notas"></textarea></div>
          <div class="field full"><button class="btn" type="submit">Guardar registro</button></div>
          <div class="field full"><div id="hidra-msg" class="notice err" hidden></div></div>
        </form>
      </div>
      <div class="card">
        <h3>Resultado</h3>
        <div id="hidra-out"><p class="muted">Cargá un registro y vas a ver acá la clasificacion, la reposicion recomendada y las indicaciones.</p></div>
        <div id="hidra-hist" class="section-gap"></div>
      </div>
    </div>`;

  const pre = $("#h-pre"), post = $("#h-post"), calc = $("#h-calc");
  function preview() {
    const a = +pre.value, b = +post.value;
    calc.textContent = (a > 0 && b > 0 && a > b) ? ((a - b) / a * 100).toFixed(2) + "%" : "–";
  }
  pre.addEventListener("input", preview);
  post.addEventListener("input", preview);

  $("#seg-ctx").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    contexto = b.dataset.c;
    $("#seg-ctx").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  });

  cargarHistHidra();

  $("#form-hidra").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("#hidra-msg");
    msg.hidden = true;
    try {
      const r = await API.post("/hidratacion", {
        fecha: $("#h-fecha").value,
        contexto,
        peso_pre_kg: +pre.value,
        peso_post_kg: +post.value,
        liquido_ingerido_l: $("#h-liq").value ? +$("#h-liq").value : null,
        duracion_min: $("#h-dur").value ? +$("#h-dur").value : null,
        horas_prox_competencia: $("#h-prox").value ? +$("#h-prox").value : null,
        sudador_salado: $("#h-salado").checked,
        notas: $("#h-notas").value,
      });
      renderHidraResultado(r);
      cargarHistHidra();
    } catch (e) {
      msg.textContent = e.message;
      msg.hidden = false;
    }
  });
}

function renderHidraResultado(r) {
  const etiqueta = {
    sin_perdida: "Sin perdida", minima: "Minima", moderada: "Moderada",
    marcada: "Marcada", severa: "Severa",
  }[r.clasificacion] || r.clasificacion;

  $("#hidra-out").innerHTML = `
    <div class="result ${esc(r.semaforo)}">
      <div class="r-row">
        <span class="r-big tnum">${r.porcentaje_perdida}<span style="font-size:1rem">%</span></span>
        <span class="muted">peso corporal perdido<br>deficit ${r.deficit_kg} kg · <span class="chip ${esc(r.semaforo)}">${esc(etiqueta)}</span></span>
      </div>
      ${r.deficit_kg > 0 ? `<div class="calc-box">
        <span class="cb-value tnum" style="color:var(--verde)">${r.reposicion_min_l} – ${r.reposicion_max_l} L</span>
        <span class="cb-formula">reposicion recomendada · 125–150% del deficit</span>
      </div>` : ""}
      ${r.recomendaciones && r.recomendaciones.length ? `<ul>
        ${r.recomendaciones.map((t, i) => `<li class="${i === 0 && r.clasificacion === "severa" ? "crit" : ""}">${esc(t)}</li>`).join("")}
      </ul>` : ""}
    </div>`;
}

async function cargarHistHidra() {
  const box = $("#hidra-hist");
  if (!box) return;
  const hist = await API.get("/hidratacion/" + yo());
  if (!hist.length) { box.innerHTML = `<p class="muted">Sin registros previos.</p>`; return; }

  const rows = hist.slice(0, 6).map(h => `<tr>
    <td class="tnum muted">${esc(h.fecha)}</td>
    <td class="muted">${esc(h.contexto)}</td>
    <td class="tnum">${h.deficit_kg} kg</td>
    <td style="text-align:right"><span class="chip ${esc(h.semaforo)}">${h.porcentaje_perdida}%</span></td>
  </tr>`).join("");

  box.innerHTML = `<h3 style="font-size:.95rem">Historial · % de perdida</h3>
    ${hist.length > 1 ? `<div style="height:150px;margin-bottom:10px"><canvas id="ch-hidra"></canvas></div>` : ""}
    <div class="table-wrap"><table class="table"><tbody>${rows}</tbody></table></div>`;

  if (hist.length > 1) {
    const orden = hist.slice().reverse();
    chart("ch-hidra", {
      type: "line",
      data: {
        labels: orden.map(h => ddmm(h.fecha)),
        datasets: [{
          data: orden.map(h => h.porcentaje_perdida),
          borderColor: COL.accent, backgroundColor: "transparent",
          pointBackgroundColor: orden.map(h => COL[h.semaforo] || COL.ink),
          pointRadius: 4, tension: 0.3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: ejeSinGrilla, y: { ...ejeGrillaTenue, beginAtZero: true, ticks: { callback: v => v + "%" } } },
        plugins: { tooltip: { callbacks: { label: c => c.parsed.y + "% perdido" } } },
      },
    });
  }
}

/* ======================================================================
   MIS LESIONES (jugador)
   ====================================================================== */

async function screenMisLesiones() {
  crumbs("Mis lesiones");
  const lesiones = await API.get("/lesiones/" + yo());
  const activas = lesiones.filter(l => l.activa);
  const historial = lesiones.filter(l => !l.activa);

  view().innerHTML = pageHead("Mis lesiones", "Tu estado de retorno e historial") + `
    ${activas.length ? activas.map(fichaLesionActiva).join("") : `<div class="card"><p class="muted">No tenes lesiones activas.</p></div>`}
    <div class="card section-gap">
      <h3>Historial</h3>
      ${historial.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Diagnostico</th><th>Zona</th><th>Fecha</th><th style="text-align:right">Dias de baja</th></tr></thead>
        <tbody>${historial.map(l => `<tr>
          <td>${esc(l.diagnostico)}</td>
          <td class="muted">${esc(l.zona || "—")}${l.lado ? " · " + esc(l.lado) : ""}</td>
          <td class="tnum muted">${esc(l.fecha_lesion)}</td>
          <td style="text-align:right"><b class="tnum">${l.dias_baja ?? "—"}</b></td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="muted">Sin lesiones previas registradas.</p>`}
    </div>`;
}

const ESTADOS_RTS = ["lesionado", "disponible_entrenar", "disponible_competir", "alta"];
const ESTADO_RTS_LABEL = {
  lesionado: "Lesionado", disponible_entrenar: "Disponible para entrenar",
  disponible_competir: "Disponible para competir", alta: "Alta deportiva",
};
const ESTADO_RTS_LIDER = {
  lesionado: "Lidera el fisioterapeuta", disponible_entrenar: "Habilita el médico deportólogo",
  disponible_competir: "Decisión compartida con el jugador", alta: "Caso cerrado",
};

function stepperRTS(estadoActual) {
  const idx = ESTADOS_RTS.indexOf(estadoActual);
  return `<div class="rts">
    ${ESTADOS_RTS.map((e, i) => `<div class="rts-step ${i < idx ? "done" : ""} ${i === idx ? "now" : ""}">
      <span class="rts-dot">${i < idx ? "✓" : i + 1}</span>
      <span class="rts-lbl">${ESTADO_RTS_LABEL[e]}</span>
    </div>`).join('<span class="rts-line"></span>')}
  </div>`;
}

function fichaLesionActiva(l) {
  const est = l.dias_estimados || 0;
  const dia = l.dia_actual ?? 0;
  const pct = est ? Math.min(100, Math.round((dia / est) * 100)) : 0;
  return `<div class="card" style="border-color:color-mix(in srgb, var(--${l.semaforo}) 45%, var(--line))">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
      <h3 style="margin:0">${esc(l.diagnostico)}</h3>
      <span class="chip ${esc(l.semaforo)}">${esc(l.estado_label)}</span>
    </div>
    <p class="muted" style="font-size:.9rem;margin-bottom:12px">${esc(l.zona || "")}${l.lado ? " · " + esc(l.lado) : ""}${l.mecanismo ? " · " + esc(l.mecanismo) : ""} · desde ${esc(l.fecha_lesion)}</p>
    ${stepperRTS(l.estado)}
    <p class="muted" style="font-size:.8rem;margin:8px 0 0">${ESTADO_RTS_LIDER[l.estado]}</p>
    ${est ? `<div class="track"><i style="width:${pct}%;background:var(--${l.semaforo})"></i></div>
      <div class="track-l"><span>Dia ${dia}</span><span>estimado ~${est} dias</span></div>` : ""}
    ${l.criterios_proxima ? `<p style="font-size:.86rem;margin-top:10px"><b>Para avanzar:</b> ${esc(l.criterios_proxima)}</p>` : ""}
  </div>`;
}

/* ======================================================================
   LESIONES + RETORNO AL JUEGO  (departamento medico)
   ====================================================================== */

async function screenLesionesCT() {
  crumbs("Lesiones");
  const lesiones = await API.get("/lesiones");
  const activas = lesiones.filter(l => l.activa);
  const cerradas = lesiones.filter(l => !l.activa);
  const puede = esLesiones();

  const filaLes = l => `<tr class="clickable" data-id="${l.id}">
    <td><div class="cell-player">
      <span class="avatar">${esc(inicialesDe(l.jugador_nombre))}</span>
      <div><div class="cp-name">${esc(l.jugador_nombre)}</div><div class="cp-pos">${esc(l.diagnostico)}</div></div>
    </div></td>
    <td class="muted">${esc(l.zona || "—")}${l.lado ? " · " + esc(l.lado) : ""}</td>
    <td class="tnum">${l.activa ? "dia " + (l.dia_actual ?? "—") : (l.dias_baja ?? "—") + " d baja"}${l.dias_estimados && l.activa ? " / ~" + l.dias_estimados : ""}</td>
    <td style="text-align:right"><span class="chip ${esc(l.semaforo)}">${esc(l.estado_label)}</span></td>
  </tr>`;

  view().innerHTML = pageHead("Lesiones y retorno al juego", "Continuo de retorno · departamento medico") + `
    <div class="grid cols-4">
      ${kpi("Activas", activas.length, activas.length ? "accent" : "")}
      ${kpi("En rehabilitacion", activas.filter(l => l.estado === "lesionado").length)}
      ${kpi("Entrenando adaptado", activas.filter(l => l.estado === "disponible_entrenar").length)}
      ${kpi("Habilitados a competir", activas.filter(l => l.estado === "disponible_competir").length)}
    </div>
    <div class="card section-gap">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Lesiones activas</h3>
        ${puede ? `<button class="btn" id="btn-nueva-lesion">+ Registrar lesion</button>` : ""}
      </div>
      ${activas.length ? `<div class="table-wrap"><table class="table"><tbody>${activas.map(filaLes).join("")}</tbody></table></div>`
        : `<p class="muted" style="margin-top:12px">Ningun jugador con lesion activa.</p>`}
    </div>
    ${cerradas.length ? `<div class="card section-gap">
      <h3>Casos cerrados</h3>
      <div class="table-wrap"><table class="table"><tbody>${cerradas.map(filaLes).join("")}</tbody></table></div>
    </div>` : ""}`;

  view().querySelectorAll("tr.clickable").forEach(tr =>
    tr.addEventListener("click", () => { location.hash = "#/lesion/" + tr.dataset.id; }));
  if (puede) $("#btn-nueva-lesion").addEventListener("click", modalNuevaLesion);
}

async function modalNuevaLesion() {
  const js = await jugadores();
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">
    <h3>Registrar lesion</h3>
    <div class="form-grid">
      <div class="field full"><label>Jugador</label><select id="nl-jug" required>
        <option value="">Elegir…</option>
        ${js.map(j => `<option value="${j.id}">${esc(nombreJugador(j))} · ${esc(j.posicion_principal || "—")}</option>`).join("")}
      </select></div>
      <div class="field"><label>Fecha</label><input id="nl-fecha" type="date" value="${hoyISO()}"></div>
      <div class="field"><label>Dias estimados</label><input id="nl-dias" type="number" min="1"></div>
      <div class="field full"><label>Diagnostico</label><input id="nl-dx" placeholder="Ej: Desgarro isquiotibial grado 2"></div>
      <div class="field"><label>Zona</label><input id="nl-zona"></div>
      <div class="field"><label>Lado</label><select id="nl-lado"><option value="">—</option><option>izquierdo</option><option>derecho</option><option>bilateral</option></select></div>
      <div class="field"><label>Mecanismo</label><select id="nl-mec"><option value="">—</option><option>entrenamiento</option><option>partido</option><option>gimnasio</option><option>fuera del club</option></select></div>
      <div class="field" style="justify-content:flex-end"><label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0"><input id="nl-contacto" type="checkbox" style="width:auto"> Con contacto</label></div>
      <div class="field full"><label>Criterios para pasar a la proxima fase</label><textarea id="nl-crit" placeholder="Fuerza, dolor, tests funcionales…"></textarea></div>
      <div class="field full"><div id="nl-msg" class="notice err" hidden></div></div>
    </div>
    <div class="modal-actions">
      <span class="spacer"></span>
      <button class="btn ghost" id="nl-cancel">Cancelar</button>
      <button class="btn" id="nl-save">Registrar</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const cerrar = () => bg.remove();
  bg.addEventListener("click", e => { if (e.target === bg) cerrar(); });
  $("#nl-cancel", bg).onclick = cerrar;
  $("#nl-save", bg).onclick = async () => {
    const msg = $("#nl-msg", bg);
    try {
      const r = await API.post("/lesiones", {
        jugador_id: +$("#nl-jug", bg).value,
        fecha_lesion: $("#nl-fecha", bg).value,
        diagnostico: $("#nl-dx", bg).value.trim(),
        zona: $("#nl-zona", bg).value.trim() || null,
        lado: $("#nl-lado", bg).value || null,
        mecanismo: $("#nl-mec", bg).value || null,
        contacto: $("#nl-contacto", bg).checked,
        dias_estimados: $("#nl-dias", bg).value ? +$("#nl-dias", bg).value : null,
        criterios_proxima: $("#nl-crit", bg).value.trim() || null,
      });
      cerrar();
      location.hash = "#/lesion/" + r.id;
    } catch (e) {
      msg.textContent = e.message;
      msg.hidden = false;
    }
  };
}

async function screenLesionRTS(params) {
  const id = +(params && params[0]);
  if (!id) { location.hash = "#/lesiones"; return; }
  crumbs("Lesiones", "Retorno al juego");
  const l = await API.get("/lesion/" + id);
  const puede = esLesiones();
  const esMedico = ["medico", "cuerpo_tecnico"].includes(state.perfil.rol);
  const idx = ESTADOS_RTS.indexOf(l.estado);
  const siguiente = ESTADOS_RTS[idx + 1];
  const anterior = ESTADOS_RTS[idx - 1];
  const puedeAvanzar = puede && siguiente && (esMedico || !["disponible_competir", "alta"].includes(siguiente));

  view().innerHTML = `
    <div class="page-head">
      <div class="glyph">◆</div>
      <div>
        <h1 style="text-transform:none">${esc(l.diagnostico)}</h1>
        <p><a href="#/jugador/${l.jugador_id}">${esc(l.jugador_nombre)}</a> · ${esc(l.zona || "—")}${l.lado ? " · " + esc(l.lado) : ""}${l.mecanismo ? " · " + esc(l.mecanismo) : ""} · desde ${esc(l.fecha_lesion)}</p>
      </div>
      <span class="spacer" style="flex:1"></span>
      <a class="btn ghost" href="#/lesiones" style="text-decoration:none;align-self:flex-start">‹ Lesiones</a>
    </div>

    <div class="card">
      <h3>Continuo de retorno</h3>
      ${stepperRTS(l.estado)}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;flex-wrap:wrap;gap:10px">
        <div>
          <span class="chip ${esc(l.semaforo)}">${esc(l.estado_label)}</span>
          <span class="muted" style="font-size:.85rem;margin-left:8px">${ESTADO_RTS_LIDER[l.estado]}${l.activa ? " · dia " + (l.dia_actual ?? "—") + (l.dias_estimados ? " de ~" + l.dias_estimados : "") : ""}</span>
        </div>
        ${puede ? `<div style="display:flex;gap:8px">
          ${anterior ? `<button class="btn ghost" id="rts-atras" style="padding:8px 14px">‹ ${esc(ESTADO_RTS_LABEL[anterior])}</button>` : ""}
          ${siguiente ? `<button class="btn" id="rts-avanzar" style="padding:8px 14px" ${puedeAvanzar ? "" : "disabled title='Solo el medico habilita esta fase'"}>Avanzar a ${esc(ESTADO_RTS_LABEL[siguiente])} ›</button>` : ""}
        </div>` : ""}
      </div>
      ${puede && siguiente && !puedeAvanzar ? `<p class="muted" style="font-size:.8rem;margin-top:8px">La habilitacion para competir y el alta las firma el medico deportologo.</p>` : ""}
    </div>

    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <h3>Criterios de la proxima compuerta</h3>
        <p id="rts-crit" style="font-size:.92rem">${l.criterios_proxima ? esc(l.criterios_proxima) : `<span class="muted">Sin criterios definidos.</span>`}</p>
        ${puede ? `<button class="btn ghost" id="rts-edit-crit" style="padding:7px 12px;font-size:.82rem">Editar criterios</button>` : ""}
      </div>
      <div class="card">
        <h3>Datos de la lesion</h3>
        <div class="kv"><span class="muted">Gravedad</span><b>${esc(l.gravedad || "—")}</b></div>
        <div class="kv"><span class="muted">Contacto</span><b>${l.contacto ? "Si" : "No"}</b></div>
        <div class="kv"><span class="muted">Dias estimados</span><b>${esc(l.dias_estimados ?? "—")}</b></div>
        <div class="kv"><span class="muted">Dias de baja</span><b>${esc(l.dias_baja ?? "—")}</b></div>
      </div>
    </div>

    <div class="card section-gap">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Estudios y archivos</h3>
        ${puede ? `<button class="btn ghost" id="rts-subir" style="padding:7px 12px;font-size:.82rem">+ Subir archivo</button>
          <input type="file" id="rts-file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden>` : ""}
      </div>
      <div id="rts-archivos" style="margin-top:12px">${renderArchivosRTS(l.archivos)}</div>
      <p class="muted" style="font-size:.76rem;margin:10px 0 0">PDF o imagen (RM, ecografia, laboratorio), hasta 15 MB.</p>
    </div>

    <div class="card section-gap">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Historia del caso</h3>
        ${puede ? `<button class="btn ghost" id="rts-nota" style="padding:7px 12px;font-size:.82rem">+ Agregar nota</button>` : ""}
      </div>
      <div id="rts-timeline" style="margin-top:12px">${renderTimelineRTS(l.timeline)}</div>
    </div>`;

  bindArchivosRTS(id, () => screenLesionRTS([String(id)]));

  if (!puede) return;

  const recargar = () => screenLesionRTS([String(id)]);

  const btnAv = $("#rts-avanzar");
  if (btnAv && puedeAvanzar) btnAv.onclick = async () => {
    const nota = prompt(`Nota para el cambio a "${ESTADO_RTS_LABEL[siguiente]}" (opcional):`) || null;
    await API.post(`/lesion/${id}/estado`, { estado: siguiente, nota });
    recargar();
  };
  const btnAtras = $("#rts-atras");
  if (btnAtras) btnAtras.onclick = async () => {
    if (!confirm(`Volver a "${ESTADO_RTS_LABEL[anterior]}"?`)) return;
    await API.post(`/lesion/${id}/estado`, { estado: anterior });
    recargar();
  };
  $("#rts-edit-crit").onclick = async () => {
    const v = prompt("Criterios para avanzar a la proxima fase:", l.criterios_proxima || "");
    if (v === null) return;
    await API.put(`/lesion/${id}`, { criterios_proxima: v });
    recargar();
  };
  $("#rts-nota").onclick = async () => {
    const v = prompt("Nota / observacion:");
    if (!v) return;
    await API.post(`/lesion/${id}/nota`, { texto: v });
    recargar();
  };
}

function renderTimelineRTS(timeline) {
  if (!timeline || !timeline.length) return `<p class="muted">Sin registros.</p>`;
  return `<div class="tl">${timeline.map(t => `<div class="tl-item ${t.tipo === "estado" ? "estado" : ""}">
    <div class="tl-meta">
      <span class="tl-fecha tnum">${esc((t.fecha || "").slice(0, 16).replace("T", " "))}</span>
      <span class="tl-autor">${esc(t.autor_nombre || "—")}</span>
      ${t.autor_rol ? `<span class="chip gris" style="font-size:.66rem">${esc(ROL_LABEL[t.autor_rol] || t.autor_rol)}</span>` : ""}
    </div>
    <div class="tl-texto">${t.tipo === "estado" ? `<b>${esc(t.texto || ESTADO_RTS_LABEL[t.estado] || "")}</b>` : esc(t.texto || "")}</div>
  </div>`).join("")}</div>`;
}

/* ---- archivos adjuntos a la lesion ---- */

function fmtTamano(b) {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function renderArchivosRTS(archivos) {
  if (!archivos || !archivos.length) return `<p class="muted" style="font-size:.88rem">Todavia no hay estudios cargados.</p>`;
  const puede = esLesiones();
  return `<div class="arch-list">${archivos.map(a => `<div class="arch-item">
    <span class="arch-ic">${a.tipo === "pdf" ? "PDF" : "IMG"}</span>
    <div class="arch-main">
      <div class="arch-t">${esc(a.titulo || a.nombre_original)}</div>
      <div class="arch-sub">${esc(fmtTamano(a.tamano))} · ${esc(a.subido_por_nombre || "—")} · ${esc((a.subido_en || "").slice(0, 10))}</div>
    </div>
    <div class="arch-act">
      <button class="lnk" data-ver="${a.id}" data-tipo="${esc(a.tipo)}" data-nom="${esc(a.nombre_original)}">Abrir</button>
      <button class="lnk" data-baj="${a.id}" data-nom="${esc(a.nombre_original)}">Descargar</button>
      ${puede ? `<button class="lnk danger" data-borrar="${a.id}">Borrar</button>` : ""}
    </div>
  </div>`).join("")}</div>`;
}

async function abrirArchivo(id, descargar, nombre) {
  try {
    const blob = await API.blob("/archivo/" + id + (descargar ? "?descargar=1" : ""));
    const url = URL.createObjectURL(blob);
    if (descargar) {
      const a = document.createElement("a");
      a.href = url; a.download = nombre || "archivo";
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      window.open(url, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    alert(e.message);
  }
}

function bindArchivosRTS(lesionId, recargar) {
  const cont = $("#rts-archivos");
  if (cont) {
    cont.querySelectorAll("[data-ver]").forEach(b =>
      b.addEventListener("click", () => abrirArchivo(b.dataset.ver, false, b.dataset.nom)));
    cont.querySelectorAll("[data-baj]").forEach(b =>
      b.addEventListener("click", () => abrirArchivo(b.dataset.baj, true, b.dataset.nom)));
    cont.querySelectorAll("[data-borrar]").forEach(b =>
      b.addEventListener("click", async () => {
        if (!confirm("Borrar este archivo?")) return;
        await API.del(`/lesion/${lesionId}/archivo/${b.dataset.borrar}`);
        recargar();
      }));
  }
  const btn = $("#rts-subir"), input = $("#rts-file");
  if (btn && input) {
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const titulo = prompt("Titulo del estudio (opcional):", file.name.replace(/\.[^.]+$/, "")) || "";
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("titulo", titulo);
      try {
        await API.postForm(`/lesion/${lesionId}/archivo`, fd);
        recargar();
      } catch (e) {
        alert(e.message);
      }
    });
  }
}

/* ======================================================================
   CONFIG / MI PERFIL
   ====================================================================== */

const LATERALIDADES = ["diestro", "zurdo"];
const POS_DEFENSIVA_LABEL = { "1": "Defensor 1 (central)", "2": "Defensor 2 (lateral)", "3": "Defensor 3 (exterior)" };

async function screenConfig() {
  if (state.perfil.rol === "cuerpo_tecnico") return screenCuentas();
  const esJugador = state.perfil.rol === "jugador";
  const titulo = esJugador ? "Mi perfil" : "Configuracion";
  crumbs(titulo);
  const p = state.perfil;
  const opt = (arr, val, extra = "") => `<option value=""${!val ? " selected" : ""}>—</option>` +
    arr.map(o => `<option value="${esc(o.v ?? o)}"${(o.v ?? o) == val ? " selected" : ""}>${esc(o.l ?? o)}</option>`).join("") + extra;

  view().innerHTML = pageHead(titulo, esJugador ? "Tus datos deportivos" : "Tu cuenta") + `
    <div class="card" style="max-width:560px">
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">
        <span class="avatar" id="cfg-av" style="width:64px;height:64px;font-size:1.2rem;background-image:url('/api/jugadores/${p.id}/foto');background-size:cover">${p.foto ? "" : esc(iniciales(p.nombre, p.apellido))}</span>
        <div style="flex:1">
          <div style="font-family:'Archivo Narrow';font-weight:700;font-size:1.3rem">${esc(nombreJugador(p))}</div>
          <div class="muted">${esc(p.email)} · ${esc(ROL_LABEL[p.rol] || p.rol)}</div>
        </div>
        ${esJugador ? `<button class="btn ghost" id="cfg-foto-btn" style="padding:7px 12px;font-size:.82rem">Cambiar foto</button>
          <input type="file" id="cfg-foto" accept=".png,.jpg,.jpeg,.webp" hidden>` : ""}
      </div>

      ${esJugador ? `
      <form id="cfg-form" class="form-grid">
        <div class="field"><label>Nombre</label><input id="c-nombre" value="${esc(p.nombre || "")}"></div>
        <div class="field"><label>Apellido</label><input id="c-apellido" value="${esc(p.apellido || "")}"></div>
        <div class="field"><label>Fecha de nacimiento</label><input id="c-nac" type="date" value="${esc(p.fecha_nacimiento || "")}"></div>
        <div class="field"><label>Numero de camiseta</label><input id="c-num" type="number" min="1" value="${esc(p.numero_camiseta ?? "")}"></div>
        <div class="field"><label>Altura (cm)</label><input id="c-altura" type="number" min="1" value="${esc(p.altura_cm ?? "")}"></div>
        <div class="field"><label>Peso de referencia (kg)</label><input id="c-peso" type="number" step="0.1" min="1" value="${esc(p.peso_kg ?? "")}"></div>
        <div class="field"><label>Mano habil</label><select id="c-lat">${opt(LATERALIDADES, p.lateralidad)}</select></div>
        <div class="field"><label>Posicion defensiva</label>
          <select id="c-def">${opt([{ v: "1", l: "Defensor 1 (central)" }, { v: "2", l: "Defensor 2 (lateral)" }, { v: "3", l: "Defensor 3 (exterior)" }], p.posicion_defensiva)}</select>
        </div>
        <div class="field"><label>Posicion principal (ataque)</label><select id="c-pos1">${opt(POSICIONES, p.posicion_principal)}</select></div>
        <div class="field"><label>Posicion secundaria</label><select id="c-pos2">${opt(POSICIONES, p.posicion_secundaria)}</select></div>
        <div class="field full"><button class="btn" type="submit">Guardar cambios</button></div>
        <div class="field full"><div id="cfg-msg" class="notice ok" hidden></div></div>
      </form>
      ` : `<p class="muted">La edicion de cuentas y roles del cuerpo tecnico llega en el proximo paso.</p>`}
    </div>`;

  if (!esJugador) return;

  $("#cfg-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("#cfg-msg");
    const num = v => (v === "" ? null : +v);
    try {
      const r = await API.put("/perfil", {
        nombre: $("#c-nombre").value.trim(),
        apellido: $("#c-apellido").value.trim(),
        fecha_nacimiento: $("#c-nac").value || null,
        numero_camiseta: num($("#c-num").value),
        altura_cm: num($("#c-altura").value),
        peso_kg: num($("#c-peso").value),
        lateralidad: $("#c-lat").value || null,
        posicion_defensiva: $("#c-def").value || null,
        posicion_principal: $("#c-pos1").value || null,
        posicion_secundaria: $("#c-pos2").value || null,
      });
      state.perfil = r;
      $("#who-name").textContent = `${nombreJugador(r)} · ${ROL_LABEL[r.rol] || r.rol}`;
      msg.className = "notice ok";
      msg.textContent = "Perfil actualizado.";
      msg.hidden = false;
    } catch (e) {
      msg.className = "notice err";
      msg.textContent = e.message;
      msg.hidden = false;
    }
  });

  const fbtn = $("#cfg-foto-btn"), finput = $("#cfg-foto");
  fbtn.addEventListener("click", () => finput.click());
  finput.addEventListener("change", async () => {
    const file = finput.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("foto", file);
    try {
      const r = await API.postForm("/perfil/foto", fd);
      state.perfil = r;
      $("#cfg-av").style.backgroundImage = `url('/api/jugadores/${r.id}/foto?t=${Date.now()}')`;
      $("#cfg-av").textContent = "";
      $("#who-av").textContent = "";
      const m = $("#cfg-msg"); m.className = "notice ok"; m.textContent = "Foto actualizada."; m.hidden = false;
    } catch (e) {
      const m = $("#cfg-msg"); m.className = "notice err"; m.textContent = e.message; m.hidden = false;
    }
  });
}

/* ---- gestion de cuentas (admin) ---- */

const ROLES_ASIGNABLES = ["jugador", "entrenador", "preparador_fisico", "medico", "fisioterapeuta", "cuerpo_tecnico"];

async function copiar(texto, btn) {
  try {
    await navigator.clipboard.writeText(texto);
    if (btn) { const t = btn.textContent; btn.textContent = "Copiado ✓"; setTimeout(() => (btn.textContent = t), 1500); }
  } catch (e) { alert("Copiala a mano: " + texto); }
}

function mostrarPassTemporal(nombre, pass) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal" style="max-width:400px;text-align:center">
    <h3>Contrasena temporal</h3>
    <p class="muted" style="font-size:.88rem">Para <b>${esc(nombre)}</b>. Pasasela por un canal seguro; al entrar puede cambiarla.</p>
    <div class="pass-box"><code>${esc(pass)}</code></div>
    <div class="modal-actions" style="justify-content:center;margin-top:14px">
      <button class="btn ghost" id="pt-copiar">Copiar</button>
      <button class="btn" id="pt-ok">Entendido</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", e => { if (e.target === bg) bg.remove(); });
  $("#pt-ok", bg).onclick = () => bg.remove();
  $("#pt-copiar", bg).onclick = e => copiar(pass, e.target);
}

async function screenCuentas() {
  crumbs("Configuracion", "Cuentas y roles");
  const usuarios = await API.get("/usuarios");
  const staff = usuarios.filter(u => u.rol !== "jugador");
  const jugadores = usuarios.filter(u => u.rol === "jugador");

  const fila = u => `<tr data-uid="${u.id}">
    <td><div class="cell-player">
      <span class="avatar">${esc(iniciales(u.nombre, u.apellido))}</span>
      <div><div class="cp-name">${esc(nombreJugador(u))}${u.id === state.perfil.id ? ' <span class="muted" style="font-size:.75rem">(vos)</span>' : ""}</div>
      <div class="cp-pos" style="text-transform:none;letter-spacing:0">${esc(u.email)}</div></div>
    </div></td>
    <td>
      ${u.id === state.perfil.id
        ? `<span class="chip gris">${esc(ROL_LABEL[u.rol] || u.rol)}</span>`
        : `<select class="sel-rol" style="padding:5px 8px;font-size:.84rem">${ROLES_ASIGNABLES.map(r => `<option value="${r}"${r === u.rol ? " selected" : ""}>${esc(ROL_LABEL[r])}</option>`).join("")}</select>`}
    </td>
    <td style="text-align:center">
      <span class="chip ${u.activo ? "verde" : "gris"}">${u.activo ? "Activa" : "Inactiva"}</span>
    </td>
    <td style="text-align:right;white-space:nowrap">
      ${u.id === state.perfil.id ? "" : `
        <button class="lnk" data-accion="pass">Reset clave</button>
        <button class="lnk ${u.activo ? "danger" : ""}" data-accion="activo">${u.activo ? "Desactivar" : "Activar"}</button>`}
    </td>
  </tr>`;

  view().innerHTML = pageHead("Cuentas y roles", "Alta de usuarios y asignacion de roles") + `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Cuerpo tecnico</h3>
        <button class="btn" id="btn-nueva-cuenta">+ Nueva cuenta</button>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Persona</th><th>Rol</th><th style="text-align:center">Estado</th><th></th></tr></thead>
        <tbody id="tb-staff">${staff.map(fila).join("")}</tbody>
      </table></div>
    </div>
    <div class="card section-gap">
      <h3>Jugadores</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Persona</th><th>Rol</th><th style="text-align:center">Estado</th><th></th></tr></thead>
        <tbody id="tb-jug">${jugadores.map(fila).join("")}</tbody>
      </table></div>
    </div>
    <p class="muted" style="font-size:.8rem;margin-top:10px">Desactivar una cuenta la saca del plantel y cierra su sesion, sin borrar el historial.</p>`;

  const recargar = () => screenCuentas();

  view().querySelectorAll("tr[data-uid]").forEach(tr => {
    const uid = +tr.dataset.uid;
    const sel = tr.querySelector(".sel-rol");
    if (sel) sel.addEventListener("change", async () => {
      try { await API.put("/usuarios/" + uid, { rol: sel.value }); }
      catch (e) { alert(e.message); recargar(); }
    });
    tr.querySelectorAll("[data-accion]").forEach(b => b.addEventListener("click", async () => {
      const nombre = tr.querySelector(".cp-name").textContent.trim();
      try {
        if (b.dataset.accion === "pass") {
          if (!confirm(`Generar una contrasena nueva para ${nombre}?`)) return;
          const r = await API.post(`/usuarios/${uid}/password`);
          mostrarPassTemporal(nombre, r.password_temporal);
        } else {
          const activar = b.textContent.trim() === "Activar";
          if (!activar && !confirm(`Desactivar la cuenta de ${nombre}?`)) return;
          await API.put("/usuarios/" + uid, { activo: activar });
          recargar();
        }
      } catch (e) { alert(e.message); }
    }));
  });

  $("#btn-nueva-cuenta").addEventListener("click", () => modalNuevaCuenta(recargar));
}

function modalNuevaCuenta(recargar) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">
    <h3>Nueva cuenta</h3>
    <div class="form-grid">
      <div class="field"><label>Nombre</label><input id="nc-nombre"></div>
      <div class="field"><label>Apellido</label><input id="nc-apellido"></div>
      <div class="field full"><label>Email</label><input id="nc-email" type="email"></div>
      <div class="field"><label>Rol</label><select id="nc-rol">${ROLES_ASIGNABLES.map(r => `<option value="${r}">${esc(ROL_LABEL[r])}</option>`).join("")}</select></div>
      <div class="field"><label>Contrasena inicial</label><input id="nc-pass" placeholder="se genera una si la dejas vacia"></div>
      <div class="field full"><span class="hint">Si es jugador, despues completa su altura, peso y posiciones desde "Mi perfil".</span></div>
      <div class="field full"><div id="nc-msg" class="notice err" hidden></div></div>
    </div>
    <div class="modal-actions">
      <span class="spacer"></span>
      <button class="btn ghost" id="nc-cancel">Cancelar</button>
      <button class="btn" id="nc-save">Crear cuenta</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const cerrar = () => bg.remove();
  bg.addEventListener("click", e => { if (e.target === bg) cerrar(); });
  $("#nc-cancel", bg).onclick = cerrar;
  $("#nc-save", bg).onclick = async () => {
    const msg = $("#nc-msg", bg);
    try {
      const r = await API.post("/usuarios", {
        nombre: $("#nc-nombre", bg).value.trim(),
        apellido: $("#nc-apellido", bg).value.trim(),
        email: $("#nc-email", bg).value.trim(),
        rol: $("#nc-rol", bg).value,
        password: $("#nc-pass", bg).value.trim() || null,
      });
      cerrar();
      recargar();
      if (r.password_temporal) mostrarPassTemporal(nombreJugador(r.usuario), r.password_temporal);
    } catch (e) {
      msg.textContent = e.message;
      msg.hidden = false;
    }
  };
}

/* ======================================================================
   CALENDARIO  (vistas: mes / semana / dia)
   ====================================================================== */

const DIAS_LARGO = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const CAL_H_INI = 7, CAL_H_FIN = 23, CAL_PX_HORA = 44;

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inicioSemana(fecha) {
  const d = new Date(fecha);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

let calVista = "mes";
let calFecha = null;

function calRango() {
  if (calVista === "mes") {
    const primero = new Date(calFecha.getFullYear(), calFecha.getMonth(), 1);
    const ini = new Date(primero);
    ini.setDate(1 - ((primero.getDay() + 6) % 7));
    const fin = new Date(ini);
    fin.setDate(ini.getDate() + 41);
    return [ini, fin];
  }
  if (calVista === "semana") {
    const ini = inicioSemana(calFecha);
    const fin = new Date(ini);
    fin.setDate(ini.getDate() + 6);
    return [ini, fin];
  }
  return [new Date(calFecha), new Date(calFecha)];
}
function calMover(dir) {
  const d = new Date(calFecha);
  if (calVista === "mes") d.setMonth(d.getMonth() + dir);
  else if (calVista === "semana") d.setDate(d.getDate() + 7 * dir);
  else d.setDate(d.getDate() + dir);
  calFecha = d;
}
function calTitulo() {
  if (calVista === "mes") return `${MESES[calFecha.getMonth()]} ${calFecha.getFullYear()}`;
  if (calVista === "semana") {
    const ini = inicioSemana(calFecha);
    const fin = new Date(ini); fin.setDate(ini.getDate() + 6);
    return `${ini.getDate()} ${MESES[ini.getMonth()].slice(0, 3)} – ${fin.getDate()} ${MESES[fin.getMonth()].slice(0, 3)} ${fin.getFullYear()}`;
  }
  return `${DIAS_LARGO[(calFecha.getDay() + 6) % 7]} ${calFecha.getDate()} de ${MESES[calFecha.getMonth()]}`;
}

async function screenCalendario() {
  crumbs("Calendario");
  if (!calFecha) calFecha = new Date();
  const editable = esCalendarioEditor();
  const [ini, fin] = calRango();
  const eventos = await API.get(`/eventos?desde=${isoLocal(ini)}&hasta=${isoLocal(fin)}`);

  view().innerHTML = pageHead("Calendario",
    editable ? "Planificacion del equipo · toca para agendar" : "Planificacion del equipo") + `
    <div class="cal-bar">
      <div class="seg" id="cal-vista">
        ${[["mes", "Mes"], ["semana", "Semana"], ["dia", "Dia"]].map(v =>
          `<button type="button" data-v="${v[0]}" class="${calVista === v[0] ? "on" : ""}">${v[1]}</button>`).join("")}
      </div>
      <button class="cal-nav" id="cal-prev">‹</button>
      <button class="cal-nav" id="cal-next">›</button>
      <span class="cal-month">${calTitulo()}</span>
      <button class="btn ghost" id="cal-hoy" style="padding:6px 12px">Hoy</button>
      <span class="spacer"></span>
      ${editable ? `<button class="btn" id="cal-add">+ Evento</button>` : ""}
    </div>
    <div id="cal-body"></div>
    <p class="muted" style="font-size:.82rem;margin-top:12px">
      <span class="cal-ev entrenamiento" style="display:inline-block">Entrenamiento</span>
      <span class="cal-ev partido" style="display:inline-block">Partido</span>
      <span class="cal-ev gimnasio" style="display:inline-block">Gimnasio</span>
      <span class="cal-ev recuperacion" style="display:inline-block">Recuperacion</span>
    </p>`;

  if (calVista === "mes") calRenderMes(eventos, editable);
  else calRenderTiempo(eventos, editable);

  $("#cal-vista").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    calVista = b.dataset.v;
    screenCalendario();
  });
  $("#cal-prev").onclick = () => { calMover(-1); screenCalendario(); };
  $("#cal-next").onclick = () => { calMover(1); screenCalendario(); };
  $("#cal-hoy").onclick = () => { calFecha = new Date(); screenCalendario(); };
  if (editable) $("#cal-add").onclick = () => abrirEventoModal({ fecha: isoLocal(new Date()) }, true);

  $("#cal-body").querySelectorAll("[data-ev]").forEach(el => el.addEventListener("click", ev => {
    ev.stopPropagation();
    abrirEventoModal(eventos.find(x => x.id === +el.dataset.ev), editable);
  }));
}

function calRenderMes(eventos, editable) {
  const porFecha = {};
  eventos.forEach(e => (porFecha[e.fecha] = porFecha[e.fecha] || []).push(e));
  const hoyIso = isoLocal(new Date());
  const [ini] = calRango();
  const mesActual = calFecha.getMonth();
  const celdas = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(ini);
    d.setDate(ini.getDate() + i);
    return d;
  });

  $("#cal-body").innerHTML = `<div class="cal-grid">
    ${DOW.map(d => `<div class="cal-dow">${d}</div>`).join("")}
    ${celdas.map(d => {
      const iso = isoLocal(d);
      const evs = porFecha[iso] || [];
      return `<div class="cal-cell ${d.getMonth() !== mesActual ? "otro-mes" : ""} ${iso === hoyIso ? "hoy" : ""} ${editable ? "editable" : ""}" data-fecha="${iso}">
        <span class="cal-num">${d.getDate()}</span>
        ${evs.slice(0, 4).map(e => `<div class="cal-ev ${esc(e.tipo)}" data-ev="${e.id}">${e.hora_inicio ? `<span class="ev-h">${esc(e.hora_inicio)}</span> ` : ""}${esc(e.titulo)}</div>`).join("")}
        ${evs.length > 4 ? `<span class="cal-num">+${evs.length - 4}</span>` : ""}
      </div>`;
    }).join("")}
  </div>`;

  if (editable) {
    $("#cal-body").querySelectorAll(".cal-cell.editable").forEach(c =>
      c.addEventListener("click", () => abrirEventoModal({ fecha: c.dataset.fecha }, true)));
  }
}

function calRenderTiempo(eventos, editable) {
  const dias = calVista === "semana"
    ? Array.from({ length: 7 }, (_, i) => { const d = inicioSemana(calFecha); d.setDate(d.getDate() + i); return d; })
    : [new Date(calFecha)];
  const hoyIso = isoLocal(new Date());
  const porFecha = {};
  eventos.forEach(e => (porFecha[e.fecha] = porFecha[e.fecha] || []).push(e));
  const horas = [];
  for (let h = CAL_H_INI; h <= CAL_H_FIN; h++) horas.push(h);
  const alto = (CAL_H_FIN - CAL_H_INI + 1) * CAL_PX_HORA;

  $("#cal-body").innerHTML = `<div class="tg-wrap"><div class="tg" style="--cols:${dias.length}">
    <div class="tg-corner"></div>
    ${dias.map(d => `<div class="tg-dayhead ${isoLocal(d) === hoyIso ? "hoy" : ""}">
      <span>${DOW[(d.getDay() + 6) % 7]}</span> <b>${d.getDate()}</b>
    </div>`).join("")}

    <div class="tg-allday-label">Todo el dia</div>
    ${dias.map(d => {
      const evs = (porFecha[isoLocal(d)] || []).filter(e => !e.hora_inicio);
      return `<div class="tg-allday" data-fecha="${isoLocal(d)}">
        ${evs.map(e => `<div class="tg-chip ${esc(e.tipo)}" data-ev="${e.id}">${esc(e.titulo)}</div>`).join("")}
      </div>`;
    }).join("")}

    <div class="tg-hours">
      ${horas.map(h => `<div class="tg-hour" style="height:${CAL_PX_HORA}px">${String(h).padStart(2, "0")}:00</div>`).join("")}
    </div>
    ${dias.map(d => {
      const evs = (porFecha[isoLocal(d)] || []).filter(e => e.hora_inicio);
      return `<div class="tg-col ${editable ? "editable" : ""}" data-fecha="${isoLocal(d)}" style="height:${alto}px">
        ${horas.map(h => `<div class="tg-slot" data-h="${h}" style="height:${CAL_PX_HORA}px"></div>`).join("")}
        ${evs.map(calBloqueEvento).join("")}
      </div>`;
    }).join("")}
  </div></div>`;

  if (editable) {
    $("#cal-body").querySelectorAll(".tg-slot").forEach(s => s.addEventListener("click", e => {
      const col = e.target.closest(".tg-col");
      abrirEventoModal({ fecha: col.dataset.fecha, hora_inicio: String(s.dataset.h).padStart(2, "0") + ":00" }, true);
    }));
    $("#cal-body").querySelectorAll(".tg-allday").forEach(a => a.addEventListener("click", e => {
      if (e.target.closest("[data-ev]")) return;
      abrirEventoModal({ fecha: a.dataset.fecha }, true);
    }));
  }
}

function calBloqueEvento(e) {
  const [hi, mi] = e.hora_inicio.split(":").map(Number);
  let dur = 90;
  if (e.hora_fin) {
    const [hf, mf] = e.hora_fin.split(":").map(Number);
    dur = Math.max(30, (hf * 60 + mf) - (hi * 60 + mi));
  }
  const top = Math.max(0, ((hi * 60 + mi) - CAL_H_INI * 60) / 60 * CAL_PX_HORA);
  const alto = Math.max(24, dur / 60 * CAL_PX_HORA);
  return `<div class="tg-event ${esc(e.tipo)}" data-ev="${e.id}" style="top:${top}px;height:${alto}px">
    <b>${esc(e.hora_inicio)}</b> ${esc(e.titulo)}${e.lugar ? `<span class="tg-e-sub">${esc(e.lugar)}</span>` : ""}
  </div>`;
}

function abrirEventoModal(ev, editable) {
  ev = ev || {};
  const esNuevo = !ev.id;
  const ro = !editable;
  const dis = ro ? "disabled" : "";

  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">
    <h3>${esNuevo ? "Nuevo evento" : (ro ? "Evento" : "Editar evento")}</h3>
    <div class="form-grid">
      <div class="field full"><label>Titulo</label><input id="ev-titulo" value="${esc(ev.titulo || "")}" ${dis}></div>
      <div class="field"><label>Fecha</label><input id="ev-fecha" type="date" value="${esc(ev.fecha || "")}" ${dis}></div>
      <div class="field"><label>Tipo</label><select id="ev-tipo" ${dis}>
        ${TIPOS_EVENTO.map(t => `<option value="${t}" ${ev.tipo === t ? "selected" : ""}>${t}</option>`).join("")}
      </select></div>
      <div class="field"><label>Hora inicio</label><input id="ev-hi" type="time" value="${esc(ev.hora_inicio || "")}" ${dis}></div>
      <div class="field"><label>Hora fin</label><input id="ev-hf" type="time" value="${esc(ev.hora_fin || "")}" ${dis}></div>
      <div class="field"><label>Condicion</label><select id="ev-cond" ${dis}>
        <option value="">—</option>
        <option value="local" ${ev.condicion === "local" ? "selected" : ""}>Local</option>
        <option value="visitante" ${ev.condicion === "visitante" ? "selected" : ""}>Visitante</option>
      </select></div>
      <div class="field"><label>Rival</label><input id="ev-rival" value="${esc(ev.rival || "")}" ${dis}></div>
      <div class="field full"><label>Lugar / ciudad</label><input id="ev-lugar" value="${esc(ev.lugar || "")}" ${dis}></div>
      <div class="field full"><label>Notas</label><textarea id="ev-notas" ${dis}>${esc(ev.notas || "")}</textarea></div>
      <div class="field full"><div id="ev-msg" class="notice err" hidden></div></div>
    </div>
    <div class="modal-actions">
      ${!esNuevo && editable ? `<button class="btn danger" id="ev-del">Eliminar</button>` : ""}
      <span class="spacer"></span>
      <button class="btn ghost" id="ev-cancel">${ro ? "Cerrar" : "Cancelar"}</button>
      ${editable ? `<button class="btn" id="ev-save">Guardar</button>` : ""}
    </div>
  </div>`;
  document.body.appendChild(bg);

  const cerrar = () => bg.remove();
  bg.addEventListener("click", e => { if (e.target === bg) cerrar(); });
  $("#ev-cancel", bg).onclick = cerrar;

  if (!editable) return;

  $("#ev-save", bg).onclick = async () => {
    const payload = {
      titulo: $("#ev-titulo", bg).value.trim(),
      fecha: $("#ev-fecha", bg).value,
      tipo: $("#ev-tipo", bg).value,
      hora_inicio: $("#ev-hi", bg).value || null,
      hora_fin: $("#ev-hf", bg).value || null,
      condicion: $("#ev-cond", bg).value || null,
      lugar: $("#ev-lugar", bg).value.trim() || null,
      rival: $("#ev-rival", bg).value.trim() || null,
      notas: $("#ev-notas", bg).value.trim() || null,
    };
    const msg = $("#ev-msg", bg);
    msg.hidden = true;
    try {
      if (esNuevo) await API.post("/eventos", payload);
      else await API.put("/eventos/" + ev.id, payload);
      cerrar();
      screenCalendario();
    } catch (e) {
      msg.textContent = e.message;
      msg.hidden = false;
    }
  };

  if (!esNuevo) {
    $("#ev-del", bg).onclick = async () => {
      if (!confirm("Eliminar este evento del calendario?")) return;
      try {
        await API.del("/eventos/" + ev.id);
        cerrar();
        screenCalendario();
      } catch (e) {
        const msg = $("#ev-msg", bg);
        msg.textContent = e.message;
        msg.hidden = false;
      }
    };
  }
}

/* -------------------------------------------------------------- arranque -- */
boot();
