#!/bin/bash
# Script de restauración para Inversiones
git log -n 10 --oneline
echo ""
echo "Copiá y pegá el ID del backup al que querés volver (el código de 7 letras/números de la izquierda):"
read commit_id
if [ -z "$commit_id" ]; then
    echo "Operación cancelada."
    exit 1
fi
git checkout $commit_id .
echo "¡Proyecto Inversiones restaurado a la versión $commit_id!"
