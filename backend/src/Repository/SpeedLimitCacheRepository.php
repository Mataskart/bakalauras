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
