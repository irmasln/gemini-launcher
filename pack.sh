#!/bin/sh
# extensions.gnome.org'a yüklenecek zip dosyasını oluşturur
set -e
cd "$(dirname "$0")"
gnome-extensions pack --force \
    --extra-source=popup.js \
    --extra-source=LICENSE \
    .
