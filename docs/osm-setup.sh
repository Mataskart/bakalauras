#!/usr/bin/env bash
# osm-setup.sh — one-time VPS script to download Lithuania OSM data and populate
# the speed_limit_cache table. Run as the deploy user from any directory.
#
# Usage:
#   bash /var/www/bakalauras/docs/osm-setup.sh
#
# Re-running is safe (DB insert uses ON CONFLICT DO NOTHING).

set -euo pipefail

BACKEND_DIR="/var/www/bakalauras/backend"
OSM_DIR="/var/www/bakalauras/osm"
PBF="$OSM_DIR/lithuania-latest.osm.pbf"
MAXSPEED_PBF="$OSM_DIR/lithuania-maxspeed.osm.pbf"
GEOJSONSEQ="$OSM_DIR/lithuania-maxspeed.geojsonseq"

echo "=== keliq OSM speed limit setup ==="

# --- 1. osmium-tool ---
if ! command -v osmium &> /dev/null; then
    echo "[1/6] Installing osmium-tool..."
    sudo apt-get install -y osmium-tool
else
    echo "[1/6] osmium-tool already installed ($(osmium --version 2>&1 | head -1))"
fi

# --- 2. OSM directory ---
echo "[2/6] Creating OSM data directory: $OSM_DIR"
mkdir -p "$OSM_DIR"

# --- 3. Download Lithuania extract ---
echo "[3/6] Downloading Lithuania OSM extract..."
wget -q --show-progress \
    https://download.geofabrik.de/europe/lithuania-latest.osm.pbf \
    -O "$PBF"
echo "      Saved to $PBF ($(du -sh "$PBF" | cut -f1))"

# --- 4. Filter ways with maxspeed ---
echo "[4/6] Filtering ways with maxspeed tag..."
osmium tags-filter "$PBF" w/maxspeed -o "$MAXSPEED_PBF" --overwrite
echo "      Filtered PBF: $(du -sh "$MAXSPEED_PBF" | cut -f1)"

# --- 5. Export to GeoJSONSeq ---
echo "[5/6] Exporting to GeoJSONSeq (streamable, one feature per line)..."
osmium export "$MAXSPEED_PBF" \
    --geometry-types=linestring \
    -f geojsonseq \
    -o "$GEOJSONSEQ" \
    --overwrite
echo "      GeoJSONSeq: $(du -sh "$GEOJSONSEQ" | cut -f1)"

# --- 6. Symfony import ---
echo "[6/6] Running Symfony import command..."
php "$BACKEND_DIR/bin/console" app:osm:import-speed-limits \
    --file="$GEOJSONSEQ"

echo ""
echo "=== Done! speed_limit_cache is populated. ==="
echo "You can delete the OSM files to free disk space:"
echo "  rm -f $PBF $MAXSPEED_PBF $GEOJSONSEQ"
