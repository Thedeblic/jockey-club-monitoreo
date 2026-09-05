/* Cliente HTTP: agrega el token a cada pedido y desempaqueta el JSON. */
const API = {
  token: localStorage.getItem("jch_token") || null,

  setToken(t) {
    this.token = t || null;
    if (t) localStorage.setItem("jch_token", t);
    else localStorage.removeItem("jch_token");
  },

  async req(method, path, body, isForm) {
    const headers = {};
    if (this.token) headers["Authorization"] = "Bearer " + this.token;

    const opts = { method, headers };
    if (body !== undefined && !isForm) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    } else if (isForm) {
      opts.body = body;
    }

    const res = await fetch("/api" + path, opts);
    const data = res.status === 204 ? null : await res.json().catch(() => null);

    if (res.status === 401) {
      API.setToken(null);
      if (!location.hash.startsWith("#/login")) location.reload();
    }
    if (!res.ok) {
      throw new Error((data && data.error) || "Error " + res.status);
    }
    return data;
  },

  get(p) { return this.req("GET", p); },
  post(p, b) { return this.req("POST", p, b); },
  put(p, b) { return this.req("PUT", p, b); },
  del(p) { return this.req("DELETE", p); },
  postForm(p, f) { return this.req("POST", p, f, true); },

  async blob(path) {
    const headers = {};
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    const res = await fetch("/api" + path, { headers });
    if (!res.ok) throw new Error("No se pudo abrir el archivo (" + res.status + ")");
    return res.blob();
  },
};
