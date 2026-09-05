from flask import Flask, request, jsonify
import database as db

app = Flask(__name__)


@app.route("/api/jugadores", methods=["GET"])
def ruta_listar_jugadores():
    return jsonify(db.listar_jugadores())


@app.route("/api/jugadores", methods=["POST"])
def ruta_crear_jugador():
    data = request.get_json()
    nuevo_id = db.insertar_jugador(
        data.get("nombre"), data.get("numero_camiseta"), data.get("posicion")
    )
    return jsonify(db.obtener_jugador(nuevo_id)), 201


@app.route("/api/jugadores/<int:jugador_id>", methods=["GET"])
def ruta_obtener_jugador(jugador_id):
    jugador = db.obtener_jugador(jugador_id)
    if jugador is None:
        return jsonify({"error": "Jugador no encontrado"}), 404
    jugador["sesiones"] = db.sesiones_de_jugador(jugador_id)
    jugador["lesiones"] = db.lesiones_de_jugador(jugador_id)
    return jsonify(jugador)


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