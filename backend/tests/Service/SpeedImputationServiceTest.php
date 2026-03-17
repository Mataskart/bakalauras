<?php

namespace App\Tests\Service;

use App\Entity\DrivingEvent;
use App\Entity\DrivingSession;
use App\Service\SpeedImputationService;
use PHPUnit\Framework\TestCase;

class SpeedImputationServiceTest extends TestCase
{
    private SpeedImputationService $service;

    protected function setUp(): void
    {
        $this->service = new SpeedImputationService();
    }

    public function testImputesSpeedFromPreviousEvent(): void
    {
        $session = new DrivingSession();
        $t0 = new \DateTimeImmutable('2025-01-15 10:00:00');
        $t1 = new \DateTimeImmutable('2025-01-15 10:02:00'); // 2 min later

        $e1 = new DrivingEvent();
        $e1->setRecordedAt($t0);
        $e1->setLatitude(54.0);
        $e1->setLongitude(23.0);
        $e1->setSpeed(null);
        $e1->setAccelerationX(0);
        $e1->setAccelerationY(0);
        $e1->setAccelerationZ(9.8);

        $e2 = new DrivingEvent();
        $e2->setRecordedAt($t1);
        $e2->setLatitude(54.01);  // ~1.1 km north
        $e2->setLongitude(23.0);
        $e2->setSpeed(null);
        $e2->setAccelerationX(0);
        $e2->setAccelerationY(0);
        $e2->setAccelerationZ(9.8);

        $session->addDrivingEvent($e1);
        $session->addDrivingEvent($e2);

        $this->service->imputeForSession($session);

        $this->assertNull($e1->getSpeed());
        $this->assertNotNull($e2->getSpeed());
        $this->assertGreaterThan(0, $e2->getSpeed());
        $this->assertLessThanOrEqual(250, $e2->getSpeed());
        // ~1.1 km / (2/60) h ≈ 33 km/h
        $this->assertEqualsWithDelta(33, $e2->getSpeed(), 5);
    }

    public function testDoesNotOverwriteExistingSpeed(): void
    {
        $session = new DrivingSession();
        $t0 = new \DateTimeImmutable('2025-01-15 10:00:00');
        $t1 = new \DateTimeImmutable('2025-01-15 10:02:00');

        $e1 = new DrivingEvent();
        $e1->setRecordedAt($t0);
        $e1->setLatitude(54.0);
        $e1->setLongitude(23.0);
        $e1->setSpeed(null);
        $e1->setAccelerationX(0)->setAccelerationY(0)->setAccelerationZ(9.8);

        $e2 = new DrivingEvent();
        $e2->setRecordedAt($t1);
        $e2->setLatitude(54.01);
        $e2->setLongitude(23.0);
        $e2->setSpeed(50.0);  // already set
        $e2->setAccelerationX(0)->setAccelerationY(0)->setAccelerationZ(9.8);

        $session->addDrivingEvent($e1);
        $session->addDrivingEvent($e2);

        $this->service->imputeForSession($session);

        $this->assertSame(50.0, $e2->getSpeed());
    }

    public function testSingleEventNoOp(): void
    {
        $session = new DrivingSession();
        $e = new DrivingEvent();
        $e->setRecordedAt(new \DateTimeImmutable());
        $e->setLatitude(54.0);
        $e->setLongitude(23.0);
        $e->setSpeed(null);
        $e->setAccelerationX(0)->setAccelerationY(0)->setAccelerationZ(9.8);
        $session->addDrivingEvent($e);

        $this->service->imputeForSession($session);

        $this->assertNull($e->getSpeed());
    }
}
