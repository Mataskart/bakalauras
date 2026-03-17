<?php

namespace App\Entity;

use App\Repository\DrivingEventRepository;
use Doctrine\ORM\Mapping as ORM;

// Represents a single sensor reading captured during an active driving session.
// The mobile app sends these periodically with accelerometer and GPS data.
// The scoring algorithm analyses these events to detect dangerous driving behaviour.
#[ORM\Entity(repositoryClass: DrivingEventRepository::class)]
class DrivingEvent
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    // Timestamp of when the reading was captured on the device
    #[ORM\Column]
    private ?\DateTimeImmutable $recordedAt = null;

    // GPS coordinates at the time of the reading
    #[ORM\Column]
    private ?float $latitude = null;

    #[ORM\Column]
    private ?float $longitude = null;

    // Raw accelerometer values in m/s²
    // X = lateral (left/right), Y = longitudinal (forward/back), Z = vertical
    #[ORM\Column]
    private ?float $accelerationX = null;

    #[ORM\Column]
    private ?float $accelerationY = null;

    #[ORM\Column]
    private ?float $accelerationZ = null;

    // Classified by the scoring algorithm after analysis:
    // 'normal', 'hard_brake', 'hard_acceleration', 'sharp_turn', 'harsh' (Z-dominant / orientation-agnostic)
    // Null until the scoring service processes this event
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $eventType = null;

    // Optional: speed at time of reading (km/h). From device GPS or computed.
    #[ORM\Column(nullable: true)]
    private ?float $speed = null;

    // Speed limit at this location from OpenStreetMap (km/h). Null if unknown.
    #[ORM\Column(nullable: true)]
    private ?float $speedLimitKmh = null;

    // Set by scoring when speed > speedLimitKmh (4th criterion: speeding).
    #[ORM\Column(options: ['default' => false])]
    private bool $speeding = false;

    // The session this event belongs to
    #[ORM\ManyToOne(inversedBy: 'drivingEvents')]
    #[ORM\JoinColumn(nullable: false)]
    private ?DrivingSession $session = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getRecordedAt(): ?\DateTimeImmutable
    {
        return $this->recordedAt;
    }

    public function setRecordedAt(\DateTimeImmutable $recordedAt): static
    {
        $this->recordedAt = $recordedAt;
        return $this;
    }

    public function getLatitude(): ?float
    {
        return $this->latitude;
    }

    public function setLatitude(float $latitude): static
    {
        $this->latitude = $latitude;
        return $this;
    }

    public function getLongitude(): ?float
    {
        return $this->longitude;
    }

    public function setLongitude(float $longitude): static
    {
        $this->longitude = $longitude;
        return $this;
    }

    public function getAccelerationX(): ?float
    {
        return $this->accelerationX;
    }

    public function setAccelerationX(float $accelerationX): static
    {
        $this->accelerationX = $accelerationX;
        return $this;
    }

    public function getAccelerationY(): ?float
    {
        return $this->accelerationY;
    }

    public function setAccelerationY(float $accelerationY): static
    {
        $this->accelerationY = $accelerationY;
        return $this;
    }

    public function getAccelerationZ(): ?float
    {
        return $this->accelerationZ;
    }

    public function setAccelerationZ(float $accelerationZ): static
    {
        $this->accelerationZ = $accelerationZ;
        return $this;
    }

    public function getEventType(): ?string
    {
        return $this->eventType;
    }

    public function setEventType(?string $eventType): static
    {
        $this->eventType = $eventType;
        return $this;
    }

    public function getSpeed(): ?float
    {
        return $this->speed;
    }

    public function setSpeed(?float $speed): static
    {
        $this->speed = $speed;
        return $this;
    }

    public function getSpeedLimitKmh(): ?float
    {
        return $this->speedLimitKmh;
    }

    public function setSpeedLimitKmh(?float $speedLimitKmh): static
    {
        $this->speedLimitKmh = $speedLimitKmh;
        return $this;
    }

    public function isSpeeding(): bool
    {
        return $this->speeding;
    }

    public function setSpeeding(bool $speeding): static
    {
        $this->speeding = $speeding;
        return $this;
    }

    public function getSession(): ?DrivingSession
    {
        return $this->session;
    }

    public function setSession(?DrivingSession $session): static
    {
        $this->session = $session;
        return $this;
    }
}