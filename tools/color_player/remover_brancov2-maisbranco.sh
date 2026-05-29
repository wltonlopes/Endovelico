#!/bin/bash

mkdir -p saida

for img in entrada/*.png; do

    nome=$(basename "$img")

    convert "$img" \
    -alpha set \
    -channel RGBA \
    -fuzz 25% \
    -transparent "#FFFFFF" \
    "saida/$nome"

    echo "OK: $nome"

done

echo "Finalizado."
