<?php

namespace App\Service;

use App\Entity\DrivingSession;

// Analyses raw accelerometer data from a driving session and produces
// a safety score between 0 (worst) and 100 (perfect).
// Accelerometer X/Y are in the phone frame (orientation-dependent); Z is stored but not scored.
// Best accuracy when the phone is in a consistent position (e.g. dash mount); pocket/random
// orientation may spread braking/turn across axes. See class doc for orientation notes.
class ScoringService
{
    // Below this speed (km/h) we consider the vehicle stationary — no penalties (score 100 for that event).
    private const STATIONARY_SPEED_KMH = 5.0;

    // Minimum accelerometer magnitude (m/s²) to classify an event as dangerous
    private const HARD_BRAKE_THRESHOLD = 2.5;       // was 4.0
    private const HARD_ACCELERATION_THRESHOLD = 2.5; // was 3.5
    private const SHARP_TURN_THRESHOLD = 2.0;        // was 3.0

    // How many penalty points each dangerous event type contributes.
    // Hard braking is penalised most heavily as it poses the greatest accident risk.
    private const HARD_BRAKE_PENALTY = 30.0;         // was 10.0
    private const HARD_ACCELERATION_PENALTY = 20.0;  // was 7.0
    private const SHARP_TURN_PENALTY = 25.0;         // was 8.0
    private const SPEEDING_PENALTY = 25.0;           // 4th criterion: speed > OSM limit

    // Speeding: allow this factor over the limit before penalising (1.05 = 5% tolerance).
    private const SPEEDING_TOLERANCE_FACTOR = 1.05;

    // Score weight: 80% from speed compliance, 20% from smooth driving (brake/accel/turn).
    private const SPEED_WEIGHT = 0.8;
    private const SMOOTH_WEIGHT = 0.2;
    private const PENALTY_TO_SCORE_FACTOR = 10.0;    // penaltyPerEvent * this = score deduction

    // Calculates and returns the final score for a completed session.
    // Also classifies each event in-place (eventType, speeding) as a side effect.
    // Final score = 80% speed score + 20% smooth-driving score.
    public function calculateScore(DrivingSession $session): float
    {
        $events = $session->getDrivingEvents()->toArray();
        if (count($events) === 0) {
            return 100.0;
        }

        // Sort by time so penalty normalisation is consistent and imputed order is stable
        usort($events, fn ($a, $b) => $a->getRecordedAt() <=> $b->getRecordedAt());

        $totalSpeedingPenalty = 0.0;
        $totalSmoothPenalty = 0.0;

        foreach ($events as $event) {
            $speed = $event->getSpeed();
            $limit = $event->getSpeedLimitKmh();
            $event->setSpeeding(false);

            // Stationary (parked / stopped at light): no penalties — treat as perfect for this event.
            $stationary = $speed !== null && $speed < self::STATIONARY_SPEED_KMH;

            if ($stationary) {
                $event->setEventType('normal');
            } else {
                $x = $event->getAccelerationX();
                $y = $event->getAccelerationY();

                // Smooth driving (10–20% weight). X/Y are in phone frame — orientation matters.
                if ($y < -self::HARD_BRAKE_THRESHOLD) {
                    $totalSmoothPenalty += self::HARD_BRAKE_PENALTY;
                    $event->setEventType('hard_brake');
                } elseif ($y > self::HARD_ACCELERATION_THRESHOLD) {
                    $totalSmoothPenalty += self::HARD_ACCELERATION_PENALTY;
                    $event->setEventType('hard_acceleration');
                } elseif (abs($x) > self::SHARP_TURN_THRESHOLD) {
                    $totalSmoothPenalty += self::SHARP_TURN_PENALTY;
                    $event->setEventType('sharp_turn');
                } else {
                    $event->setEventType('normal');
                }
            }

            // Speeding (80% weight). Not applied when stationary.
            if (!$stationary && $speed !== null && $limit !== null && $speed > $limit * self::SPEEDING_TOLERANCE_FACTOR) {
                $totalSpeedingPenalty += self::SPEEDING_PENALTY;
                $event->setSpeeding(true);
            }
        }

        $n = (float) count($events);
        $speedingPenaltyPerEvent = $totalSpeedingPenalty / $n;
        $smoothPenaltyPerEvent = $totalSmoothPenalty / $n;

        $speedScore = max(0.0, 100.0 - ($speedingPenaltyPerEvent * self::PENALTY_TO_SCORE_FACTOR));
        $smoothScore = max(0.0, 100.0 - ($smoothPenaltyPerEvent * self::PENALTY_TO_SCORE_FACTOR));

        $score = self::SPEED_WEIGHT * $speedScore + self::SMOOTH_WEIGHT * $smoothScore;

        return round($score, 2);
    }
}