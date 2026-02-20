#!/bin/bash
# Script de respaldo mejorado para Inversiones

# 1. Generar marca de tiempo
TS=$(date +%Y%m%d_%H%M%S)

echo "------------------------------------------"
echo "🔍 PREPARANDO RESPALDO DE SEGURIDAD (Inversiones)..."
echo "------------------------------------------"

# 2. Crear copia física de seguridad de public/index.html
mkdir -p history
if [ -f "public/index.html" ]; then
    cp public/index.html "history/index_$TS.html"
    echo "✅ Versión previa guardada: history/index_$TS.html"
fi

# 3. Marcar el punto exacto en Git
git add -A
git tag -a "pre_$TS" -m "Respaldo automático Inversiones: $TS"
echo "✅ Etiqueta de seguridad creada: pre_$TS"

# 4. Solicitar mensaje para los NUEVOS cambios
echo "------------------------------------------"
echo "Introduce el mensaje para la NUEVA versión:"
read message

# Si no escribe nada, usar un mensaje por defecto
if [ -z "$message" ]; then
  message="Actualización Inversiones - $TS"
fi

# 5. Subir todo a GitHub
git commit -m "$message"
git push origin main --tags

echo "------------------------------------------"
echo "🚀 ¡PROCESO COMPLETADO!"
echo "1. Versión vieja respaldada en /history"
echo "2. Versión nueva subida a GitHub"
echo "------------------------------------------"
