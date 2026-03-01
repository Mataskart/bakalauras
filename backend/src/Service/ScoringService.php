<?php

namespace App\Service;

use App\Entity\DrivingSession;

// Analyses raw accelerometer data from a driving session and produces
// a safety score between 0 (worst) and 100 (perfect).
// Each event is classified and penalised based on acceleration thresholds.
class ScoringService
{
    // Minimum accelerometer magnitude (m/s²) to classify an event as dangerous
    private const HARD_BRAKE_THRESHOLD = 4.0;
    private const HARD_ACCELERATION_THRESHOLD = 3.5;
    private const SHARP_TURN_THRESHOLD = 3.0;

    // How many penalty points each dangerous event type contributes.
    // Hard braking is penalised most heavily as it poses the greatest accident risk.
    private const HARD_BRAKE_PENALTY = 10.0;
    private const HARD_ACCELERATION_PENALTY = 7.0;
    private const SHARP_TURN_PENALTY = 8.0;

    // Calculates and returns the final score for a completed session.
    // Also classifies each event in-place (eventType field) as a side effect.
    public function calculateScore(DrivingSession $session): float
    {
        $events = $session->getDrivingEvents();

        // A session with no recorded events is considered perfect
        if (count($events) === 0) {
            return 100.0;
        }

        $totalPenalty = 0.0;

        foreach ($events as $event) {
            $x = $event->getAccelerationX(); // lateral axis (left/right)
            $y = $event->getAccelerationY(); // longitudinal axis (forward/back)
            $z = $event->getAccelerationZ(); // vertical axis (unused in scoring)

            if ($y < -self::HARD_BRAKE_THRESHOLD) {
                // Strong negative Y = rapid deceleration (hard braking)
                $totalPenalty += self::HARD_BRAKE_PENALTY;
                $event->setEventType('hard_brake');
            } elseif ($y > self::HARD_ACCELERATION_THRESHOLD) {
                // Strong positive Y = rapid acceleration
                $totalPenalty += self::HARD_ACCELERATION_PENALTY;
                $event->setEventType('hard_acceleration');
            } elseif (abs($x) > self::SHARP_TURN_THRESHOLD) {
                // Strong lateral force = sharp cornering
                $totalPenalty += self::SHARP_TURN_PENALTY;
                $event->setEventType('sharp_turn');
            } else {
                $event->setEventType('normal');
            }
        }

        // Divide total penalty by event count so that longer sessions are not
        // unfairly penalised compared to short ones, then scale to 0-100 range
        $penaltyPerEvent = $totalPenalty / count($events);
        $score = max(0.0, 100.0 - ($penaltyPerEvent * 10));

        return round($score, 2);
    }
}