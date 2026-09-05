import os
import secrets
from functools import wraps

from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.utils import secure_filename

import database as db

app = Flask(__name__, static_folder="static", static_url_path="")
# En desarrollo no cachear los archivos estaticos (asi los cambios se ven al recargar)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

# Carpetas de subida (fuera de git)
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
UPLOAD_LESIONES_DIR = os.path.join(UPLOAD_DIR, "lesiones")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(UPLOAD_LESIONES_DIR, exist_ok=True)

EXTENSIONES_IMAGEN = {"png", "jpg", "jpeg", "webp"}
EXTENSIONES_ARCHIVO = {"pdf", "png", "jpg", "jpeg", "webp"}
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024  # 15 MB por archivo


@app.route("/")
def index():
    return app.send_static_file("index.html")


# ---------------------------------------------------------------------------
# Autenticacion y roles
#
#   - jugador        -> registra SU carga / hidratacion, ve solo SUS datos
#   - cuerpo_tecnico -> NO registra carga/hidratacion; ve todo el plantel
#                       y registra lesiones (parte medica)
# ---------------------------------------------------------------------------


def _usuario_actual():
    """Lee el token del header 'Authorization: Bearer <token>' y devuelve el usuario."""
    encabezado = request.headers.get("Authorization", "")
    token = encabezado[7:].strip() if encabezado.startswith("Bearer ") else ""
    return db.usuario_por_token(token)


def _con_usuario(vista, verificar=None):
    @wraps(vista)
    def envoltorio(*args, **kwargs):
        usuario = _usuario_actual()
        if usuario is None:
            return jsonify({"error": "Necesitas iniciar sesion"}), 401
        g.usuario = usuario
        if verificar:
            error = verificar(usuario)
            if error:
                return error
        return vista(*args, **kwargs)

    return envoltorio


def login_requerido(vista):
    return _con_usuario(vista)


def solo_ct(vista):
    def check(u):
        if not db.es_ct(u["rol"]):
            return jsonify({"error": "Reservado para el cuerpo tecnico"}), 403
    return _con_usuario(vista, check)


def solo_jugador(vista):
    def check(u):
        if u["rol"] != "jugador":
            return jsonify({"error": "Cada jugador registra sus propios datos"}), 403
    return _con_usuario(vista, check)


def solo_lesiones(vista):
    """Departamento medico: medico deportologo y fisioterapeuta."""
    def check(u):
        if u["rol"] not in db.ROLES_LESIONES:
            return jsonify({"error": "Solo el departamento medico gestiona lesiones"}), 403
    return _con_usuario(vista, check)


def solo_calendario(vista):
    def check(u):
        if u["rol"] not in db.ROLES_CALENDARIO:
            return jsonify({"error": "La planificacion la maneja el entrenador o el PF"}), 403
    return _con_usuario(vista, check)


def _puede_ver(jugador_id):
    """Un jugador solo se ve a si mismo; el CT ve a cualquiera."""
    return db.es_ct(g.usuario["rol"]) or g.usuario["id"] == jugador_id


@app.errorhandler(413)
def archivo_muy_grande(_error):
    return jsonify({"error": "El archivo supera el limite permitido"}), 413


def _validar_perfil(data):
    """Devuelve un mensaje de error si algun campo del perfil es invalido, o None."""
    for campo in ("posicion_principal", "posicion_secundaria"):
        v = data.get(campo)
        if v and v not in db.POSICIONES:
            return f"{campo} invalida. Opciones: {', '.join(db.POSICIONES)}"
    if data.get("lateralidad") and data["lateralidad"] not in db.LATERALIDADES:
        return f"lateralidad invalida. Opciones: {', '.join(db.LATERALIDADES)}"
    if data.get("posicion_defensiva") and str(data["posicion_defensiva"]) not in db.POSICIONES_DEFENSIVAS:
        return f"posicion_defensiva invalida. Opciones: {', '.join(db.POSICIONES_DEFENSIVAS)}"
    return None


# ---------------------------------------------------------------------------
# Registro / login / perfil
# ---------------------------------------------------------------------------


@app.route("/api/registro", methods=["POST"])
def ruta_registro():
    data = request.get_json() or {}

    obligatorios = ["email", "password", "nombre", "apellido", "fecha_nacimiento"]
    faltantes = [campo for campo in obligatorios if not data.get(campo)]
    if faltantes:
        return jsonify({"error": f"Faltan datos: {', '.join(faltantes)}"}), 400

    if len(data["password"]) < 8:
        return jsonify({"error": "La contrasena debe tener al menos 8 caracteres"}), 400

    if db.email_existe(data["email"]):
        return jsonify({"error": "Ya existe una cuenta con ese email"}), 409

    err = _validar_perfil(data)
    if err:
        return jsonify({"error": err}), 400

    db.crear_usuario(
        email=data["email"],
        password=data["password"],
        nombre=data["nombre"],
        apellido=data["apellido"],
        fecha_nacimiento=data["fecha_nacimiento"],
        altura_cm=data.get("altura_cm"),
        peso_kg=data.get("peso_kg"),
        posicion_principal=data.get("posicion_principal"),
        posicion_secundaria=data.get("posicion_secundaria"),
        numero_camiseta=data.get("numero_camiseta"),
        lateralidad=data.get("lateralidad"),
        posicion_defensiva=data.get("posicion_defensiva"),
    )

    usuario, token = db.autenticar(data["email"], data["password"])
    return jsonify({"token": token, "usuario": usuario}), 201


@app.route("/api/login", methods=["POST"])
def ruta_login():
    data = request.get_json() or {}
    usuario, token = db.autenticar(data.get("email", ""), data.get("password", ""))
    if usuario is None:
        return jsonify({"error": "Email o contrasena incorrectos"}), 401
    return jsonify({"token": token, "usuario": usuario})


@app.route("/api/logout", methods=["POST"])
@login_requerido
def ruta_logout():
    encabezado = request.headers.get("Authorization", "")
    db.cerrar_sesion(encabezado[7:].strip())
    return jsonify({"ok": True})


@app.route("/api/perfil", methods=["GET"])
@login_requerido
def ruta_ver_perfil():
    return jsonify(g.usuario)


@app.route("/api/perfil", methods=["PUT"])
@login_requerido
def ruta_editar_perfil():
    data = request.get_json() or {}
    err = _validar_perfil(data)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(db.actualizar_perfil(g.usuario["id"], data))


@app.route("/api/perfil/foto", methods=["POST"])
@login_requerido
def ruta_subir_foto():
    archivo = request.files.get("foto")
    if archivo is None or archivo.filename == "":
        return jsonify({"error": "No se envio ninguna imagen"}), 400

    extension = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else ""
    if extension not in EXTENSIONES_IMAGEN:
        return jsonify(
            {"error": f"Formato no permitido. Usa: {', '.join(EXTENSIONES_IMAGEN)}"}
        ), 400

    nombre = secure_filename(f"perfil_{g.usuario['id']}.{extension}")
    archivo.save(os.path.join(UPLOAD_DIR, nombre))
    db.set_foto(g.usuario["id"], nombre)
    return jsonify(db.obtener_usuario(g.usuario["id"]))


@app.route("/api/jugadores/<int:jugador_id>/foto", methods=["GET"])
@login_requerido
def ruta_ver_foto(jugador_id):
    usuario = db.obtener_usuario(jugador_id)
    if usuario is None or not usuario.get("foto"):
        return jsonify({"error": "Sin foto"}), 404
    return send_from_directory(UPLOAD_DIR, usuario["foto"])


# ---------------------------------------------------------------------------
# Jugadores
# ---------------------------------------------------------------------------


@app.route("/api/jugadores", methods=["GET"])
@solo_ct
def ruta_listar_jugadores():
    return jsonify(db.listar_jugadores())


@app.route("/api/jugadores/<int:jugador_id>", methods=["GET"])
@login_requerido
def ruta_obtener_jugador(jugador_id):
    if not _puede_ver(jugador_id):
        return jsonify({"error": "No podes ver los datos de otro jugador"}), 403
    jugador = db.obtener_jugador(jugador_id)
    if jugador is None:
        return jsonify({"error": "Jugador no encontrado"}), 404
    jugador["sesiones"] = db.sesiones_de_jugador(jugador_id)
    jugador["lesiones"] = db.lesiones_de_jugador(jugador_id)
    jugador["hidratacion"] = db.hidratacion_de_jugador(jugador_id)
    return jsonify(jugador)


# ---------------------------------------------------------------------------
# Sesiones de entrenamiento (carga) - las registra el propio jugador
# ---------------------------------------------------------------------------


@app.route("/api/sesiones", methods=["POST"])
@solo_jugador
def ruta_crear_sesion():
    data = request.get_json() or {}
    nueva_id, carga_total = db.insertar_sesion(
        g.usuario["id"],
        data.get("fecha"),
        data.get("tipo"),
        data.get("duracion_min"),
        data.get("srpe"),
        data.get("notas", ""),
        sueno=data.get("sueno"),
    )
    return jsonify({"id": nueva_id, "carga_total": carga_total}), 201


@app.route("/api/sesiones/<int:jugador_id>", methods=["GET"])
@login_requerido
def ruta_sesiones_de_jugador(jugador_id):
    if not _puede_ver(jugador_id):
        return jsonify({"error": "No podes ver los datos de otro jugador"}), 403
    return jsonify(db.sesiones_de_jugador(jugador_id))


@app.route("/api/carga/resumen", methods=["GET"])
@solo_ct
def ruta_resumen_carga():
    try:
        dias = int(request.args.get("dias", 7))
    except (TypeError, ValueError):
        dias = 7
    return jsonify(db.resumen_carga(max(1, min(dias, 90))))


@app.route("/api/carga/jugador/<int:jugador_id>", methods=["GET"])
@login_requerido
def ruta_carga_jugador(jugador_id):
    if not _puede_ver(jugador_id):
        return jsonify({"error": "No podes ver los datos de otro jugador"}), 403
    return jsonify(db.resumen_carga_jugador(jugador_id))


# ---------------------------------------------------------------------------
# Hidratacion - la registra el propio jugador
# ---------------------------------------------------------------------------


@app.route("/api/hidratacion", methods=["GET"])
@solo_ct
def ruta_listar_hidratacion():
    return jsonify(db.listar_hidratacion())


@app.route("/api/hidratacion", methods=["POST"])
@solo_jugador
def ruta_crear_hidratacion():
    data = request.get_json() or {}

    faltantes = [c for c in ("fecha", "peso_pre_kg", "peso_post_kg") if data.get(c) in (None, "")]
    if faltantes:
        return jsonify({"error": f"Faltan datos: {', '.join(faltantes)}"}), 400

    try:
        pre = float(data["peso_pre_kg"])
        post = float(data["peso_post_kg"])
    except (TypeError, ValueError):
        return jsonify({"error": "El peso debe ser un numero"}), 400
    if pre <= 0 or post <= 0:
        return jsonify({"error": "El peso debe ser mayor a 0"}), 400

    nueva_id = db.insertar_hidratacion(
        jugador_id=g.usuario["id"],
        fecha=data["fecha"],
        peso_pre_kg=pre,
        peso_post_kg=post,
        contexto=data.get("contexto", "partido"),
        liquido_ingerido_l=data.get("liquido_ingerido_l"),
        duracion_min=data.get("duracion_min"),
        sudador_salado=data.get("sudador_salado", False),
        horas_prox_competencia=data.get("horas_prox_competencia"),
        notas=data.get("notas", ""),
    )
    return jsonify(db.obtener_hidratacion(nueva_id)), 201


@app.route("/api/hidratacion/<int:jugador_id>", methods=["GET"])
@login_requerido
def ruta_hidratacion_de_jugador(jugador_id):
    if not _puede_ver(jugador_id):
        return jsonify({"error": "No podes ver los datos de otro jugador"}), 403
    return jsonify(db.hidratacion_de_jugador(jugador_id))


# ---------------------------------------------------------------------------
# Lesiones + continuo de retorno al juego (RTS) - departamento medico
# ---------------------------------------------------------------------------


@app.route("/api/lesiones", methods=["GET"])
@solo_ct
def ruta_listar_lesiones():
    solo_activas = request.args.get("activas") in ("1", "true", "si")
    return jsonify(db.listar_lesiones(solo_activas))


@app.route("/api/lesiones", methods=["POST"])
@solo_lesiones
def ruta_crear_lesion():
    data = request.get_json() or {}
    if not data.get("jugador_id") or not data.get("fecha_lesion") or not data.get("diagnostico"):
        return jsonify({"error": "La lesion necesita jugador, fecha y diagnostico"}), 400
    if db.obtener_jugador(data["jugador_id"]) is None:
        return jsonify({"error": "Ese jugador no existe"}), 400
    nueva_id = db.insertar_lesion(
        data.get("jugador_id"),
        data.get("fecha_lesion"),
        data.get("diagnostico"),
        data.get("zona"),
        data.get("lado"),
        data.get("mecanismo"),
        data.get("contacto", False),
        data.get("gravedad"),
        data.get("dias_estimados"),
        data.get("notas", ""),
        criterios_proxima=data.get("criterios_proxima"),
        autor=g.usuario,
    )
    return jsonify(db.obtener_lesion(nueva_id)), 201


@app.route("/api/lesion/<int:lesion_id>", methods=["GET"])
@solo_ct
def ruta_obtener_lesion(lesion_id):
    lesion = db.obtener_lesion(lesion_id)
    if lesion is None:
        return jsonify({"error": "Lesion no encontrada"}), 404
    lesion["timeline"] = db.notas_de_lesion(lesion_id)
    lesion["archivos"] = db.archivos_de_lesion(lesion_id)
    return jsonify(lesion)


@app.route("/api/lesion/<int:lesion_id>/archivo", methods=["POST"])
@solo_lesiones
def ruta_subir_archivo_lesion(lesion_id):
    if db.obtener_lesion(lesion_id) is None:
        return jsonify({"error": "Lesion no encontrada"}), 404
    archivo = request.files.get("archivo")
    if archivo is None or archivo.filename == "":
        return jsonify({"error": "No se envio ningun archivo"}), 400

    ext = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else ""
    if ext not in EXTENSIONES_ARCHIVO:
        return jsonify(
            {"error": f"Formato no permitido. Se aceptan: {', '.join(sorted(EXTENSIONES_ARCHIVO))}"}
        ), 400

    nombre_guardado = f"{secrets.token_hex(12)}.{ext}"
    ruta = os.path.join(UPLOAD_LESIONES_DIR, nombre_guardado)
    archivo.save(ruta)
    tamano = os.path.getsize(ruta)

    db.insertar_archivo_lesion(
        lesion_id,
        nombre_guardado,
        secure_filename(archivo.filename) or f"archivo.{ext}",
        (request.form.get("titulo") or "").strip() or None,
        ext,
        tamano,
        g.usuario,
    )
    return jsonify(db.archivos_de_lesion(lesion_id)), 201


@app.route("/api/lesion/<int:lesion_id>/archivos", methods=["GET"])
@solo_ct
def ruta_archivos_lesion(lesion_id):
    return jsonify(db.archivos_de_lesion(lesion_id))


@app.route("/api/archivo/<int:archivo_id>", methods=["GET"])
@solo_ct
def ruta_descargar_archivo(archivo_id):
    archivo = db.obtener_archivo_lesion(archivo_id)
    if archivo is None:
        return jsonify({"error": "Archivo no encontrado"}), 404
    return send_from_directory(
        UPLOAD_LESIONES_DIR,
        archivo["nombre_archivo"],
        download_name=archivo["nombre_original"],
        as_attachment=request.args.get("descargar") == "1",
    )


@app.route("/api/lesion/<int:lesion_id>/archivo/<int:archivo_id>", methods=["DELETE"])
@solo_lesiones
def ruta_eliminar_archivo_lesion(lesion_id, archivo_id):
    archivo = db.eliminar_archivo_lesion(archivo_id)
    if archivo is None:
        return jsonify({"error": "Archivo no encontrado"}), 404
    try:
        os.remove(os.path.join(UPLOAD_LESIONES_DIR, archivo["nombre_archivo"]))
    except OSError:
        pass
    return jsonify({"ok": True})


@app.route("/api/lesion/<int:lesion_id>", methods=["PUT"])
@solo_lesiones
def ruta_editar_lesion(lesion_id):
    if db.obtener_lesion(lesion_id) is None:
        return jsonify({"error": "Lesion no encontrada"}), 404
    return jsonify(db.actualizar_lesion(lesion_id, request.get_json() or {}))


@app.route("/api/lesion/<int:lesion_id>/estado", methods=["POST"])
@solo_lesiones
def ruta_cambiar_estado_lesion(lesion_id):
    lesion = db.obtener_lesion(lesion_id)
    if lesion is None:
        return jsonify({"error": "Lesion no encontrada"}), 404
    data = request.get_json() or {}
    nuevo = data.get("estado")
    if nuevo not in db.ESTADOS_LESION:
        return jsonify({"error": f"Estado invalido. Opciones: {', '.join(db.ESTADOS_LESION)}"}), 400
    # Regla del manual: habilitar competir o dar el alta lo hace el medico
    if nuevo in db.ESTADO_REQUIERE_MEDICO and g.usuario["rol"] not in ("medico", "cuerpo_tecnico"):
        return jsonify({"error": "Solo el medico deportologo habilita competir o da el alta"}), 403
    return jsonify(db.cambiar_estado_lesion(lesion_id, nuevo, autor=g.usuario, nota=data.get("nota")))


@app.route("/api/lesion/<int:lesion_id>/nota", methods=["POST"])
@solo_lesiones
def ruta_nota_lesion(lesion_id):
    if db.obtener_lesion(lesion_id) is None:
        return jsonify({"error": "Lesion no encontrada"}), 404
    texto = (request.get_json() or {}).get("texto", "").strip()
    if not texto:
        return jsonify({"error": "La nota esta vacia"}), 400
    db.agregar_nota_lesion(lesion_id, g.usuario, texto)
    return jsonify({"ok": True, "timeline": db.notas_de_lesion(lesion_id)}), 201


@app.route("/api/lesiones/<int:jugador_id>", methods=["GET"])
@login_requerido
def ruta_lesiones_de_jugador(jugador_id):
    if not _puede_ver(jugador_id):
        return jsonify({"error": "No podes ver los datos de otro jugador"}), 403
    return jsonify(db.lesiones_de_jugador(jugador_id))


# ---------------------------------------------------------------------------
# Calendario - lo ve todo el mundo, solo el CT lo edita
# ---------------------------------------------------------------------------


@app.route("/api/eventos", methods=["GET"])
@login_requerido
def ruta_listar_eventos():
    desde = request.args.get("desde")
    hasta = request.args.get("hasta")
    if not desde or not hasta:
        return jsonify({"error": "Faltan los parametros desde y hasta"}), 400
    return jsonify(db.listar_eventos(desde, hasta))


@app.route("/api/eventos/valores", methods=["GET"])
@login_requerido
def ruta_valores_eventos():
    return jsonify(db.valores_eventos())


@app.route("/api/eventos", methods=["POST"])
@solo_calendario
def ruta_crear_evento():
    data = request.get_json() or {}
    if not data.get("fecha") or not data.get("titulo"):
        return jsonify({"error": "El evento necesita fecha y titulo"}), 400
    if data.get("tipo") and data["tipo"] not in db.TIPOS_EVENTO:
        return jsonify({"error": f"Tipo invalido. Opciones: {', '.join(db.TIPOS_EVENTO)}"}), 400
    nuevo_id = db.insertar_evento(data, creado_por=g.usuario["id"])
    return jsonify(db.obtener_evento(nuevo_id)), 201


@app.route("/api/eventos/<int:evento_id>", methods=["PUT"])
@solo_calendario
def ruta_editar_evento(evento_id):
    if db.obtener_evento(evento_id) is None:
        return jsonify({"error": "Evento no encontrado"}), 404
    data = request.get_json() or {}
    if data.get("tipo") and data["tipo"] not in db.TIPOS_EVENTO:
        return jsonify({"error": f"Tipo invalido. Opciones: {', '.join(db.TIPOS_EVENTO)}"}), 400
    return jsonify(db.actualizar_evento(evento_id, data))


@app.route("/api/eventos/<int:evento_id>", methods=["DELETE"])
@solo_calendario
def ruta_eliminar_evento(evento_id):
    if db.obtener_evento(evento_id) is None:
        return jsonify({"error": "Evento no encontrado"}), 404
    db.eliminar_evento(evento_id)
    return jsonify({"ok": True})


db.crear_tablas()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
