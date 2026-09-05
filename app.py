import os
from functools import wraps

from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.utils import secure_filename

import database as db

app = Flask(__name__, static_folder="static", static_url_path="")


@app.route("/")
def index():
    return app.send_static_file("index.html")

# Carpeta donde se guardan las fotos de perfil (fuera de git)
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

EXTENSIONES_IMAGEN = {"png", "jpg", "jpeg", "webp"}
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB por archivo


# ---------------------------------------------------------------------------
# Autenticacion: "quien es el usuario de esta peticion"
# ---------------------------------------------------------------------------


def _usuario_actual():
    """Lee el token del header 'Authorization: Bearer <token>' y devuelve el usuario."""
    encabezado = request.headers.get("Authorization", "")
    token = encabezado[7:].strip() if encabezado.startswith("Bearer ") else ""
    return db.usuario_por_token(token)


def login_requerido(vista):
    """Decorador: corta con 401 si no hay sesion; si hay, deja el usuario en g.usuario."""

    @wraps(vista)
    def envoltorio(*args, **kwargs):
        usuario = _usuario_actual()
        if usuario is None:
            return jsonify({"error": "Necesitas iniciar sesion"}), 401
        g.usuario = usuario
        return vista(*args, **kwargs)

    return envoltorio


@app.errorhandler(413)
def archivo_muy_grande(_error):
    return jsonify({"error": "El archivo supera el limite de 5 MB"}), 413


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

    for campo in ("posicion_principal", "posicion_secundaria"):
        valor = data.get(campo)
        if valor and valor not in db.POSICIONES:
            return jsonify(
                {"error": f"{campo} invalida. Opciones: {', '.join(db.POSICIONES)}"}
            ), 400

    nuevo_id = db.crear_usuario(
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
    for campo in ("posicion_principal", "posicion_secundaria"):
        valor = data.get(campo)
        if valor and valor not in db.POSICIONES:
            return jsonify(
                {"error": f"{campo} invalida. Opciones: {', '.join(db.POSICIONES)}"}
            ), 400
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
def ruta_ver_foto(jugador_id):
    usuario = db.obtener_usuario(jugador_id)
    if usuario is None or not usuario.get("foto"):
        return jsonify({"error": "Sin foto"}), 404
    return send_from_directory(UPLOAD_DIR, usuario["foto"])


# ---------------------------------------------------------------------------
# Jugadores
# ---------------------------------------------------------------------------


@app.route("/api/jugadores", methods=["GET"])
@login_requerido
def ruta_listar_jugadores():
    return jsonify(db.listar_jugadores())


@app.route("/api/jugadores/<int:jugador_id>", methods=["GET"])
@login_requerido
def ruta_obtener_jugador(jugador_id):
    jugador = db.obtener_jugador(jugador_id)
    if jugador is None:
        return jsonify({"error": "Jugador no encontrado"}), 404
    jugador["sesiones"] = db.sesiones_de_jugador(jugador_id)
    jugador["lesiones"] = db.lesiones_de_jugador(jugador_id)
    jugador["hidratacion"] = db.hidratacion_de_jugador(jugador_id)
    return jsonify(jugador)


# ---------------------------------------------------------------------------
# Sesiones de entrenamiento (carga)
# ---------------------------------------------------------------------------


@app.route("/api/sesiones", methods=["POST"])
def ruta_crear_sesion():
    data = request.get_json()
    nueva_id, carga_total = db.insertar_sesion(
        data.get("jugador_id"),
        data.get("fecha"),
        data.get("tipo"),
        data.get("duracion_min"),
        data.get("srpe"),
        data.get("notas", ""),
    )
    return jsonify({"id": nueva_id, "carga_total": carga_total}), 201


@app.route("/api/sesiones/<int:jugador_id>", methods=["GET"])
def ruta_sesiones_de_jugador(jugador_id):
    return jsonify(db.sesiones_de_jugador(jugador_id))


# ---------------------------------------------------------------------------
# Hidratacion (peso pre/post)
# ---------------------------------------------------------------------------


@app.route("/api/hidratacion", methods=["GET"])
def ruta_listar_hidratacion():
    return jsonify(db.listar_hidratacion())


@app.route("/api/hidratacion", methods=["POST"])
def ruta_crear_hidratacion():
    data = request.get_json() or {}

    faltantes = [c for c in ("jugador_id", "fecha", "peso_pre_kg", "peso_post_kg") if data.get(c) in (None, "")]
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
        jugador_id=data["jugador_id"],
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
def ruta_hidratacion_de_jugador(jugador_id):
    return jsonify(db.hidratacion_de_jugador(jugador_id))


# ---------------------------------------------------------------------------
# Lesiones
# ---------------------------------------------------------------------------


@app.route("/api/lesiones", methods=["GET"])
def ruta_listar_lesiones():
    solo_activas = request.args.get("activas") in ("1", "true", "si")
    return jsonify(db.listar_lesiones(solo_activas))


@app.route("/api/lesiones", methods=["POST"])
def ruta_crear_lesion():
    data = request.get_json()
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
    )
    return jsonify(db.obtener_lesion(nueva_id)), 201


@app.route("/api/lesiones/<int:jugador_id>", methods=["GET"])
def ruta_lesiones_de_jugador(jugador_id):
    return jsonify(db.lesiones_de_jugador(jugador_id))


@app.route("/api/lesiones/<int:lesion_id>/alta", methods=["POST"])
def ruta_registrar_alta(lesion_id):
    if db.obtener_lesion(lesion_id) is None:
        return jsonify({"error": "Lesion no encontrada"}), 404
    data = request.get_json()
    db.registrar_alta(lesion_id, data.get("fecha_alta"))
    return jsonify(db.obtener_lesion(lesion_id))


db.crear_tablas()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
