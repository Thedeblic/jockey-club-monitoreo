import secrets
import sqlite3
from datetime import date, timedelta

from werkzeug.security import check_password_hash, generate_password_hash

DB_NAME = "jockey.db"

# Puestos validos para el handball (posicion principal / secundaria)
POSICIONES = ["Arquero", "Lateral", "Central", "Extremo", "Pivote"]

# Roles dentro de la app. El cuerpo tecnico se subdivide segun el manual
# (red horizontal): cada sub-rol tiene sus permisos.
ROL_JUGADOR = "jugador"
ROLES_CT = ["entrenador", "preparador_fisico", "medico", "fisioterapeuta", "cuerpo_tecnico"]
# 'cuerpo_tecnico' queda como rol generico/legacy con todos los permisos del CT.
ROLES_LESIONES = ["medico", "fisioterapeuta", "cuerpo_tecnico"]  # departamento medico
ROLES_CALENDARIO = ["entrenador", "preparador_fisico", "cuerpo_tecnico"]  # planificacion
ROLES = [ROL_JUGADOR] + ROLES_CT

ROL_LABEL = {
    "jugador": "Jugador",
    "entrenador": "Entrenador",
    "preparador_fisico": "Preparador fisico",
    "medico": "Medico deportologo",
    "fisioterapeuta": "Fisioterapeuta",
    "cuerpo_tecnico": "Cuerpo tecnico",
}


def es_ct(rol):
    return rol in ROLES_CT


# Continuo de retorno al juego (RTS). Reemplaza el "alta" binaria.
ESTADOS_LESION = ["lesionado", "disponible_entrenar", "disponible_competir", "alta"]
ESTADO_LESION_LABEL = {
    "lesionado": "Lesionado",
    "disponible_entrenar": "Disponible para entrenar",
    "disponible_competir": "Disponible para competir",
    "alta": "Alta deportiva",
}
ESTADO_LESION_SEMAFORO = {
    "lesionado": "rojo",
    "disponible_entrenar": "amarillo",
    "disponible_competir": "verde",
    "alta": "gris",
}
# Que sub-rol puede llevar la lesion a cada estado (segun el manual):
#   fisioterapeuta -> alta de la Fase 1 (disponible_entrenar) y recaidas
#   medico         -> habilita competir y cierra el caso
ESTADO_REQUIERE_MEDICO = {"disponible_competir", "alta"}

# Tipos de evento del calendario
TIPOS_EVENTO = ["entrenamiento", "partido", "gimnasio", "recuperacion", "otro"]

# Campos del perfil que el propio usuario puede editar despues del registro
CAMPOS_EDITABLES = [
    "nombre",
    "apellido",
    "fecha_nacimiento",
    "altura_cm",
    "peso_kg",
    "posicion_principal",
    "posicion_secundaria",
    "numero_camiseta",
]


def get_conexion():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def _agregar_columna(cursor, tabla, columna, tipo):
    """Agrega una columna si todavia no existe (migracion simple de bases viejas)."""
    existentes = [c[1] for c in cursor.execute(f"PRAGMA table_info({tabla})").fetchall()]
    if columna not in existentes:
        cursor.execute(f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}")


def crear_tablas():
    conn = get_conexion()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'jugador',
            nombre TEXT NOT NULL,
            apellido TEXT NOT NULL,
            fecha_nacimiento TEXT,
            altura_cm REAL,
            peso_kg REAL,
            posicion_principal TEXT,
            posicion_secundaria TEXT,
            numero_camiseta INTEGER,
            foto TEXT,
            activo INTEGER DEFAULT 1,
            token TEXT,
            creado_en TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL,
            fecha TEXT NOT NULL,
            tipo TEXT NOT NULL,
            duracion_min INTEGER NOT NULL,
            srpe INTEGER NOT NULL,
            carga_total INTEGER,
            sueno TEXT,
            notas TEXT,
            FOREIGN KEY (jugador_id) REFERENCES usuarios (id)
        )
    """)
    _agregar_columna(cursor, "sesiones", "sueno", "TEXT")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hidratacion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL,
            fecha TEXT NOT NULL,
            contexto TEXT DEFAULT 'partido',
            peso_pre_kg REAL NOT NULL,
            peso_post_kg REAL NOT NULL,
            liquido_ingerido_l REAL,
            duracion_min INTEGER,
            sudador_salado INTEGER DEFAULT 0,
            horas_prox_competencia REAL,
            notas TEXT,
            creado_en TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (jugador_id) REFERENCES usuarios (id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL,
            fecha_lesion TEXT NOT NULL,
            diagnostico TEXT NOT NULL,
            zona TEXT,
            lado TEXT,
            mecanismo TEXT,
            contacto INTEGER DEFAULT 0,
            gravedad TEXT,
            dias_estimados INTEGER,
            fecha_alta TEXT,
            notas TEXT,
            estado TEXT DEFAULT 'lesionado',
            criterios_proxima TEXT,
            fecha_disponible_competir TEXT,
            FOREIGN KEY (jugador_id) REFERENCES usuarios (id)
        )
    """)
    _agregar_columna(cursor, "lesiones", "estado", "TEXT DEFAULT 'lesionado'")
    _agregar_columna(cursor, "lesiones", "criterios_proxima", "TEXT")
    _agregar_columna(cursor, "lesiones", "fecha_disponible_competir", "TEXT")
    # bases viejas: las que tenian fecha_alta pasan a estado 'alta'
    cursor.execute(
        "UPDATE lesiones SET estado = 'alta' WHERE fecha_alta IS NOT NULL AND (estado IS NULL OR estado = 'lesionado')"
    )
    cursor.execute("UPDATE lesiones SET estado = 'lesionado' WHERE estado IS NULL")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lesion_notas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesion_id INTEGER NOT NULL,
            fecha TEXT DEFAULT (datetime('now')),
            autor_id INTEGER,
            autor_nombre TEXT,
            autor_rol TEXT,
            tipo TEXT DEFAULT 'nota',
            estado TEXT,
            texto TEXT,
            FOREIGN KEY (lesion_id) REFERENCES lesiones (id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lesion_archivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesion_id INTEGER NOT NULL,
            nombre_archivo TEXT NOT NULL,
            nombre_original TEXT NOT NULL,
            titulo TEXT,
            tipo TEXT,
            tamano INTEGER,
            subido_por INTEGER,
            subido_por_nombre TEXT,
            subido_en TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (lesion_id) REFERENCES lesiones (id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT NOT NULL,
            tipo TEXT NOT NULL DEFAULT 'entrenamiento',
            titulo TEXT NOT NULL,
            hora_inicio TEXT,
            hora_fin TEXT,
            condicion TEXT,
            lugar TEXT,
            rival TEXT,
            notas TEXT,
            creado_por INTEGER,
            creado_en TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (creado_por) REFERENCES usuarios (id)
        )
    """)
    _agregar_columna(cursor, "eventos", "condicion", "TEXT")

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Usuarios / autenticacion
# ---------------------------------------------------------------------------


def _edad(fecha_nacimiento):
    if not fecha_nacimiento:
        return None
    nac = date.fromisoformat(fecha_nacimiento)
    hoy = date.today()
    return hoy.year - nac.year - ((hoy.month, hoy.day) < (nac.month, nac.day))


def _armar_usuario(fila):
    """Convierte una fila de 'usuarios' en dict, sin datos secretos y con la edad calculada."""
    usuario = dict(fila)
    usuario.pop("password_hash", None)
    usuario.pop("token", None)
    usuario["edad"] = _edad(usuario.get("fecha_nacimiento"))
    return usuario


def email_existe(email):
    conn = get_conexion()
    fila = conn.execute(
        "SELECT 1 FROM usuarios WHERE email = ?", (email.lower(),)
    ).fetchone()
    conn.close()
    return fila is not None


def crear_usuario(
    email,
    password,
    nombre,
    apellido,
    fecha_nacimiento=None,
    altura_cm=None,
    peso_kg=None,
    posicion_principal=None,
    posicion_secundaria=None,
    numero_camiseta=None,
    rol="jugador",
):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO usuarios
           (email, password_hash, rol, nombre, apellido, fecha_nacimiento,
            altura_cm, peso_kg, posicion_principal, posicion_secundaria, numero_camiseta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            email.lower(),
            generate_password_hash(password),
            rol,
            nombre,
            apellido,
            fecha_nacimiento,
            altura_cm,
            peso_kg,
            posicion_principal,
            posicion_secundaria,
            numero_camiseta,
        ),
    )
    conn.commit()
    nuevo_id = cursor.lastrowid
    conn.close()
    return nuevo_id


def autenticar(email, password):
    """Devuelve (usuario, token) si el login es valido, o (None, None) si no."""
    conn = get_conexion()
    fila = conn.execute(
        "SELECT * FROM usuarios WHERE email = ?", (email.lower(),)
    ).fetchone()

    if fila is None or not check_password_hash(fila["password_hash"], password):
        conn.close()
        return None, None

    token = secrets.token_hex(32)
    conn.execute("UPDATE usuarios SET token = ? WHERE id = ?", (token, fila["id"]))
    conn.commit()
    conn.close()
    return _armar_usuario(fila), token


def usuario_por_token(token):
    if not token:
        return None
    conn = get_conexion()
    fila = conn.execute("SELECT * FROM usuarios WHERE token = ?", (token,)).fetchone()
    conn.close()
    return _armar_usuario(fila) if fila else None


def cerrar_sesion(token):
    conn = get_conexion()
    conn.execute("UPDATE usuarios SET token = NULL WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def obtener_usuario(usuario_id):
    conn = get_conexion()
    fila = conn.execute("SELECT * FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    conn.close()
    return _armar_usuario(fila) if fila else None


def actualizar_perfil(usuario_id, datos):
    """Actualiza solo los campos permitidos que vengan en 'datos'."""
    cambios = {k: datos[k] for k in CAMPOS_EDITABLES if k in datos}
    if not cambios:
        return obtener_usuario(usuario_id)

    asignaciones = ", ".join(f"{campo} = ?" for campo in cambios)
    valores = list(cambios.values()) + [usuario_id]

    conn = get_conexion()
    conn.execute(f"UPDATE usuarios SET {asignaciones} WHERE id = ?", valores)
    conn.commit()
    conn.close()
    return obtener_usuario(usuario_id)


def set_foto(usuario_id, nombre_archivo):
    conn = get_conexion()
    conn.execute(
        "UPDATE usuarios SET foto = ? WHERE id = ?", (nombre_archivo, usuario_id)
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Jugadores (usuarios con rol 'jugador')
# ---------------------------------------------------------------------------


def listar_jugadores():
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM usuarios WHERE rol = 'jugador' AND activo = 1 ORDER BY apellido, nombre"
    ).fetchall()
    conn.close()
    return [_armar_usuario(fila) for fila in filas]


def obtener_jugador(jugador_id):
    conn = get_conexion()
    fila = conn.execute(
        "SELECT * FROM usuarios WHERE id = ? AND rol = 'jugador'", (jugador_id,)
    ).fetchone()
    conn.close()
    return _armar_usuario(fila) if fila else None


# ---------------------------------------------------------------------------
# Sesiones de entrenamiento (carga)
# ---------------------------------------------------------------------------


def insertar_sesion(jugador_id, fecha, tipo, duracion_min, srpe, notas, sueno=None):
    carga_total = duracion_min * srpe

    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO sesiones
           (jugador_id, fecha, tipo, duracion_min, srpe, carga_total, sueno, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (jugador_id, fecha, tipo, duracion_min, srpe, carga_total, sueno, notas),
    )
    conn.commit()
    nueva_id = cursor.lastrowid
    conn.close()
    return nueva_id, carga_total


def sesiones_de_jugador(jugador_id):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM sesiones WHERE jugador_id = ? ORDER BY fecha", (jugador_id,)
    )
    filas = cursor.fetchall()
    conn.close()
    return [dict(fila) for fila in filas]


# Zona segun ACWR = carga aguda (7 dias) / carga cronica (28 dias).
# "Sweet spot" 0,80-1,30 (Gabbett). Umbrales editables: son criterio del CT.
def _zona_acwr(acwr):
    if acwr is None:
        return "sin_datos", "gris"
    if acwr < 0.80:
        return "atencion", "amarillo"
    if acwr <= 1.30:
        return "adecuada", "verde"
    if acwr <= 1.50:
        return "alta", "naranja"
    return "muy_alta", "rojo"


def _suma_carga(conn, jugador_id, desde):
    return conn.execute(
        "SELECT COALESCE(SUM(carga_total), 0) FROM sesiones WHERE jugador_id = ? AND fecha >= ?",
        (jugador_id, desde),
    ).fetchone()[0]


def _cargas_diarias(conn, jugador_id, dias):
    """Lista de carga diaria de los ultimos `dias` dias (del mas viejo al mas nuevo, 0 si no hubo)."""
    hoy = date.today()
    desde = (hoy - timedelta(days=dias - 1)).isoformat()
    filas = conn.execute(
        "SELECT fecha, SUM(carga_total) AS c FROM sesiones "
        "WHERE jugador_id = ? AND fecha >= ? GROUP BY fecha",
        (jugador_id, desde),
    ).fetchall()
    por_fecha = {f["fecha"]: f["c"] or 0 for f in filas}
    return [
        por_fecha.get((hoy - timedelta(days=i)).isoformat(), 0)
        for i in range(dias - 1, -1, -1)
    ]


def _ewma(serie, n):
    """Media movil exponencial (Williams et al.). serie ordenada del dia mas viejo al mas nuevo."""
    lam = 2 / (n + 1)
    valor = 0.0
    for carga in serie:
        valor = carga * lam + valor * (1 - lam)
    return valor


def _acwr_jugador(conn, jugador_id):
    """Devuelve ACWR por promedio movil (RA) y por EWMA, mas la zona resultante."""
    c7 = _suma_carga(conn, jugador_id, (date.today() - timedelta(days=6)).isoformat())
    c28 = _suma_carga(conn, jugador_id, (date.today() - timedelta(days=27)).isoformat())
    cronica_ra = c28 / 4 if c28 else 0
    acwr_ra = round(c7 / cronica_ra, 2) if cronica_ra else None

    serie = _cargas_diarias(conn, jugador_id, 42)  # 42 dias = margen para estabilizar la EWMA
    aguda_ewma = _ewma(serie, 7)
    cronica_ewma = _ewma(serie, 28)
    acwr_ewma = round(aguda_ewma / cronica_ewma, 2) if cronica_ewma else None

    referencia = acwr_ewma if acwr_ewma is not None else acwr_ra
    zona, semaforo = _zona_acwr(referencia)
    return {
        "carga_7d": c7,
        "carga_28d": c28,
        "acwr_ra": acwr_ra,
        "acwr_ewma": acwr_ewma,
        "zona": zona,
        "semaforo": semaforo,
    }


def resumen_carga(dias=7):
    """Agregados de carga para los graficos del plantel."""
    conn = get_conexion()
    hoy = date.today()
    desde_rango = (hoy - timedelta(days=dias - 1)).isoformat()

    # serie diaria del equipo (rellena los dias sin sesiones con 0)
    filas = conn.execute(
        "SELECT fecha, SUM(carga_total) AS carga FROM sesiones WHERE fecha >= ? GROUP BY fecha",
        (desde_rango,),
    ).fetchall()
    por_fecha = {f["fecha"]: f["carga"] or 0 for f in filas}
    serie_diaria = [
        {
            "fecha": (hoy - timedelta(days=i)).isoformat(),
            "carga": por_fecha.get((hoy - timedelta(days=i)).isoformat(), 0),
        }
        for i in range(dias - 1, -1, -1)
    ]

    jugadores_rows = conn.execute(
        "SELECT id, nombre, apellido, posicion_principal "
        "FROM usuarios WHERE rol = 'jugador' AND activo = 1"
    ).fetchall()

    por_jugador = []
    distribucion = {"adecuada": 0, "atencion": 0, "alta": 0, "muy_alta": 0, "sin_datos": 0}
    for j in jugadores_rows:
        m = _acwr_jugador(conn, j["id"])
        distribucion[m["zona"]] += 1
        por_jugador.append(
            {
                "jugador_id": j["id"],
                "nombre": f'{j["nombre"]} {j["apellido"]}'.strip(),
                "posicion": j["posicion_principal"],
                "carga_7d": m["carga_7d"],
                "acwr_ra": m["acwr_ra"],
                "acwr_ewma": m["acwr_ewma"],
                "zona": m["zona"],
                "semaforo": m["semaforo"],
            }
        )
    por_jugador.sort(key=lambda x: x["carga_7d"], reverse=True)

    pos_map = {}
    for pj in por_jugador:
        pos_map.setdefault(pj["posicion"] or "Sin posicion", []).append(pj["carga_7d"])
    por_posicion = sorted(
        (
            {"posicion": p, "carga_promedio": round(sum(v) / len(v))}
            for p, v in pos_map.items()
        ),
        key=lambda x: x["carga_promedio"],
        reverse=True,
    )

    tot = conn.execute(
        "SELECT COALESCE(SUM(carga_total), 0), COUNT(*) FROM sesiones WHERE fecha >= ?",
        (desde_rango,),
    ).fetchone()
    con_datos = [pj["carga_7d"] for pj in por_jugador if pj["carga_7d"] > 0]
    totales = {
        "carga_total": tot[0],
        "sesiones": tot[1],
        "carga_promedio": round(sum(con_datos) / len(con_datos)) if con_datos else 0,
    }

    conn.close()
    return {
        "rango_dias": dias,
        "serie_diaria": serie_diaria,
        "totales": totales,
        "por_jugador": por_jugador,
        "por_posicion": por_posicion,
        "distribucion": distribucion,
    }


def resumen_carga_jugador(jugador_id, dias=28):
    """Carga de un solo jugador: serie diaria + ACWR (RA y EWMA)."""
    conn = get_conexion()
    serie = _cargas_diarias(conn, jugador_id, dias)
    hoy = date.today()
    serie_diaria = [
        {"fecha": (hoy - timedelta(days=dias - 1 - i)).isoformat(), "carga": c}
        for i, c in enumerate(serie)
    ]
    m = _acwr_jugador(conn, jugador_id)
    conn.close()
    return {"jugador_id": jugador_id, "rango_dias": dias, "serie_diaria": serie_diaria, **m}


# ---------------------------------------------------------------------------
# Hidratacion (peso pre/post partido)
# ---------------------------------------------------------------------------
#
# Base clinica (ACSM / AMSSM Team Physician Consensus Statement):
#   - Deficit = peso_pre - peso_post  (aprox. liquido perdido por sudor)
#   - % perdida de peso corporal = deficit / peso_pre * 100
#   - Reposicion recomendada = 125-150% del deficit (1,25-1,5 L por kg perdido)
#   - No restringir sodio; bebida con electrolitos retiene mejor el liquido
#   - Ingesta fraccionada (no en bolo), dentro de las primeras 6 h
#   - > 5% de perdida o proxima competencia < 24 h => reposicion intensiva
#   - Desaconsejar alcohol (efecto diuretico)

# Umbrales de % de perdida de peso corporal. Editables: son criterio clinico.
HIDRATACION_MINIMA = 2.0   # < 2%   -> verde
HIDRATACION_MODERADA = 3.0  # 2-3%   -> amarillo
HIDRATACION_MARCADA = 5.0   # 3-5%   -> naranja
#                             >= 5%  -> rojo (severa)


def _clasificar_hidratacion(porcentaje):
    if porcentaje < HIDRATACION_MINIMA:
        return "minima", "verde"
    if porcentaje < HIDRATACION_MODERADA:
        return "moderada", "amarillo"
    if porcentaje < HIDRATACION_MARCADA:
        return "marcada", "naranja"
    return "severa", "rojo"


def _armar_hidratacion(fila):
    h = dict(fila)
    pre = h["peso_pre_kg"]
    deficit = round(pre - h["peso_post_kg"], 3)
    ingerido = h.get("liquido_ingerido_l") or 0
    horas_prox = h.get("horas_prox_competencia")

    h["deficit_kg"] = deficit
    h["recuperacion_rapida"] = horas_prox is not None and horas_prox < 24

    if deficit <= 0 or not pre:
        h["porcentaje_perdida"] = 0.0
        h["clasificacion"] = "sin_perdida"
        h["semaforo"] = "verde"
        h["reposicion_min_l"] = 0.0
        h["reposicion_max_l"] = 0.0
    else:
        h["porcentaje_perdida"] = round(deficit / pre * 100, 2)
        h["clasificacion"], h["semaforo"] = _clasificar_hidratacion(h["porcentaje_perdida"])
        h["reposicion_min_l"] = round(deficit * 1.25, 2)
        h["reposicion_max_l"] = round(deficit * 1.5, 2)

    if h.get("duracion_min"):
        h["tasa_sudoracion_l_h"] = round(
            (max(deficit, 0) + ingerido) / (h["duracion_min"] / 60), 2
        )
    else:
        h["tasa_sudoracion_l_h"] = None

    recomendaciones = []
    if deficit > 0:
        recomendaciones.append(
            f"Reponer 125-150% del deficit: {h['reposicion_min_l']}-{h['reposicion_max_l']} L "
            "en las proximas 6 h, de forma fraccionada (no en bolo)."
        )
        recomendaciones.append(
            "No restringir sodio: sumar sodio dietetico o bebida con electrolitos "
            "para retener el liquido y restaurar el volumen plasmatico."
        )
    if h["clasificacion"] == "severa" or h["recuperacion_rapida"]:
        recomendaciones.append(
            "Perdida severa (>5%) o proxima competencia <24 h: reposicion intensiva "
            "de liquidos y electrolitos."
        )
    if h.get("sudador_salado"):
        recomendaciones.append(
            "Sudador salado: la bebida deportiva con electrolitos restaura el balance "
            "hidrico hasta 3x mas rapido que el agua sola."
        )
    if deficit > 0:
        recomendaciones.append(
            "Evitar el consumo excesivo de alcohol en la recuperacion (efecto diuretico)."
        )
    if horas_prox is not None:
        recomendaciones.append(
            "Suspender la ingesta extra 0,5-1 h antes de la proxima competencia."
        )
    h["recomendaciones"] = recomendaciones
    return h


def insertar_hidratacion(
    jugador_id,
    fecha,
    peso_pre_kg,
    peso_post_kg,
    contexto="partido",
    liquido_ingerido_l=None,
    duracion_min=None,
    sudador_salado=False,
    horas_prox_competencia=None,
    notas="",
):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO hidratacion
           (jugador_id, fecha, contexto, peso_pre_kg, peso_post_kg, liquido_ingerido_l,
            duracion_min, sudador_salado, horas_prox_competencia, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            jugador_id,
            fecha,
            contexto,
            peso_pre_kg,
            peso_post_kg,
            liquido_ingerido_l,
            duracion_min,
            1 if sudador_salado else 0,
            horas_prox_competencia,
            notas,
        ),
    )
    conn.commit()
    nueva_id = cursor.lastrowid
    conn.close()
    return nueva_id


def obtener_hidratacion(registro_id):
    conn = get_conexion()
    fila = conn.execute(
        "SELECT * FROM hidratacion WHERE id = ?", (registro_id,)
    ).fetchone()
    conn.close()
    return _armar_hidratacion(fila) if fila else None


def hidratacion_de_jugador(jugador_id):
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM hidratacion WHERE jugador_id = ? ORDER BY fecha DESC", (jugador_id,)
    ).fetchall()
    conn.close()
    return [_armar_hidratacion(fila) for fila in filas]


def listar_hidratacion():
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM hidratacion ORDER BY fecha DESC"
    ).fetchall()
    conn.close()
    return [_armar_hidratacion(fila) for fila in filas]


# ---------------------------------------------------------------------------
# Lesiones
# ---------------------------------------------------------------------------


def _dias_entre(fecha_desde, fecha_hasta):
    d1 = date.fromisoformat(fecha_desde)
    d2 = date.fromisoformat(fecha_hasta)
    return (d2 - d1).days


LIDER_FASE = {
    "lesionado": "Fisioterapeuta",
    "disponible_entrenar": "Medico deportologo",
    "disponible_competir": "Cuerpo tecnico + jugador",
    "alta": "-",
}


def _armar_lesion(fila):
    lesion = dict(fila)
    estado = lesion.get("estado") or "lesionado"
    lesion["estado"] = estado
    lesion["estado_label"] = ESTADO_LESION_LABEL.get(estado, estado)
    lesion["semaforo"] = ESTADO_LESION_SEMAFORO.get(estado, "gris")
    lesion["activa"] = estado != "alta"
    lesion["fase_idx"] = ESTADOS_LESION.index(estado) if estado in ESTADOS_LESION else 0
    lesion["lider_actual"] = LIDER_FASE.get(estado, "-")

    hoy = date.today().isoformat()
    lesion["dia_actual"] = _dias_entre(lesion["fecha_lesion"], hoy) if lesion["activa"] else None

    # dias perdidos de competencia: hasta que quedo disponible para competir
    hasta = lesion.get("fecha_disponible_competir") or lesion.get("fecha_alta")
    if hasta:
        lesion["dias_baja"] = _dias_entre(lesion["fecha_lesion"], hasta)
    elif lesion["activa"]:
        lesion["dias_baja"] = _dias_entre(lesion["fecha_lesion"], hoy)
    else:
        lesion["dias_baja"] = None
    return lesion


def insertar_lesion(
    jugador_id,
    fecha_lesion,
    diagnostico,
    zona,
    lado,
    mecanismo,
    contacto,
    gravedad,
    dias_estimados,
    notas,
    criterios_proxima=None,
    autor=None,
):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO lesiones
           (jugador_id, fecha_lesion, diagnostico, zona, lado, mecanismo,
            contacto, gravedad, dias_estimados, notas, criterios_proxima, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lesionado')""",
        (
            jugador_id, fecha_lesion, diagnostico, zona, lado, mecanismo,
            1 if contacto else 0, gravedad, dias_estimados, notas, criterios_proxima,
        ),
    )
    nueva_id = cursor.lastrowid
    conn.commit()
    conn.close()
    _nota_lesion(nueva_id, autor, tipo="estado", estado="lesionado",
                 texto="Lesion registrada")
    return nueva_id


CAMPOS_LESION_EDITABLES = [
    "diagnostico", "zona", "lado", "mecanismo", "contacto",
    "gravedad", "dias_estimados", "criterios_proxima", "notas",
]


def actualizar_lesion(lesion_id, datos):
    cambios = {k: datos[k] for k in CAMPOS_LESION_EDITABLES if k in datos}
    if "contacto" in cambios:
        cambios["contacto"] = 1 if cambios["contacto"] else 0
    if not cambios:
        return obtener_lesion(lesion_id)
    asignaciones = ", ".join(f"{c} = ?" for c in cambios)
    conn = get_conexion()
    conn.execute(
        f"UPDATE lesiones SET {asignaciones} WHERE id = ?",
        list(cambios.values()) + [lesion_id],
    )
    conn.commit()
    conn.close()
    return obtener_lesion(lesion_id)


def cambiar_estado_lesion(lesion_id, nuevo_estado, autor=None, nota=None):
    hoy = date.today().isoformat()
    conn = get_conexion()
    sets = ["estado = ?"]
    vals = [nuevo_estado]
    if nuevo_estado == "disponible_competir":
        sets.append("fecha_disponible_competir = COALESCE(fecha_disponible_competir, ?)")
        vals.append(hoy)
    if nuevo_estado == "alta":
        sets.append("fecha_alta = ?")
        vals.append(hoy)
        sets.append("fecha_disponible_competir = COALESCE(fecha_disponible_competir, ?)")
        vals.append(hoy)
    if nuevo_estado in ("lesionado", "disponible_entrenar"):
        sets.append("fecha_alta = NULL")
    vals.append(lesion_id)
    conn.execute(f"UPDATE lesiones SET {', '.join(sets)} WHERE id = ?", vals)
    conn.commit()
    conn.close()
    _nota_lesion(lesion_id, autor, tipo="estado", estado=nuevo_estado,
                 texto=f"Pasa a: {ESTADO_LESION_LABEL.get(nuevo_estado, nuevo_estado)}")
    if nota:
        _nota_lesion(lesion_id, autor, tipo="nota", texto=nota)
    return obtener_lesion(lesion_id)


def _nota_lesion(lesion_id, autor, tipo="nota", estado=None, texto=None):
    conn = get_conexion()
    conn.execute(
        """INSERT INTO lesion_notas (lesion_id, autor_id, autor_nombre, autor_rol, tipo, estado, texto)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            lesion_id,
            autor["id"] if autor else None,
            f'{autor["nombre"]} {autor["apellido"]}'.strip() if autor else "Sistema",
            autor["rol"] if autor else None,
            tipo, estado, texto,
        ),
    )
    conn.commit()
    conn.close()


def agregar_nota_lesion(lesion_id, autor, texto):
    _nota_lesion(lesion_id, autor, tipo="nota", texto=texto)


def notas_de_lesion(lesion_id):
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM lesion_notas WHERE lesion_id = ? ORDER BY fecha DESC, id DESC",
        (lesion_id,),
    ).fetchall()
    conn.close()
    return [dict(f) for f in filas]


def insertar_archivo_lesion(lesion_id, nombre_archivo, nombre_original, titulo, tipo, tamano, autor):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO lesion_archivos
           (lesion_id, nombre_archivo, nombre_original, titulo, tipo, tamano, subido_por, subido_por_nombre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            lesion_id, nombre_archivo, nombre_original, titulo, tipo, tamano,
            autor["id"] if autor else None,
            f'{autor["nombre"]} {autor["apellido"]}'.strip() if autor else None,
        ),
    )
    conn.commit()
    nuevo_id = cursor.lastrowid
    conn.close()
    return nuevo_id


def archivos_de_lesion(lesion_id):
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM lesion_archivos WHERE lesion_id = ? ORDER BY subido_en DESC",
        (lesion_id,),
    ).fetchall()
    conn.close()
    return [dict(f) for f in filas]


def obtener_archivo_lesion(archivo_id):
    conn = get_conexion()
    fila = conn.execute(
        "SELECT * FROM lesion_archivos WHERE id = ?", (archivo_id,)
    ).fetchone()
    conn.close()
    return dict(fila) if fila else None


def eliminar_archivo_lesion(archivo_id):
    fila = obtener_archivo_lesion(archivo_id)
    if fila:
        conn = get_conexion()
        conn.execute("DELETE FROM lesion_archivos WHERE id = ?", (archivo_id,))
        conn.commit()
        conn.close()
    return fila


def listar_lesiones(solo_activas=False):
    conn = get_conexion()
    cursor = conn.cursor()
    if solo_activas:
        cursor.execute("SELECT * FROM lesiones WHERE estado != 'alta' ORDER BY fecha_lesion DESC")
    else:
        cursor.execute("SELECT * FROM lesiones ORDER BY fecha_lesion DESC")
    filas = cursor.fetchall()
    conn.close()
    lesiones = [_armar_lesion(f) for f in filas]
    if lesiones:
        nombres = _nombres_jugadores([l["jugador_id"] for l in lesiones])
        for l in lesiones:
            l["jugador_nombre"] = nombres.get(l["jugador_id"], "?")
    return lesiones


def _nombres_jugadores(ids):
    if not ids:
        return {}
    conn = get_conexion()
    q = ",".join("?" * len(set(ids)))
    filas = conn.execute(
        f"SELECT id, nombre, apellido FROM usuarios WHERE id IN ({q})", list(set(ids))
    ).fetchall()
    conn.close()
    return {f["id"]: f'{f["nombre"]} {f["apellido"]}'.strip() for f in filas}


def lesiones_de_jugador(jugador_id):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM lesiones WHERE jugador_id = ? ORDER BY fecha_lesion DESC",
        (jugador_id,),
    )
    filas = cursor.fetchall()
    conn.close()
    return [_armar_lesion(fila) for fila in filas]


def obtener_lesion(lesion_id):
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM lesiones WHERE id = ?", (lesion_id,))
    fila = cursor.fetchone()
    conn.close()
    if not fila:
        return None
    lesion = _armar_lesion(fila)
    lesion["jugador_nombre"] = _nombres_jugadores([lesion["jugador_id"]]).get(lesion["jugador_id"], "?")
    return lesion


# ---------------------------------------------------------------------------
# Calendario / planificacion (eventos)
# ---------------------------------------------------------------------------

CAMPOS_EVENTO = [
    "fecha", "tipo", "titulo", "hora_inicio", "hora_fin",
    "condicion", "lugar", "rival", "notas",
]


def insertar_evento(datos, creado_por=None):
    valores = {c: datos.get(c) for c in CAMPOS_EVENTO}
    valores["tipo"] = valores["tipo"] or "entrenamiento"
    conn = get_conexion()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO eventos
           (fecha, tipo, titulo, hora_inicio, hora_fin, condicion, lugar, rival, notas, creado_por)
           VALUES (:fecha, :tipo, :titulo, :hora_inicio, :hora_fin, :condicion, :lugar, :rival, :notas, :creado_por)""",
        {**valores, "creado_por": creado_por},
    )
    conn.commit()
    nuevo_id = cursor.lastrowid
    conn.close()
    return nuevo_id


def valores_eventos():
    """Valores ya usados en eventos, para autocompletar (datalists)."""
    conn = get_conexion()
    lugares = [r[0] for r in conn.execute(
        "SELECT DISTINCT lugar FROM eventos WHERE lugar IS NOT NULL AND lugar != '' ORDER BY lugar"
    ).fetchall()]
    rivales = [r[0] for r in conn.execute(
        "SELECT DISTINCT rival FROM eventos WHERE rival IS NOT NULL AND rival != '' ORDER BY rival"
    ).fetchall()]
    conn.close()
    return {"lugares": lugares, "rivales": rivales}


def listar_eventos(desde, hasta):
    conn = get_conexion()
    filas = conn.execute(
        "SELECT * FROM eventos WHERE fecha >= ? AND fecha <= ? "
        "ORDER BY fecha, COALESCE(hora_inicio, '99:99')",
        (desde, hasta),
    ).fetchall()
    conn.close()
    return [dict(f) for f in filas]


def obtener_evento(evento_id):
    conn = get_conexion()
    fila = conn.execute("SELECT * FROM eventos WHERE id = ?", (evento_id,)).fetchone()
    conn.close()
    return dict(fila) if fila else None


def actualizar_evento(evento_id, datos):
    cambios = {c: datos[c] for c in CAMPOS_EVENTO if c in datos}
    if not cambios:
        return obtener_evento(evento_id)
    asignaciones = ", ".join(f"{c} = ?" for c in cambios)
    conn = get_conexion()
    conn.execute(
        f"UPDATE eventos SET {asignaciones} WHERE id = ?",
        list(cambios.values()) + [evento_id],
    )
    conn.commit()
    conn.close()
    return obtener_evento(evento_id)


def eliminar_evento(evento_id):
    conn = get_conexion()
    conn.execute("DELETE FROM eventos WHERE id = ?", (evento_id,))
    conn.commit()
    conn.close()
