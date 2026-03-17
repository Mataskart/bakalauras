<?php

namespace App\Service;

use App\Entity\DrivingEvent;
use App\Entity\DrivingSession;

// Fills missing speed on events by computing from consecutive GPS points (distance / time).
// Used when the device does not report speed (e.g. coords.speed is -1 or null).
class SpeedImputationService
{
    private const EARTH_RADIUS_KM = 6371.0;

    /**
     * For each event with null speed, if the previous event (by recorded_at) exists,
     * compute speed = distance_km / time_h and set it on the event.
     * Events are sorted by recorded_at; only forward difference is used (no speed on first event if missing).
     */
    public function imputeForSession(DrivingSession $session): void
    {
        $events = $session->getDrivingEvents()->toArray();
        if (count($events) < 2) {
            return;
        }

        usort($events, fn ($a, $b) => $a->getRecordedAt() <=> $b->getRecordedAt());

        for ($i = 1; $i < count($events); $i++) {
            $prev = $events[$i - 1];
            $curr = $events[$i];

            if ($curr->getSpeed() !== null) {
                continue;
            }

            $distKm = $this->haversineKm(
                $prev->getLatitude(),
                $prev->getLongitude(),
                $curr->getLatitude(),
                $curr->getLongitude()
            );

            $tsPrev = $prev->getRecordedAt()->getTimestamp();
            $tsCurr = $curr->getRecordedAt()->getTimestamp();
            $deltaSeconds = $tsCurr - $tsPrev;
            if ($deltaSeconds <= 0) {
                continue;
            }

            $timeHours = $deltaSeconds / 3600.0;
            $speedKmh = $distKm / $timeHours;

            // Sanity: typical car 0–200 km/h; ignore obvious GPS glitches
            if ($speedKmh >= 0 && $speedKmh <= 250) {
                $curr->setSpeed(round($speedKmh, 2));
            }
        }
    }

    private function haversineKm(float $latFrom, float $lonFrom, float $latTo, float $lonTo): float
    {
        $latFrom = deg2rad($latFrom);
        $lonFrom = deg2rad($lonFrom);
        $latTo = deg2rad($latTo);
        $lonTo = deg2rad($lonTo);

        $latDelta = $latTo - $latFrom;
        $lonDelta = $lonTo - $lonFrom;

        $a = sin($latDelta / 2) ** 2
            + cos($latFrom) * cos($latTo) * sin($lonDelta / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return self::EARTH_RADIUS_KM * $c;
    }
}
