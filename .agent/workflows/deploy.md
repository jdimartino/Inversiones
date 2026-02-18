---
description: Desplegar la aplicación Crypto Command a Firebase Hosting
---

Para desplegar la aplicación a producción de manera gratuita en Google (Firebase Hosting), sigue estos pasos:

1. Asegúrate de que todos los cambios estén guardados.
2. Ejecuta el comando de despliegue:
   ```bash
   npm run deploy
   ```

Este comando realizará las siguientes acciones automáticamente:
- Ejecutará el comando de construcción (`npm run build`) para generar la versión optimizada en la carpeta `build/`.
- Utilizará `firebase-tools` (instalado localmente) para subir los archivos a Google Hosting.

Una vez finalizado, recibirás la **Hosting URL** oficial (ej: `https://micriptoapp.web.app`).
