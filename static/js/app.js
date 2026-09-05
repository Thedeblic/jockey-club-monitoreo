/* ==========================================================================
   Jockey Club Handball · frontend
   Router por hash + pantallas. Todo se dibuja dentro de #view.
   ========================================================================== */

const SEED_HINT = "Datos de prueba (tras correr seed.py): ct@jockey.com / handball2025";
const POSICIONES = ["Arquero", "Lateral", "Central", "Extremo", "Pivote"];
const TIPOS_SESION = ["Entrenamiento", "Partido", "Gimnasio", "Recuperacion", "Otro"];

const state = { perfil: null, jugadores: null };

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
  hidratacion: screenHidratacion,
  registro: screenRegistro,
  carga: () => screenSoon("Carga del plantel", "Analisis de carga, tendencias y comparativa por posicion."),
  bienestar: () => screenSoon("Bienestar", "Cuestionario diario: sueno, fatiga, dolor muscular y estres."),
  calendario: () => screenSoon("Calendario", "Planificacion de entrenamientos, partidos y eventos."),
  informes: () => screenSoon("Informes", "Resumenes exportables por jugador y por plantel."),
  config: () => screenSoon("Configuracion", "Cuentas, roles y preferencias del sistema."),
};

function router() {
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
  const [js, lesiones] = await Promise.all([
    jugadores(),
    API.get("/lesiones?activas=1"),
  ]);
  const lesionadosIds = new Set(lesiones.map(l => l.jugador_id));
  const total = js.length;
  const enAlerta = lesionadosIds.size;
  const disponibles = total - enAlerta;
  const pctDisp = total ? Math.round((disponibles / total) * 100) : 100;

  const observar = js.filter(j => lesionadosIds.has(j.id));

  view().innerHTML = pageHead(`Hola, ${state.perfil.nombre}`, "Estado del plantel hoy") + `
    <div class="grid cols-4">
      ${kpi("Jugadores", total)}
      ${kpi("Disponibles", disponibles)}
      ${kpi("En alerta", enAlerta, enAlerta ? "accent" : "")}
      ${kpi("Disponibilidad", pctDisp + "%")}
    </div>
    <div class="card section-gap">
      <h3>Jugadores a observar</h3>
      ${observar.length ? `<table class="table">
        <tbody>${observar.map(j => `<tr>
          <td class="num-col">${esc(j.numero_camiseta ?? "–")}</td>
          <td><div class="cell-player">
            <span class="avatar">${esc(iniciales(j.nombre, j.apellido).toUpperCase())}</span>
            <div><div class="cp-name">${esc(nombreJugador(j))}</div>
            <div class="cp-pos">${esc(j.posicion_principal || "")}</div></div>
          </div></td>
          <td style="text-align:right"><span class="chip rojo">Lesion activa</span></td>
        </tr>`).join("")}</tbody>
      </table>` : `<p class="muted">Sin alertas. Todo el plantel disponible.</p>`}
    </div>`;
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
        <h3>Resultado / historial</h3>
        <div id="hidra-out"><p class="muted">Cargá un registro y vas a ver acá la clasificacion, la reposicion recomendada y las indicaciones.</p></div>
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
  if (!jid) return;
  const hist = await API.get("/hidratacion/" + jid);
  if (hist.length <= 1) return;
  const rows = hist.slice(0, 6).map(h => `<tr>
    <td class="tnum muted">${esc(h.fecha)}</td>
    <td class="muted">${esc(h.contexto)}</td>
    <td class="tnum">${h.deficit_kg} kg</td>
    <td style="text-align:right"><span class="chip ${esc(h.semaforo)}">${h.porcentaje_perdida}%</span></td>
  </tr>`).join("");
  $("#hidra-out").insertAdjacentHTML("beforeend",
    `<div class="section-gap"><h3 style="font-size:.95rem">Historial</h3>
    <table class="table"><tbody>${rows}</tbody></table></div>`);
}

/* -------------------------------------------------------------- arranque -- */
boot();
