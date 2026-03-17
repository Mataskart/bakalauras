<?php

namespace App\Tests\Service;

use App\Entity\DrivingEvent;
use App\Entity\DrivingSession;
use App\Service\ScoringService;
use Doctrine\Common\Collections\ArrayCollection;
use PHPUnit\Framework\TestCase;

// Unit tests for the scoring algorithm.
// These tests use no database — entities are instantiated directly in memory.
class ScoringServiceTest extends TestCase
{
    private ScoringService $scoring;

    protected function setUp(): void
    {
        $this->scoring = new ScoringService();
    }

    // Helper to build a DrivingSession containing a set of events.
    // Each event: [x, y, z] or [x, y, z, speed, speedLimitKmh] for speeding tests.
    private function makeSession(array $events): DrivingSession
    {
        $session = new DrivingSession();
        $collection = new ArrayCollection();

        foreach ($events as $ev) {
            [$x, $y, $z] = $ev;
            $event = new DrivingEvent();
            $event->setAccelerationX($x);
            $event->setAccelerationY($y);
            $event->setAccelerationZ($z);
            $event->setLatitude(54.0);
            $event->setLongitude(23.0);
            $event->setRecordedAt(new \DateTimeImmutable());
            if (isset($ev[3])) {
                $event->setSpeed((float) $ev[3]);
            }
            if (isset($ev[4])) {
                $event->setSpeedLimitKmh((float) $ev[4]);
            }
            $collection->add($event);
        }

        // Inject the collection using reflection since there is no public setter
        $ref = new \ReflectionProperty(DrivingSession::class, 'drivingEvents');
        $ref->setAccessible(true);
        $ref->setValue($session, $collection);

        return $session;
    }

    public function testPerfectScoreWithNoEvents(): void
    {
        $session = $this->makeSession([]);
        $score = $this->scoring->calculateScore($session);

        $this->assertSame(100.0, $score);
    }

    public function testPerfectScoreWithAllNormalEvents(): void
    {
        // All readings well below magnitude (2.5) and axis thresholds; z=0 so magnitude ~0.1–0.3
        $session = $this->makeSession([
            [0.1, 0.2, 0.0],
            [0.0, 0.1, 0.0],
            [0.2, 0.3, 0.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertSame(100.0, $score);
    }

    public function testHardBrakeReducesScore(): void
    {
        // Magnitude 5.2 >= 2.5, Y dominant → hard_brake (z=0 so axis is clear)
        $session = $this->makeSession([
            [0.0, -5.2, 0.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
    }

    public function testHardAccelerationReducesScore(): void
    {
        // Magnitude 4 >= 2.5, Y dominant → hard_acceleration
        $session = $this->makeSession([
            [0.0, 4.0, 0.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
    }

    public function testSharpTurnReducesScore(): void
    {
        // Magnitude 3.5 >= 2.5, X dominant → sharp_turn
        $session = $this->makeSession([
            [3.5, 0.0, 0.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
    }

    public function testScoreNeverGoesBelowZero(): void
    {
        // Many severe hard brakes should floor the score at 0, not go negative
        $session = $this->makeSession([
            [0.0, -20.0, 0.0],
            [0.0, -20.0, 0.0],
            [0.0, -20.0, 0.0],
            [0.0, -20.0, 0.0],
            [0.0, -20.0, 0.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertGreaterThanOrEqual(0.0, $score);
    }

    public function testEventTypesAreClassifiedCorrectly(): void
    {
        // z=0 so magnitude path still yields axis-derived types; last event below magnitude threshold
        $session = $this->makeSession([
            [0.0, -5.2, 0.0],  // hard brake (magnitude 5.2, Y dominant)
            [0.0, 4.0,  0.0],  // hard acceleration
            [3.5, 0.0,  0.0],  // sharp turn
            [0.1, 0.1,  0.0],  // normal (magnitude ~0.14 < 2.5)
        ]);

        $this->scoring->calculateScore($session);
        $events = $session->getDrivingEvents()->toArray();

        $this->assertSame('hard_brake', $events[0]->getEventType());
        $this->assertSame('hard_acceleration', $events[1]->getEventType());
        $this->assertSame('sharp_turn', $events[2]->getEventType());
        $this->assertSame('normal', $events[3]->getEventType());
    }

    public function testMagnitudeOnlyOnZIsClassifiedAsHarsh(): void
    {
        // Phone in pocket: jerk mostly on Z. Magnitude 3 >= 2.5, Z dominant → 'harsh'
        $session = $this->makeSession([
            [0.0, 0.0, 3.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $events = $session->getDrivingEvents()->toArray();
        $this->assertSame('harsh', $events[0]->getEventType());
        $this->assertLessThan(100.0, $score);
    }

    public function testMixedSessionScoreIsBetweenZeroAndHundred(): void
    {
        $session = $this->makeSession([
            [0.0, -5.2, 0.0],  // hard brake
            [0.1, 0.2,  0.0],  // normal
            [0.0, 0.1,  0.0],  // normal
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertGreaterThanOrEqual(0.0, $score);
        $this->assertLessThanOrEqual(100.0, $score);
    }

    public function testSpeedingReducesScore(): void
    {
        // Normal acceleration but speed 60 km/h where limit is 50 (80% weight)
        $session = $this->makeSession([
            [0.1, 0.2, 0.0, 60.0, 50.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
        $events = $session->getDrivingEvents()->toArray();
        $this->assertTrue($events[0]->isSpeeding());
    }

    public function testSpeedAtOrBelowLimitDoesNotPenalise(): void
    {
        $session = $this->makeSession([
            [0.1, 0.2, 0.0, 50.0, 50.0],  // at limit
            [0.1, 0.2, 0.0, 40.0, 50.0],  // below limit
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertSame(100.0, $score);
        foreach ($session->getDrivingEvents() as $event) {
            $this->assertFalse($event->isSpeeding());
        }
    }

    public function testFivePercentToleranceNoPenaltyWhenWithinTolerance(): void
    {
        // 52.5 km/h with limit 50: 52.5 <= 50 * 1.05 = 52.5, so no penalty
        $session = $this->makeSession([
            [0.1, 0.2, 0.0, 52.5, 50.0],
        ]);
        $score = $this->scoring->calculateScore($session);
        $this->assertSame(100.0, $score);
        $this->assertFalse($session->getDrivingEvents()->first()->isSpeeding());
    }

    public function testFivePercentTolerancePenaltyWhenOverTolerance(): void
    {
        // 53 km/h with limit 50: over 52.5, so speeding
        $session = $this->makeSession([
            [0.1, 0.2, 0.0, 53.0, 50.0],
        ]);
        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
        $this->assertTrue($session->getDrivingEvents()->first()->isSpeeding());
    }

    public function testSpeedingAndAccelerationPenaltiesStack(): void
    {
        // One event: hard brake (Y dominant, z=0) and speeding
        $session = $this->makeSession([
            [0.0, -5.2, 0.0, 70.0, 50.0],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
        $events = $session->getDrivingEvents()->toArray();
        $this->assertSame('hard_brake', $events[0]->getEventType());
        $this->assertTrue($events[0]->isSpeeding());
    }

    public function testStationaryEventsGetNoPenalty(): void
    {
        // Speed 3 km/h = stationary. Even high accelerometer (e.g. phone bump) should not penalise.
        $session = $this->makeSession([
            [0.0, -5.2, 0.0, 3.0, 50.0],  // would be hard_brake if moving
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertSame(100.0, $score);
        $events = $session->getDrivingEvents()->toArray();
        $this->assertSame('normal', $events[0]->getEventType());
        $this->assertFalse($events[0]->isSpeeding());
    }
}