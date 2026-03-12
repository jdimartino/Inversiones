#!/bin/bash
# PushGlobal.sh
# Script para sincronizar y respaldar masivamente todos los proyectos de Antigravity
set -euo pipefail

# Definir posibles rutas según el equipo (M1 o M2)
POSSIBLE_DIRS=(
  "/Users/jdimartino/Desktop/Antigravity"
)

WORKSPACE_DIR=""
for dir in "${POSSIBLE_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    WORKSPACE_DIR="$dir"
    break
  fi
done

if [ -z "$WORKSPACE_DIR" ]; then
  echo "❌ Error: No se encontró la carpeta de proyectos principal en ninguna de las rutas esperadas."
  exit 1
fi


# Contadores para resumen final
TOTAL=0
ACTUALIZADOS=0
SIN_CAMBIOS=0
ERRORES=0

LISTA_ACTUALIZADOS=""
LISTA_SIN_CAMBIOS=""
LISTA_ERRORES=""

echo "========================================================"
echo "🌐 PROCESO DE RESPALDO GLOBAL (PushGlobal)"
echo "Ruta: $WORKSPACE_DIR"
echo "========================================================"

for DIR in "$WORKSPACE_DIR"/*/; do
  PROJECT_NAME=$(basename "$DIR")
  TOTAL=$((TOTAL + 1))

  # Ejecutar en subshell para aislar el cd y evitar efectos colaterales
  (
    cd "$DIR"

    # Si no es un repositorio git, inicializarlo
    if [ ! -d ".git" ]; then
      echo "🌱 Inicializando nuevo repositorio local en: $PROJECT_NAME"
      git init -q
      git checkout -b main 2>/dev/null || git branch -m main 2>/dev/null || true
    fi

    # Verificar si hay cambios (archivos modificados, staging o sin seguimiento)
    if [[ -z $(git status --porcelain) ]]; then
      echo "⏩ $PROJECT_NAME — sin cambios."
      exit 0  # sale de la subshell, no del script
    fi

    # Timestamp único por proyecto (evita colisiones de tags)
    TS=$(date +%Y%m%d_%H%M%S)

    echo ""
    echo "--------------------------------------------------------"
    echo "🚀 Subiendo cambios en: $PROJECT_NAME"
    echo "--------------------------------------------------------"

    # Respaldo físico del index principal (solo si existe)
    if [ -f "public/index.html" ]; then
      mkdir -p history
      cp public/index.html "history/index_${TS}.html"
      echo "✅ Versión previa guardada: history/index_${TS}.html (public/)"
    elif [ -f "index.html" ]; then
      mkdir -p history
      cp index.html "history/index_${TS}.html"
      echo "✅ Versión previa guardada: history/index_${TS}.html (raíz)"
    fi

    # Preparar commit
    git add -A

    # Salvaguarda de seguridad extrema: JAMÁS subir credenciales o Service Accounts
    # Se eliminan del staging area cualquier archivo sensible que se haya podido agregar.
    git reset HEAD "*/serviceAccount*.json" "serviceAccount*.json" "*/credentials*.json" "credentials*.json" ".env*" "*/.env*" 2>/dev/null || true

    # Tag de seguridad
    TAG_NAME="pre_${PROJECT_NAME}_${TS}"
    git tag -a "$TAG_NAME" -m "Respaldo automático $PROJECT_NAME: $TS" 2>/dev/null || true
    echo "✅ Etiqueta de seguridad: $TAG_NAME"

    # Solicitar mensaje (o usar argumento $1 si existe)
    if [ -n "${1:-}" ]; then
      message="$1"
    else
      echo "Mensaje para $PROJECT_NAME (Enter = automático):"
      read -r message < /dev/tty || message=""
    fi
    if [ -z "$message" ]; then
      message="Actualización $PROJECT_NAME - $TS"
    fi

    # Commit y push
    git commit -m "$message"
    
    if git remote | grep -q "^origin$"; then
      if git push origin main --tags 2>/dev/null || git push origin HEAD --tags; then
        echo "✅ $PROJECT_NAME actualizado exitosamente."
      else
        echo "❌ Error al hacer push en $PROJECT_NAME."
        exit 1
      fi
    else
      echo "✅ $PROJECT_NAME respaldado localmente (sin origen remoto)."
    fi
  )

  # Capturar resultado de la subshell
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    # Verificar si fue "sin cambios" o "actualizado" revisando la salida
    if [[ -z $(cd "$DIR" && git status --porcelain) ]]; then
      # Podría haber sido sin cambios desde el inicio, o ya commiteado
      # Incrementamos según si hubo push real (chequeamos el log)
      LAST_MSG=$(cd "$DIR" && git log -1 --format=%s 2>/dev/null || echo "")
      if [[ "$LAST_MSG" == Actualización* ]] || [[ "$LAST_MSG" == *"$PROJECT_NAME"* ]] || [[ -n "${1:-}" && "$LAST_MSG" == "${1:-}"* ]]; then
        ACTUALIZADOS=$((ACTUALIZADOS + 1))
        LISTA_ACTUALIZADOS+="   - $PROJECT_NAME"$'\n'
      else
        SIN_CAMBIOS=$((SIN_CAMBIOS + 1))
        LISTA_SIN_CAMBIOS+="   - $PROJECT_NAME"$'\n'
      fi
    else
      SIN_CAMBIOS=$((SIN_CAMBIOS + 1))
      LISTA_SIN_CAMBIOS+="   - $PROJECT_NAME"$'\n'
    fi
  else
    ERRORES=$((ERRORES + 1))
    LISTA_ERRORES+="   - $PROJECT_NAME"$'\n'
  fi
done

echo ""
echo "========================================================"
echo "🎉 ¡PROCESO GLOBAL COMPLETADO!"
echo "   📁 Proyectos escaneados: $TOTAL"
echo "   ✅ Actualizados: $ACTUALIZADOS"
if [ -n "$LISTA_ACTUALIZADOS" ]; then echo -e "$LISTA_ACTUALIZADOS"; fi
echo "   ⏩ Sin cambios: $SIN_CAMBIOS"
if [ -n "$LISTA_SIN_CAMBIOS" ]; then echo -e "$LISTA_SIN_CAMBIOS"; fi
if [ $ERRORES -gt 0 ]; then
  echo "   ❌ Errores: $ERRORES"
  echo -e "$LISTA_ERRORES"
fi
echo "========================================================"
