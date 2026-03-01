<?php

namespace App\Entity;

use App\Repository\DrivingEventRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: DrivingEventRepository::class)]
class DrivingEvent
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $recordedAt = null;

    #[ORM\Column]
    private ?float $latitude = null;

    #[ORM\Column]
    private ?float $longitude = null;

    #[ORM\Column]
    private ?float $accelerationX = null;

    #[ORM\Column]
    private ?float $accelerationY = null;

    #[ORM\Column]
    private ?float $accelerationZ = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $eventType = null;

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

    public function setLongitude(float $longtitude): static
    {
        $this->longitude = $longtitude;

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
