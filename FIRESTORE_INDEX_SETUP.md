## 📋 INSTRUCCIONES - Crear Índice Firestore para debugLogs

### ¿Por qué necesitas este índice?

La función `debugLogs` en `functions/src/index.ts` hace una consulta que requiere un índice compuesto en Firestore:

```typescript
db.collection("notificationLogs").orderBy("sentAt", "desc").limit(10).get()
```

Firestore necesita un índice para ordenar documentos por el campo `sentAt` descendente.

---

## ⚡ Solución Rápida (5 minutos)

### Opción 1: Automática (Recomendado)
Cuando llames a la función `debugLogs` por primera vez después del despliegue, Firestore te mostrará un error con un link directo para crear el índice. Solo tienes que hacer click en el link.

### Opción 2: Manual en Firebase Console

1. **Abre Firebase Console**
   - Ve a https://console.firebase.google.com/
   - Selecciona tu proyecto "Project Portafolio Inversiones"

2. **Navega a Firestore Database**
   - Sidebar → "Firestore Database"

3. **Crea el Índice**
   - Ve a la pestaña "Índices"
   - Haz click en "Crear índice"
   - Rellena los campos:
     - **Colección**: `notificationLogs`
     - **Campo**: `sentAt`
     - **Dirección**: `Descendente`
   - Haz click en "Crear índice"

4. **Espera a que se complete**
   - El índice tardará entre 5-10 minutos en crearse
   - Verás el estado como "Habilitado" cuando esté listo

---

## ✅ Verificación

Una vez creado el índice, la función `debugLogs` funcionará correctamente y devolverá los últimos 10 logs de notificaciones ordenados por fecha reciente.

**¿Cuándo está listo?** Cuando el estado del índice en Firebase Console diga "✓ Habilitado"

---

## 🔍 Referencia: Campos del Índice

```
Colección: notificationLogs
Campo 1: sentAt (Descendente)
```

---

## 📝 Nota

Este índice solo es necesario si vas a usar la función `debugLogs`. Si no la usas, puedes ignorar este paso.

