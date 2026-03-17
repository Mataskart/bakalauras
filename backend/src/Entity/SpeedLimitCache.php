<?php

namespace App\Entity;

use App\Repository\SpeedLimitCacheRepository;
use Doctrine\ORM\Mapping as ORM;

// Persistent cache of OSM speed limits by rounded (lat, lon) to avoid repeated Overpass API calls.
// Can be filled on demand or bulk-imported for a region via app:speed-limit-cache:fill.
#[ORM\Entity(repositoryClass: SpeedLimitCacheRepository::class)]
#[ORM\UniqueConstraint(name: 'speed_limit_cache_lat_lon', columns: ['lat_rounded', 'lon_rounded'])]
class SpeedLimitCache
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(type: 'float')]
    private float $latRounded;

    #[ORM\Column(type: 'float')]
    private float $lonRounded;

    #[ORM\Column(type: 'float')]
    private float $speedLimitKmh;

    public function __construct(float $latRounded, float $lonRounded, float $speedLimitKmh)
    {
        $this->latRounded = $latRounded;
        $this->lonRounded = $lonRounded;
        $this->speedLimitKmh = $speedLimitKmh;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getLatRounded(): float
    {
        return $this->latRounded;
    }

    public function getLonRounded(): float
    {
        return $this->lonRounded;
    }

    public function getSpeedLimitKmh(): float
    {
        return $this->speedLimitKmh;
    }
}
