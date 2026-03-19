<?php

namespace App\Repository;

use App\Entity\SpeedLimitCache;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\Connection;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SpeedLimitCache>
 */
class SpeedLimitCacheRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SpeedLimitCache::class);
    }

    public function findByRoundedLatLon(float $latRounded, float $lonRounded): ?SpeedLimitCache
    {
        return $this->findOneBy(
            ['latRounded' => $latRounded, 'lonRounded' => $lonRounded],
            ['id' => 'ASC']
        );
    }

    public function save(SpeedLimitCache $entity, bool $flush = true): void
    {
        $this->getEntityManager()->persist($entity);
        if ($flush) {
            $this->getEntityManager()->flush();
        }
    }

    /**
     * Finds the nearest cached entry within deltaDeg degrees of the given coordinates.
     * Used when the exact rounded coordinate has no match (GPS slightly off-road).
     * deltaDeg = 0.0001° ≈ 11 m — one grid cell (data is stored at 4 decimal places).
     * This is the tightest useful tolerance: large enough to bridge GPS drift to a nearby
     * road node, small enough to avoid picking up parallel streets or adjacent roads.
     */
    public function findNearestWithin(float $lat, float $lon, float $deltaDeg = 0.0001): ?SpeedLimitCache
    {
        return $this->createQueryBuilder('s')
            ->where('s.latRounded BETWEEN :minLat AND :maxLat')
            ->andWhere('s.lonRounded BETWEEN :minLon AND :maxLon')
            ->setParameter('minLat', round($lat - $deltaDeg, 4))
            ->setParameter('maxLat', round($lat + $deltaDeg, 4))
            ->setParameter('minLon', round($lon - $deltaDeg, 4))
            ->setParameter('maxLon', round($lon + $deltaDeg, 4))
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Bulk-insert rows, silently skipping any that already exist (by unique lat/lon).
     * Each row: ['lat' => float, 'lon' => float, 'speed' => float]
     *
     * @param array<array{lat: float, lon: float, speed: float}> $rows
     */
    public function batchInsertIgnore(array $rows): void
    {
        if ($rows === []) {
            return;
        }

        /** @var Connection $conn */
        $conn = $this->getEntityManager()->getConnection();

        $placeholders = [];
        $params = [];
        foreach ($rows as $i => $row) {
            $placeholders[] = "(:lat{$i}, :lon{$i}, :speed{$i})";
            $params["lat{$i}"]   = $row['lat'];
            $params["lon{$i}"]   = $row['lon'];
            $params["speed{$i}"] = $row['speed'];
        }

        $sql = 'INSERT INTO speed_limit_cache (lat_rounded, lon_rounded, speed_limit_kmh) VALUES '
            . implode(', ', $placeholders)
            . ' ON CONFLICT DO NOTHING';

        $conn->executeStatement($sql, $params);
    }
}
