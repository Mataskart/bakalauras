<?php

namespace App\Repository;

use App\Entity\SpeedLimitCache;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
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
}
