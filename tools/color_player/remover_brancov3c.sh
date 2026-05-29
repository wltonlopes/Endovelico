#!/bin/bash

mkdir -p saida

for img in entrada/*.png; do

    nome=$(basename "$img")

    convert "$img" \
    -alpha on \
    -fuzz 15% \
    -fill "#ffffff" \
    -opaque "#a70706" \
    -transparent "#ffffff" \
    PNG32:"saida/$nome"

    echo "OK: $nome"

done

echo "Finalizado."
