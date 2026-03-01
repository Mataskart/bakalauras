<?php

namespace App\Service;

use App\Entity\DrivingSession;

class ScoringService
{
    // Thresholds for detecting bad driving events (m/s²)
    private const HARD_BRAKE_THRESHOLD = 4.0;
    private const HARD_ACCELERATION_THRESHOLD = 3.5;
    private const SHARP_TURN_THRESHOLD = 3.0;

    // Penalty points per detected event
    private const HARD_BRAKE_PENALTY = 10.0;
    private const HARD_ACCELERATION_PENALTY = 7.0;
    private const SHARP_TURN_PENALTY = 8.0;

    public function calculateScore(DrivingSession $session): float
    {
        $events = $session->getDrivingEvents();

        if (count($events) === 0) {
            return 100.0;
        }

        $totalPenalty = 0.0;

        foreach ($events as $event) {
            $x = $event->getAccelerationX();
            $y = $event->getAccelerationY();
            $z = $event->getAccelerationZ();

            // Hard braking — strong negative Y acceleration (forward axis)
            if ($y < -self::HARD_BRAKE_THRESHOLD) {
                $totalPenalty += self::HARD_BRAKE_PENALTY;
                $event->setEventType('hard_brake');
            }
            // Hard acceleration — strong positive Y acceleration
            elseif ($y > self::HARD_ACCELERATION_THRESHOLD) {
                $totalPenalty += self::HARD_ACCELERATION_PENALTY;
                $event->setEventType('hard_acceleration');
            }
            // Sharp turn — strong X acceleration (lateral axis)
            elseif (abs($x) > self::SHARP_TURN_THRESHOLD) {
                $totalPenalty += self::SHARP_TURN_PENALTY;
                $event->setEventType('sharp_turn');
            }
            else {
                $event->setEventType('normal');
            }
        }

        // Normalise penalty against session length to avoid punishing long drives
        $penaltyPerEvent = $totalPenalty / count($events);
        $score = max(0.0, 100.0 - ($penaltyPerEvent * 10));

        return round($score, 2);
    }
}