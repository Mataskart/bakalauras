<?php

namespace App\Entity;

use App\Repository\DrivingSessionRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: DrivingSessionRepository::class)]
class DrivingSession
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $startedAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $endedAt = null;

    #[ORM\Column(nullable: true)]
    private ?float $score = null;

    #[ORM\Column(length: 255)]
    private ?string $status = null;

    #[ORM\ManyToOne(inversedBy: 'drivingSessions')]
    #[ORM\JoinColumn(nullable: false)]
    private ?User $driver = null;

    /**
     * @var Collection<int, DrivingEvent>
     */
    #[ORM\OneToMany(targetEntity: DrivingEvent::class, mappedBy: 'session', orphanRemoval: true)]
    private Collection $drivingEvents;

    public function __construct()
    {
        $this->drivingEvents = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStartedAt(): ?\DateTimeImmutable
    {
        return $this->startedAt;
    }

    public function setStartedAt(\DateTimeImmutable $startedAt): static
    {
        $this->startedAt = $startedAt;

        return $this;
    }

    public function getEndedAt(): ?\DateTimeImmutable
    {
        return $this->endedAt;
    }

    public function setEndedAt(?\DateTimeImmutable $endedAt): static
    {
        $this->endedAt = $endedAt;

        return $this;
    }

    public function getScore(): ?float
    {
        return $this->score;
    }

    public function setScore(?float $score): static
    {
        $this->score = $score;

        return $this;
    }

    public function getStatus(): ?string
    {
        return $this->status;
    }

    public function setStatus(string $status): static
    {
        $this->status = $status;

        return $this;
    }

    public function getDriver(): ?User
    {
        return $this->driver;
    }

    public function setDriver(?User $driver): static
    {
        $this->driver = $driver;

        return $this;
    }

    /**
     * @return Collection<int, DrivingEvent>
     */
    public function getDrivingEvents(): Collection
    {
        return $this->drivingEvents;
    }

    public function addDrivingEvent(DrivingEvent $drivingEvent): static
    {
        if (!$this->drivingEvents->contains($drivingEvent)) {
            $this->drivingEvents->add($drivingEvent);
            $drivingEvent->setSession($this);
        }

        return $this;
    }

    public function removeDrivingEvent(DrivingEvent $drivingEvent): static
    {
        if ($this->drivingEvents->removeElement($drivingEvent)) {
            // set the owning side to null (unless already changed)
            if ($drivingEvent->getSession() === $this) {
                $drivingEvent->setSession(null);
            }
        }

        return $this;
    }
}
