<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

// Returns a ranked list of the top 10 drivers by average session score.
// Cached in Redis for 60s to reduce DB load at scale; invalidated when a session is stopped.
#[Route('/api')]
class LeaderboardController extends AbstractController
{
    private const CACHE_KEY = 'leaderboard_top10';

    public function __construct(
        private readonly CacheItemPoolInterface $leaderboardCache
    ) {
    }

    // GET /api/leaderboard — returns top 10 users ranked by average driving score.
    #[Route('/leaderboard', name: 'api_leaderboard', methods: ['GET'])]
    public function index(EntityManagerInterface $em): JsonResponse
    {
        $item = $this->leaderboardCache->getItem(self::CACHE_KEY);
        if ($item->isHit()) {
            return $this->json($item->get());
        }

        $leaderboard = $this->computeLeaderboard($em);
        $item->set($leaderboard);
        $item->expiresAfter(60);
        $this->leaderboardCache->save($item);

        return $this->json($leaderboard);
    }

    private function computeLeaderboard(EntityManagerInterface $em): array
    {
        $results = $em->createQueryBuilder()
            ->select('u.id, u.firstName, u.lastName, AVG(s.score) as averageScore, COUNT(s.id) as totalSessions')
            ->from(User::class, 'u')
            ->join(DrivingSession::class, 's', 'WITH', 's.driver = u')
            ->where('s.status = :status')
            ->andWhere('s.score IS NOT NULL')
            ->setParameter('status', 'completed')
            ->groupBy('u.id, u.firstName, u.lastName')
            ->orderBy('averageScore', 'DESC')
            ->setMaxResults(10)
            ->getQuery()
            ->getArrayResult();

        return array_map(fn(array $row, int $rank) => [
            'rank' => $rank + 1,
            'name' => $row['firstName'] . ' ' . $row['lastName'],
            'averageScore' => round((float) $row['averageScore'], 2),
            'totalSessions' => (int) $row['totalSessions'],
        ], $results, array_keys($results));
    }
}