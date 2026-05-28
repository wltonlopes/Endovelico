#!/bin/bash

mkdir -p saida

for img in entrada/*.png; do

    nome=$(basename "$img")

    convert "$img" \
    -alpha on \
    -fuzz 10% \
    -fill none \
    -opaque white \
    "saida/$nome"

    echo "OK: $nome"

done

echo "Finalizado."
