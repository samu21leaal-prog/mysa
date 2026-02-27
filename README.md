# Mini ERP — Guía de instalación en Vercel

## Estructura del proyecto

```
mini-erp/
├── api/
│   ├── ml-callback.js   ← Recibe el token de ML después del login
│   ├── ml-orders.js     ← Trae las órdenes reales de ML
│   └── ml-refresh.js    ← Renueva el token cuando expira
├── public/
│   └── index.html       ← El ERP completo
├── vercel.json          ← Configuración de rutas
└── README.md
```

---

## Paso 1 — Crear app en Mercado Libre Developers

1. Entrá a https://developers.mercadolibre.com.ar
2. Iniciá sesión con tu cuenta de ML
3. Hacé clic en "Crear aplicación"
4. Completá los datos:
   - **Nombre**: Mini ERP (o el que quieras)
   - **Industria**: Ecommerce
   - **URI de redirect**: `https://TU-APP.vercel.app/api/ml-callback`
     ⚠ Primero subí a Vercel (paso 3) para saber la URL exacta, y después volvé a completar esto
5. Guardá y copiá el **App ID (Client ID)** y el **Secret Key (Client Secret)**

---

## Paso 2 — Subir a Vercel

### Opción A: Drag & Drop (más fácil)
1. Entrá a https://vercel.com y creá una cuenta gratis
2. Hacé clic en "Add New Project"
3. Elegí "Browse" y seleccioná la carpeta `mini-erp` completa
4. Vercel la detecta automáticamente. Hacé clic en **Deploy**

### Opción B: Con GitHub
1. Subí la carpeta `mini-erp` a un repositorio de GitHub
2. En Vercel, conectá tu GitHub y seleccioná el repo

---

## Paso 3 — Configurar variables de entorno

En tu proyecto de Vercel:
1. Andá a **Settings → Environment Variables**
2. Agregá estas 4 variables:

| Variable | Valor |
|---|---|
| `ML_CLIENT_ID` | Tu App ID de ML (ej: 1234567890) |
| `ML_CLIENT_SECRET` | Tu Secret Key de ML |
| `ML_REDIRECT_URI` | `https://TU-APP.vercel.app/api/ml-callback` |
| `FRONTEND_URL` | `https://TU-APP.vercel.app` |

3. Hacé clic en **Save** y luego **Redeploy**

---

## Paso 4 — Actualizar URI en ML Developers

1. Volvé a https://developers.mercadolibre.com.ar → tu app
2. En "URIs de redirección" agregá exactamente:
   ```
   https://TU-APP.vercel.app/api/ml-callback
   ```
3. Guardá

---

## Paso 5 — Usar el ERP

1. Abrí `https://TU-APP.vercel.app`
2. Andá a la sección **Mercado Libre**
3. Ingresá tu Client ID y hacé clic en **"Autorizar con Mercado Libre"**
4. ML te va a pedir que inicies sesión y autorices la app
5. Te redirige de vuelta al ERP **ya conectado**
6. Hacé clic en **"Traer órdenes de ML"** y aparecen tus ventas reales

---

## ¿Qué hace cada archivo de la API?

- **`api/ml-callback.js`**: ML redirige acá con un `?code=XXX` después del login. Este endpoint lo intercambia por un access_token real y te manda de vuelta al ERP.
- **`api/ml-orders.js`**: El ERP llama acá para obtener las órdenes. Este endpoint actúa como proxy para evitar errores de CORS con la API de ML.
- **`api/ml-refresh.js`**: El token de ML dura 6 horas. Este endpoint lo renueva automáticamente.

---

## Seguridad

- Las credenciales de ML **nunca** aparecen en el código del frontend
- Están guardadas solo como variables de entorno en Vercel
- El token del usuario se guarda en `localStorage` del navegador
