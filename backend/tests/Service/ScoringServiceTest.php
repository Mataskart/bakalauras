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

    // Helper to build a DrivingSession containing a set of events
    // defined by their X and Y acceleration values.
    private function makeSession(array $events): DrivingSession
    {
        $session = new DrivingSession();
        $collection = new ArrayCollection();

        foreach ($events as [$x, $y, $z]) {
            $event = new DrivingEvent();
            $event->setAccelerationX($x);
            $event->setAccelerationY($y);
            $event->setAccelerationZ($z);
            $event->setLatitude(54.0);
            $event->setLongitude(23.0);
            $event->setRecordedAt(new \DateTimeImmutable());
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
        // All readings well below any threshold
        $session = $this->makeSession([
            [0.1, 0.2, 9.8],
            [0.0, 0.1, 9.8],
            [0.2, 0.3, 9.8],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertSame(100.0, $score);
    }

    public function testHardBrakeReducesScore(): void
    {
        // Y = -5.2 exceeds the hard brake threshold of -4.0
        $session = $this->makeSession([
            [0.0, -5.2, 9.8],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
    }

    public function testHardAccelerationReducesScore(): void
    {
        // Y = 4.0 exceeds the hard acceleration threshold of 3.5
        $session = $this->makeSession([
            [0.0, 4.0, 9.8],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
    }

    public function testSharpTurnReducesScore(): void
    {
        // X = 3.5 exceeds the sharp turn threshold of 3.0
        $session = $this->makeSession([
            [3.5, 0.0, 9.8],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertLessThan(100.0, $score);
    }

    public function testScoreNeverGoesBelowZero(): void
    {
        // Many severe hard brakes should floor the score at 0, not go negative
        $session = $this->makeSession([
            [0.0, -20.0, 9.8],
            [0.0, -20.0, 9.8],
            [0.0, -20.0, 9.8],
            [0.0, -20.0, 9.8],
            [0.0, -20.0, 9.8],
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertGreaterThanOrEqual(0.0, $score);
    }

    public function testEventTypesAreClassifiedCorrectly(): void
    {
        $session = $this->makeSession([
            [0.0, -5.2, 9.8],  // hard brake
            [0.0, 4.0,  9.8],  // hard acceleration
            [3.5, 0.0,  9.8],  // sharp turn
            [0.1, 0.1,  9.8],  // normal
        ]);

        $this->scoring->calculateScore($session);
        $events = $session->getDrivingEvents()->toArray();

        $this->assertSame('hard_brake', $events[0]->getEventType());
        $this->assertSame('hard_acceleration', $events[1]->getEventType());
        $this->assertSame('sharp_turn', $events[2]->getEventType());
        $this->assertSame('normal', $events[3]->getEventType());
    }

    public function testMixedSessionScoreIsBetweenZeroAndHundred(): void
    {
        $session = $this->makeSession([
            [0.0, -5.2, 9.8],  // hard brake
            [0.1, 0.2,  9.8],  // normal
            [0.0, 0.1,  9.8],  // normal
        ]);

        $score = $this->scoring->calculateScore($session);
        $this->assertGreaterThanOrEqual(0.0, $score);
        $this->assertLessThanOrEqual(100.0, $score);
    }
}