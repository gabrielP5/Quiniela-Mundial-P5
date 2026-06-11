# ⚽ Quiniela ///26 — Mundial 2026

Quiniela de oficina para el Mundial 2026. Frontend estático (GitHub Pages) + Firebase (Auth + Firestore) en el plan gratuito **Spark**. Sin servidores, sin APIs de pago, sin build.

## Qué hace

- **Predicción de marcador por partido**, con cierre automático **1 hora antes** de cada partido (las horas las capturas tú).
- **Predicción de podio** (campeón, subcampeón y tercer lugar) con su propia fecha límite.
- Flujo *borrador → confirmar*: una predicción **confirmada ya no se puede modificar** (lo garantizan las reglas de Firestore, no solo el front).
- Los picks de los demás **se liberan hasta el cierre** del partido, para que nadie copie.
- **Posiciones**: tabla general, por grupo y por día.
- **Panel admin**: crear usuarios (con contraseña autogenerada), capturar partidos (manual o importando JSON), capturar resultados a mano y configurar puntos.

## Estructura

```
index.html
css/estilos.css
js/config-firebase.js   ← AQUÍ pegas tus llaves de Firebase
js/equipos.js           ← los 48 equipos en sus 12 grupos reales
js/app.js               ← lógica de usuarios
js/admin.js             ← lógica de admin
firestore.rules         ← reglas de seguridad (los candados de verdad)
seed/ejemplo_partidos.json
```

---

## Paso 1 — Crear el proyecto de Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto** (ej. `quiniela-mundial-26`). Google Analytics: desactívalo, no hace falta.
2. En el proyecto: **Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar** (solo la primera opción, no "vínculo de correo").
3. **Compilación → Firestore Database → Crear base de datos** → modo **producción** → región cercana (ej. `us-central1` o `northamerica-south1`).
4. **⚙️ Configuración del proyecto → Tus apps → ícono `</>` (Web)** → registra la app (sin Hosting) y copia el objeto `firebaseConfig`.
5. Pega esos valores en `js/config-firebase.js`. *(Estas llaves no son secretas: identifican el proyecto; la seguridad está en las reglas.)*

## Paso 2 — Publicar las reglas de seguridad

En **Firestore Database → Reglas**, borra lo que haya, pega el contenido completo de `firestore.rules` y dale **Publicar**.

## Paso 3 — Crearte como admin (una sola vez)

1. **Authentication → Users → Agregar usuario**: tu correo y una contraseña tuya.
2. Copia el **UID** del usuario que se creó.
3. **Firestore → Iniciar colección**: colección `admins`, ID del documento = **tu UID**, agrégale un campo cualquiera (ej. `nombre: "Oppenheimer"`). Guardar.
4. (Opcional pero recomendado) Crea también tu perfil: colección `users`, ID = tu UID, campo `nombre` con tu nombre para mostrar.

¡Listo! Al entrar a la página con ese correo verás la pestaña **Admin**.

## Paso 4 — Configuración inicial dentro de la app

En la pestaña **Admin → Configuración**:

- Define la **fecha límite del podio** (sin esto nadie puede guardar su podio — las reglas lo exigen).
- Ajusta los puntos si quieres (default: exacto 5, ganador+diferencia 3, solo ganador 2; podio 10/6/4).

Luego captura los **partidos**: uno por uno con el formulario, o en bloque con **Importar JSON** (formato en `seed/ejemplo_partidos.json`). La hora del formulario se interpreta en **tu zona horaria local** (Monterrey); en el JSON usa ISO con offset, ej. `2026-06-11T13:00:00-06:00`. ⚠️ Verifica horas y sedes contra el calendario oficial de FIFA antes de importar.

## Paso 5 — Crear a los de la oficina

**Admin → Crear usuario**: nombre + correo real → la app genera la contraseña y te la muestra **una sola vez** para que se las pases. La contraseña no es de un solo uso; si alguien la pierde, usa "Olvidé mi contraseña" en el login (por eso conviene correo real).

## Paso 6 — Subir a GitHub Pages

```bash
git init
git add .
git commit -m "Quiniela Mundial 2026"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/quiniela-mundial-26.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**. En un par de minutos queda en `https://TU_USUARIO.github.io/quiniela-mundial-26/`.

> El repo puede ser **público** sin problema (las llaves de Firebase no son secretas), pero si prefieres repo privado, GitHub Pages con repo privado requiere plan de pago — alternativa gratuita: Netlify o Cloudflare Pages, que sirven igual porque todo es estático.

**Último candado:** en Firebase **Authentication → Settings → Dominios autorizados**, agrega `TU_USUARIO.github.io` (y deja `localhost` para pruebas).

---

## Operación diaria (tú como admin)

- **Resultados**: pestaña Admin → "Capturar resultados" (solo aparecen partidos que ya iniciaron). También puedes editar el campo `resultado: {home, away}` directo en Firestore si prefieres.
- **Eliminatorias**: crea los partidos con equipo "Por definir" y edítalos cuando se conozcan los cruces, o créalos hasta que se definan.
- **Podio real**: al final del torneo captúralo en Configuración para que sume a la tabla general.

## Costos / tier gratuito

Con ~10–30 participantes esto vive cómodo en el plan Spark (50k lecturas/día, 20k escrituras/día). La app además cachea en el navegador los picks de partidos ya terminados para no re-leerlos. Si algún día vieras el límite, la palanca fácil es revisar la pestaña Posiciones con menos frecuencia (es la que más lee).

## Detalles de diseño

La identidad visual evoca el lenguaje del Mundial 2026 — el tricolor de los tres anfitriones (verde MEX / crema / rojo CAN / cian USA), tipografía de marcador (`Archivo Black`) y la firma `///26` — sin usar logos ni marcas oficiales de FIFA, que son material registrado.
