<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api')]
class LeaderboardController extends AbstractController
{
    #[Route('/leaderboard', name: 'api_leaderboard', methods: ['GET'])]
    public function index(EntityManagerInterface $em): JsonResponse
    {
        // Get average score per user across all completed sessions with a score
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

        $leaderboard = array_map(fn(array $row, int $rank) => [
            'rank' => $rank + 1,
            'name' => $row['firstName'] . ' ' . $row['lastName'],
            'averageScore' => round((float) $row['averageScore'], 2),
            'totalSessions' => (int) $row['totalSessions'],
        ], $results, array_keys($results));

        return $this->json($leaderboard);
    }
}