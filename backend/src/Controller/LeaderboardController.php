<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

// Returns a ranked list of the top 10 drivers by average session score.
// Only completed sessions with a calculated score are included.
#[Route('/api')]
class LeaderboardController extends AbstractController
{
    // GET /api/leaderboard — returns top 10 users ranked by average driving score.
    // Rank is derived from position in the result set, not stored in the database.
    #[Route('/leaderboard', name: 'api_leaderboard', methods: ['GET'])]
    public function index(EntityManagerInterface $em): JsonResponse
    {
        // Aggregate scores per user using DQL — groups by user and averages
        // their scores across all completed sessions that have a score assigned
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

        // Map raw query results to a clean response shape.
        // array_keys() is passed as the second argument to array_map()
        // so we get the numeric index to calculate the rank.
        $leaderboard = array_map(fn(array $row, int $rank) => [
            'rank' => $rank + 1,
            'name' => $row['firstName'] . ' ' . $row['lastName'],
            'averageScore' => round((float) $row['averageScore'], 2),
            'totalSessions' => (int) $row['totalSessions'],
        ], $results, array_keys($results));

        return $this->json($leaderboard);
    }
}