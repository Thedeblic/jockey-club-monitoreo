/* ==========================================================================
   Jockey Club Handball · frontend
   Router por hash + pantallas. Todo se dibuja dentro de #view.
   ========================================================================== */

const SEED_HINT = "Datos de prueba (tras correr seed.py): ct@jockey.com / handball2025";
const POSICIONES = ["Arquero", "Lateral", "Central", "Extremo", "Pivote"];
const TIPOS_SESION = ["Entrenamiento", "Partido", "Gimnasio", "Recuperacion", "Otro"];

const state = { perfil: null, jugadores: null };

/* -------------------------------------------------------------- charts ---- */

const COL = {
  verde: "#2A9D8F", amarillo: "#E9C46A", naranja: "#F4A261", rojo: "#E63946",
  line: "#2A2A2D", ink: "#9A9AA1", surface: "#1F1F22", accent: "#E63946",
};

if (window.Chart) {
  Chart.defaults.color = COL.ink;
  Chart.defaults.borderColor = COL.line;
  Chart.defaults.font.family = "Barlow, system-ui, sans-serif";
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

const $ = (sel, root = document) => root.querySelector(sel);
const view = () => $("#view");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function iniciales(nombre, apellido) {
  return ((nombre || "")[0] || "") + ((apellido || "")[0] || "");
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function nombreJugador(j) {
  return `${j.nombre} ${j.apellido}`.trim();
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
function selectJugadores(lista, id = "f-jugador") {
  return `<select id="${id}" required>
    <option value="">Elegir jugador…</option>
    ${lista.map(j => `<option value="${j.id}">${esc(nombreJugador(j))} · ${esc(j.posicion_principal || "—")}</option>`).join("")}
  </select>`;
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
  $("#who-av").textContent = iniciales(p.nombre, p.apellido).toUpperCase() || "–";
  $("#who-name").textContent = `${nombreJugador(p)} · ${p.rol === "cuerpo_tecnico" ? "CT" : "Jugador"}`;
  if (!location.hash) location.hash = "#/inicio";
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
  carga: screenCarga,
  hidratacion: screenHidratacion,
  registro: screenRegistro,
  bienestar: () => screenSoon("Bienestar", "Cuestionario diario: sueno, fatiga, dolor muscular y estres."),
  calendario: () => screenSoon("Calendario", "Planificacion de entrenamientos, partidos y eventos."),
  informes: () => screenSoon("Informes", "Resumenes exportables por jugador y por plantel."),
  config: () => screenSoon("Configuracion", "Cuentas, roles y preferencias del sistema."),
};

function router() {
  destroyCharts();
  const route = (location.hash.replace("#/", "") || "inicio").split("/")[0];
  document.querySelectorAll("#nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.route === route);
  });
  const fn = ROUTES[route] || ROUTES.inicio;
  Promise.resolve()
    .then(() => { spinner(); return fn(); })
    .catch(err => {
      view().innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
    });
}

/* ---------------------------------------------------------- pantallas ---- */

function pageHead(titulo, sub) {
  return `<div class="page-head">
    <div class="glyph">◆</div>
    <div><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div>
  </div>`;
}

function screenSoon(titulo, sub) {
  crumbs(titulo);
  view().innerHTML = pageHead(titulo, sub) +
    `<div class="card"><div class="empty">
      <div class="big">En construccion</div>
      <p>Este modulo llega en el proximo paso.</p>
    </div></div>`;
}

/* ---- Inicio / dashboard ---- */

async function screenInicio() {
  crumbs("Inicio");
  const [js, lesiones, resumen] = await Promise.all([
    jugadores(),
    API.get("/lesiones?activas=1"),
    API.get("/carga/resumen?dias=7"),
  ]);
  const lesionadosIds = new Set(lesiones.map(l => l.jugador_id));
  const total = js.length;
  const enAlerta = lesionadosIds.size;
  const disponibles = total - enAlerta;
  const pctDisp = total ? Math.round((disponibles / total) * 100) : 100;
  const enRiesgo = resumen.por_jugador.filter(p => ["alta", "muy_alta"].includes(p.zona));
  const observar = js.filter(j => lesionadosIds.has(j.id));

  view().innerHTML = pageHead(`Hola, ${state.perfil.nombre}`, "Estado del plantel hoy") + `
    <div class="grid cols-4">
      ${kpi("Jugadores", total)}
      ${kpi("Disponibles", disponibles)}
      ${kpi("En alerta", enAlerta + enRiesgo.length, (enAlerta + enRiesgo.length) ? "accent" : "")}
      ${kpi("Disponibilidad", pctDisp + "%")}
    </div>
    <div class="grid cols-2 section-gap" style="align-items:start">
      <div class="card">
        <h3>Carga del plantel · ultimos 7 dias</h3>
        <p class="card-sub">Suma diaria en UA. La linea marca el promedio.</p>
        <div style="height:230px"><canvas id="ch-carga7"></canvas></div>
      </div>
      <div class="card">
        <h3>Jugadores a observar</h3>
        ${filaObservar(observar, enRiesgo)}
      </div>
    </div>`;

  graficoCargaDiaria("ch-carga7", resumen.serie_diaria);
}

function filaObservar(lesionados, enRiesgo) {
  const items = [
    ...lesionados.map(j => ({
      nombre: nombreJugador(j), sub: (j.posicion_principal || "") + " · lesion activa",
      ini: iniciales(j.nombre, j.apellido), chip: "rojo", txt: "Lesion",
    })),
    ...enRiesgo.map(p => ({
      nombre: p.nombre, sub: (p.posicion || "") + " · ACWR " + (p.acwr ?? "–"),
      ini: p.nombre.split(" ").map(x => x[0]).join(""), chip: p.semaforo,
      txt: p.zona === "muy_alta" ? "Carga muy alta" : "Carga alta",
    })),
  ];
  if (!items.length) return `<p class="muted">Sin alertas. Todo el plantel en zona adecuada.</p>`;
  return `<table class="table"><tbody>${items.map(it => `<tr>
    <td><div class="cell-player">
      <span class="avatar">${esc((it.ini || "").toUpperCase())}</span>
      <div><div class="cp-name">${esc(it.nombre)}</div><div class="cp-pos">${esc(it.sub)}</div></div>
    </div></td>
    <td style="text-align:right"><span class="chip ${esc(it.chip)}">${esc(it.txt)}</span></td>
  </tr>`).join("")}</tbody></table>`;
}

function graficoCargaDiaria(canvasId, serie, opts = {}) {
  const valores = serie.map(d => d.carga);
  const conCarga = valores.filter(v => v > 0);
  const media = conCarga.length ? Math.round(conCarga.reduce((a, b) => a + b, 0) / conCarga.length) : 0;
  const etiquetas = serie.map(d => {
    const [, m, dd] = d.fecha.split("-");
    return `${dd}/${m}`;
  });
  const datasets = [{
    type: "bar",
    label: "Carga",
    data: valores,
    backgroundColor: valores.map(v => colorPorCarga(v, media)),
    borderRadius: 3,
    maxBarThickness: opts.thin ? 14 : 40,
    order: 2,
  }];
  if (media) {
    datasets.push({
      type: "line",
      label: "Promedio",
      data: valores.map(() => media),
      borderColor: COL.ink,
      borderDash: [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      order: 1,
    });
  }
  chart(canvasId, {
    data: { labels: etiquetas, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ...ejeSinGrilla, ticks: { maxRotation: 0, autoSkip: true } },
        y: { ...ejeGrillaTenue, beginAtZero: true },
      },
      plugins: {
        tooltip: {
          filter: c => c.dataset.label === "Carga",
          callbacks: { label: c => c.parsed.y + " UA" },
        },
      },
    },
  });
}

function kpi(label, value, cls = "") {
  return `<div class="card kpi">
    <span class="k-label">${esc(label)}</span>
    <span class="k-value ${cls} tnum">${esc(value)}</span>
  </div>`;
}

/* ---- Plantel ---- */

async function screenPlantel() {
  crumbs("Plantel");
  const [js, lesiones] = await Promise.all([
    jugadores(),
    API.get("/lesiones?activas=1"),
  ]);
  const lesionadosIds = new Set(lesiones.map(l => l.jugador_id));

  view().innerHTML = pageHead("Plantel", "Vista general de los jugadores") + `
    <div class="card">
      ${js.length ? `<table class="table">
        <thead><tr><th>#</th><th>Jugador</th><th>Posicion sec.</th><th>Edad</th><th style="text-align:right">Estado</th></tr></thead>
        <tbody>${js.map(j => {
          const lesionado = lesionadosIds.has(j.id);
          return `<tr class="clickable" data-id="${j.id}">
            <td class="num-col">${esc(j.numero_camiseta ?? "–")}</td>
            <td><div class="cell-player">
              <span class="avatar">${esc(iniciales(j.nombre, j.apellido).toUpperCase())}</span>
              <div><div class="cp-name">${esc(nombreJugador(j))}</div>
              <div class="cp-pos">${esc(j.posicion_principal || "—")}</div></div>
            </div></td>
            <td class="muted">${esc(j.posicion_secundaria || "—")}</td>
            <td class="tnum">${esc(j.edad ?? "—")}</td>
            <td style="text-align:right">
              <span class="chip ${lesionado ? "rojo" : "verde"}">${lesionado ? "Lesionado" : "Disponible"}</span>
            </td>
          </tr>`;
        }).join("")}</tbody>
      </table>` : `<div class="empty"><div class="big">Todavia no hay jugadores</div>
        <p>Corre <code>python seed.py</code> para cargar un plantel de ejemplo, o registra jugadores desde la app.</p></div>`}
    </div>`;

  view().querySelectorAll("tr.clickable").forEach(tr => {
    tr.addEventListener("click", () => alert("La ficha del jugador llega en el proximo paso."));
  });
}

/* ---- Carga del plantel ---- */

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

  view().innerHTML = pageHead("Carga del plantel", "Carga interna del equipo · seguimiento y distribucion") + `
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
        <p class="card-sub">Ratio carga aguda (7 d) : cronica (28 d).</p>
        <div style="display:flex;gap:20px;align-items:center">
          <div style="position:relative;width:150px;height:150px;flex:0 0 auto">
            <canvas id="ch-dist"></canvas>
            <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
              <div><div style="font-family:'Barlow Semi Condensed';font-weight:700;font-size:1.6rem;line-height:1">${conDatos}</div>
              <div class="muted" style="font-size:.72rem">jugadores</div></div>
            </div>
          </div>
          <div style="flex:1">
            ${zonas.map(z => `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:.86rem">
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${z[2]};margin-right:8px"></span>${z[0]}</span>
              <b class="tnum">${z[1]}</b>
            </div>`).join("")}
            ${d.sin_datos ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:.86rem" class="muted">
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COL.surface};margin-right:8px"></span>Sin datos</span>
              <b class="tnum">${d.sin_datos}</b></div>` : ""}
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
        <table class="table"><thead><tr><th>Jugador</th><th style="text-align:right">Carga</th><th style="text-align:right">ACWR</th><th style="text-align:right">Zona</th></tr></thead>
        <tbody>${r.por_jugador.slice(0, 8).map(p => `<tr>
          <td><div class="cell-player">
            <span class="avatar">${esc(p.nombre.split(" ").map(x => x[0]).join("").toUpperCase())}</span>
            <div><div class="cp-name">${esc(p.nombre)}</div><div class="cp-pos">${esc(p.posicion || "—")}</div></div>
          </div></td>
          <td style="text-align:right"><b class="tnum">${p.carga_7d.toLocaleString("es")}</b></td>
          <td style="text-align:right" class="tnum">${p.acwr ?? "–"}</td>
          <td style="text-align:right"><span class="chip ${esc(p.semaforo)}">${esc(p.zona.replace("_", " "))}</span></td>
        </tr>`).join("")}</tbody></table>
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
    options: { responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { tooltip: { enabled: true } } },
  });

  chart("ch-pos", {
    type: "bar",
    data: {
      labels: r.por_posicion.map(p => p.posicion),
      datasets: [{
        data: r.por_posicion.map(p => p.carga_promedio),
        backgroundColor: COL.accent,
        borderRadius: 3,
        maxBarThickness: 18,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
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

/* ---- Registro de sesion ---- */

async function screenRegistro() {
  crumbs("Registro de sesion");
  const js = await jugadores();
  let tipo = "Entrenamiento";

  view().innerHTML = pageHead("Registro de sesion", "Carga interna (duracion x sRPE)") + `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3>Datos de la sesion</h3>
        <form id="form-sesion" class="form-grid">
          <div class="field"><label>Jugador</label>${selectJugadores(js)}</div>
          <div class="field"><label>Fecha</label><input id="f-fecha" type="date" value="${hoyISO()}" required></div>
          <div class="field full"><label>Tipo de sesion</label>
            <div class="seg" id="seg-tipo">
              ${TIPOS_SESION.map(t => `<button type="button" data-t="${t}" class="${t === tipo ? "on" : ""}">${t}</button>`).join("")}
            </div>
          </div>
          <div class="field"><label>Duracion (min)</label><input id="f-dur" type="number" min="1" value="90" required></div>
          <div class="field"><label>sRPE (1–10)</label><input id="f-srpe" type="number" min="1" max="10" value="7" required></div>
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
        <h3>Ultimas sesiones del jugador</h3>
        <div id="hist-sesiones"><p class="muted">Elegi un jugador para ver su historial.</p></div>
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

  $("#seg-tipo").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    tipo = b.dataset.t;
    $("#seg-tipo").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  });

  $("#f-jugador").addEventListener("change", e => cargarHistSesiones(e.target.value));

  $("#form-sesion").addEventListener("submit", async ev => {
    ev.preventDefault();
    const jid = $("#f-jugador").value;
    if (!jid) return;
    const msg = $("#sesion-msg");
    try {
      const r = await API.post("/sesiones", {
        jugador_id: +jid,
        fecha: $("#f-fecha").value,
        tipo,
        duracion_min: +dur.value,
        srpe: +srpe.value,
        notas: $("#f-notas").value,
      });
      msg.className = "notice ok";
      msg.textContent = `Sesion guardada · ${r.carga_total} UA`;
      msg.hidden = false;
      $("#f-notas").value = "";
      cargarHistSesiones(jid);
    } catch (e) {
      msg.className = "notice err";
      msg.textContent = e.message;
      msg.hidden = false;
    }
  });
}

async function cargarHistSesiones(jid) {
  const box = $("#hist-sesiones");
  if (!jid) { box.innerHTML = `<p class="muted">Elegi un jugador para ver su historial.</p>`; return; }
  const ses = await API.get("/sesiones/" + jid);
  if (!ses.length) { box.innerHTML = `<p class="muted">Sin sesiones registradas.</p>`; return; }
  box.innerHTML = `<table class="table"><tbody>${
    ses.slice().reverse().slice(0, 8).map(s => `<tr>
      <td class="tnum muted">${esc(s.fecha)}</td>
      <td>${esc(s.tipo)}</td>
      <td class="tnum">${esc(s.duracion_min)}′ · sRPE ${esc(s.srpe)}</td>
      <td style="text-align:right"><b class="tnum">${esc(s.carga_total)} UA</b></td>
    </tr>`).join("")
  }</tbody></table>`;
}

/* ---- Hidratacion ---- */

async function screenHidratacion() {
  crumbs("Hidratacion", "Registro");
  const js = await jugadores();
  let contexto = "partido";

  view().innerHTML = pageHead("Hidratacion", "Peso pre/post y reposicion (ACSM / AMSSM)") + `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3>Nuevo registro</h3>
        <form id="form-hidra" class="form-grid">
          <div class="field"><label>Jugador</label>${selectJugadores(js)}</div>
          <div class="field"><label>Fecha</label><input id="h-fecha" type="date" value="${hoyISO()}" required></div>
          <div class="field full"><label>Contexto</label>
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
    if (a > 0 && b > 0 && a > b) calc.textContent = ((a - b) / a * 100).toFixed(2) + "%";
    else calc.textContent = "–";
  }
  pre.addEventListener("input", preview);
  post.addEventListener("input", preview);

  $("#seg-ctx").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    contexto = b.dataset.c;
    $("#seg-ctx").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  });

  $("#f-jugador").addEventListener("change", e => cargarHistHidra(e.target.value));

  $("#form-hidra").addEventListener("submit", async ev => {
    ev.preventDefault();
    const jid = $("#f-jugador").value;
    if (!jid) return;
    const msg = $("#hidra-msg");
    msg.hidden = true;
    try {
      const r = await API.post("/hidratacion", {
        jugador_id: +jid,
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
      cargarHistHidra(jid);
    } catch (e) {
      msg.textContent = e.message;
      msg.hidden = false;
    }
  });
}

function renderHidraResultado(r) {
  const pct = r.porcentaje_perdida;
  const etiqueta = {
    sin_perdida: "Sin perdida", minima: "Minima", moderada: "Moderada",
    marcada: "Marcada", severa: "Severa",
  }[r.clasificacion] || r.clasificacion;

  $("#hidra-out").innerHTML = `
    <div class="result ${esc(r.semaforo)}">
      <div class="r-row">
        <span class="r-big tnum">${pct}<span style="font-size:1rem">%</span></span>
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

async function cargarHistHidra(jid) {
  const box = $("#hidra-hist");
  if (!box) return;
  if (!jid) { box.innerHTML = ""; return; }
  const hist = await API.get("/hidratacion/" + jid);
  if (!hist.length) { box.innerHTML = `<p class="muted">Sin registros previos de este jugador.</p>`; return; }

  const rows = hist.slice(0, 6).map(h => `<tr>
    <td class="tnum muted">${esc(h.fecha)}</td>
    <td class="muted">${esc(h.contexto)}</td>
    <td class="tnum">${h.deficit_kg} kg</td>
    <td style="text-align:right"><span class="chip ${esc(h.semaforo)}">${h.porcentaje_perdida}%</span></td>
  </tr>`).join("");

  box.innerHTML = `<h3 style="font-size:.95rem">Historial · % de perdida</h3>
    ${hist.length > 1 ? `<div style="height:150px;margin-bottom:10px"><canvas id="ch-hidra"></canvas></div>` : ""}
    <table class="table"><tbody>${rows}</tbody></table>`;

  if (hist.length > 1) {
    const orden = hist.slice().reverse();
    chart("ch-hidra", {
      type: "line",
      data: {
        labels: orden.map(h => { const [, m, d] = h.fecha.split("-"); return `${d}/${m}`; }),
        datasets: [{
          data: orden.map(h => h.porcentaje_perdida),
          borderColor: COL.accent,
          backgroundColor: "transparent",
          pointBackgroundColor: orden.map(h => COL[h.semaforo] || COL.ink),
          pointRadius: 4,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: ejeSinGrilla,
          y: { ...ejeGrillaTenue, beginAtZero: true, ticks: { callback: v => v + "%" } },
        },
        plugins: { tooltip: { callbacks: { label: c => c.parsed.y + "% perdido" } } },
      },
    });
  }
}

/* -------------------------------------------------------------- arranque -- */
boot();
