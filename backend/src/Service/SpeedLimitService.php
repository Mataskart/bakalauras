<?php

namespace App\Service;

use App\Entity\SpeedLimitCache;
use App\Repository\SpeedLimitCacheRepository;

// Fetches road speed limits at a given (lat, lon). Uses persistent DB cache first,
// then OpenStreetMap Overpass API. Cache can be pre-filled for a region to avoid API calls.
// See: https://wiki.openstreetmap.org/wiki/Key:maxspeed
class SpeedLimitService
{
    private const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
    private const AROUND_RADIUS_METERS = 50;
    private const REQUEST_TIMEOUT_SECONDS = 5;
    private const MPH_TO_KMH = 1.609344;
    private const ROUND_PRECISION = 4;  // ~11 m resolution

    /** In-request cache: rounded (lat, lon) => speed limit km/h. Avoids duplicate lookups per batch. */
    private array $memoryCache = [];

    public function __construct(
        private readonly SpeedLimitCacheRepository $cacheRepository
    ) {
    }

    /**
     * Returns the speed limit in km/h at the given coordinates, or null if unknown/no data.
     * Checks persistent cache first, then Overpass API, then stores result in cache.
     */
    public function getSpeedLimitKmh(float $latitude, float $longitude): ?float
    {
        $latR = $this->roundCoord($latitude);
        $lonR = $this->roundCoord($longitude);
        $cacheKey = "{$latR},{$lonR}";

        if (isset($this->memoryCache[$cacheKey])) {
            return $this->memoryCache[$cacheKey];
        }

        $cached = $this->cacheRepository->findByRoundedLatLon($latR, $lonR);
        if ($cached !== null) {
            $this->memoryCache[$cacheKey] = $cached->getSpeedLimitKmh();
            return $cached->getSpeedLimitKmh();
        }

        // GPS can land slightly off a road node. Search within ~100 m before hitting Overpass.
        $nearby = $this->cacheRepository->findNearestWithin($latR, $lonR);
        if ($nearby !== null) {
            $this->memoryCache[$cacheKey] = $nearby->getSpeedLimitKmh();
            return $nearby->getSpeedLimitKmh();
        }

        $limit = $this->fetchFromOverpass($latitude, $longitude);
        $this->memoryCache[$cacheKey] = $limit;

        if ($limit !== null) {
            $this->cacheRepository->save(new SpeedLimitCache($latR, $lonR, $limit));
        }

        return $limit;
    }

    /**
     * Clears the in-request memory cache only. Persistent DB cache is kept.
     */
    public function clearCache(): void
    {
        $this->memoryCache = [];
    }

    public function roundCoord(float $value): float
    {
        return round($value, self::ROUND_PRECISION);
    }

    private function fetchFromOverpass(float $lat, float $lon): ?float
    {
        // Ways with highway + maxspeed within radius. Exclude paths/cycleways/footways.
        $query = sprintf(
            '[out:json];way["highway"]["maxspeed"](around:%d,%s,%s);out;',
            self::AROUND_RADIUS_METERS,
            $lat,
            $lon
        );

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => 'Content-Type: application/x-www-form-urlencoded',
                'content' => 'data=' . urlencode($query),
                'timeout' => self::REQUEST_TIMEOUT_SECONDS,
            ],
        ]);

        $response = @file_get_contents(self::OVERPASS_URL, false, $context);
        if ($response === false) {
            return null;
        }

        $data = json_decode($response, true);
        if (!isset($data['elements']) || !is_array($data['elements'])) {
            return null;
        }

        foreach ($data['elements'] as $element) {
            $maxspeed = $element['tags']['maxspeed'] ?? null;
            if ($maxspeed === null) {
                continue;
            }
            $parsed = $this->parseMaxspeed($maxspeed);
            if ($parsed !== null) {
                return $parsed;
            }
        }

        return null;
    }

    /**
     * Parses OSM maxspeed value to km/h. Returns null for non-numeric (e.g. "EU:urban", "walk").
     */
    public function parseMaxspeed(string $value): ?float
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        // Numeric only → assume km/h
        if (is_numeric($value)) {
            $kmh = (float) $value;
            return $kmh > 0 && $kmh <= 300 ? $kmh : null;
        }

        // "50 mph" or "50mph"
        if (preg_match('/^(\d+(?:\.\d+)?)\s*mph$/i', $value, $m)) {
            $mph = (float) $m[1];
            if ($mph <= 0 || $mph > 150) {
                return null;
            }
            return round($mph * self::MPH_TO_KMH, 2);
        }

        // "50 km/h" or "50 kmh" — optional
        if (preg_match('/^(\d+(?:\.\d+)?)\s*km\/?h$/i', $value, $m)) {
            $kmh = (float) $m[1];
            return $kmh > 0 && $kmh <= 300 ? $kmh : null;
        }

        return null;
    }
}
