<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

// Returns a ranked list of the top 10 drivers by duration-weighted average score.
// Longer drives count more: weightedScore = sum(score * duration) / sum(duration).
// Cached in Redis for 60s; invalidated when a session is stopped.
#[Route('/api')]
class LeaderboardController extends AbstractController
{
    private const CACHE_KEY = 'leaderboard_top10';
    private const MIN_DURATION_SECONDS = 60;

    public function __construct(
        private readonly CacheItemPoolInterface $leaderboardCache
    ) {
    }

    // GET /api/leaderboard — returns top 10 users ranked by duration-weighted driving score.
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
        $conn = $em->getConnection();
        $minDuration = self::MIN_DURATION_SECONDS;
        $sql = <<<SQL
            SELECT
                u.id,
                u.first_name AS "firstName",
                u.last_name AS "lastName",
                SUM(s.score * GREATEST(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int, :minDuration)) / NULLIF(SUM(GREATEST(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int, :minDuration)), 0) AS "weightedScore",
                COUNT(s.id) AS "totalSessions"
            FROM "user" u
            INNER JOIN driving_session s ON s.driver_id = u.id
            WHERE s.status = 'completed'
              AND s.score IS NOT NULL
              AND s.ended_at IS NOT NULL
              AND s.started_at IS NOT NULL
              AND EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int >= :minDuration
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY "weightedScore" DESC
            LIMIT 10
        SQL;
        $rows = $conn->executeQuery($sql, ['minDuration' => $minDuration])->fetchAllAssociative();

        return array_map(fn(array $row, int $rank) => [
            'rank' => $rank + 1,
            'name' => $row['firstName'] . ' ' . $row['lastName'],
            'averageScore' => round((float) $row['weightedScore'], 2),
            'totalSessions' => (int) $row['totalSessions'],
        ], $rows, array_keys($rows));
    }
}