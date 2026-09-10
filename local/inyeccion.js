// Replica exactamente lo que doGet() hace al incrustar los datos en la página:
// saca la expresión del propio Codigo.gs y la evalúa con las funciones reales.
// Si mañana cambia doGet, esta prueba sigue el cambio sola.
const fs = require('fs'), path = require('path');
const { cargar } = require('./cargar.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
const m = src.match(/t\.datosIniciales = ([^;]+);/);
if (!m) throw new Error('no se encontró la asignación de datosIniciales en doGet');

const G = cargar();
module.exports = {
  expresion: m[1].trim(),
  serializar: (estado) =>
    new Function('obtenerEstado', 'paraIncrustarEnScript', 'JSON',
      'return ' + m[1].trim()
    )(() => estado, G.paraIncrustarEnScript, JSON)
};
