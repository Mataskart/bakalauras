<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use App\Entity\User;



// Returns the currently authenticated user's profile and driving statistics.
#[Route('/api')]
class MeController extends AbstractController
{
    // GET /api/me — returns the current user's info and aggregated driving stats.
    // Useful for the mobile app's profile/dashboard screen.
    #[Route('/me', name: 'api_me', methods: ['GET'])]
    public function me(EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        // Aggregate driving stats for completed sessions with a score
        $stats = $em->createQueryBuilder()
            ->select('COUNT(s.id) as totalSessions, AVG(s.score) as averageScore, MAX(s.score) as bestScore')
            ->from(DrivingSession::class, 's')
            ->where('s.driver = :user')
            ->andWhere('s.status = :status')
            ->andWhere('s.score IS NOT NULL')
            ->setParameter('user', $user)
            ->setParameter('status', 'completed')
            ->getQuery()
            ->getSingleResult();

        return $this->json([
            'id'             => $user->getId(),
            'email'          => $user->getUserIdentifier(),
            'firstName'      => $user->getFirstName(),
            'lastName'       => $user->getLastName(),
            'createdAt'      => $user->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'totalSessions'  => (int) $stats['totalSessions'],
            'averageScore'   => $stats['averageScore'] ? round((float) $stats['averageScore'], 2) : null,
            'bestScore'      => $stats['bestScore'] ? round((float) $stats['bestScore'], 2) : null,
        ]);
    }

    // GET /api/me/today-stats?date=YYYY-MM-DD — average score and drive count for that calendar day (UTC).
    // Used for daily summary notification (e.g. 21:00 local: app sends local date).
    #[Route('/me/today-stats', name: 'api_me_today_stats', methods: ['GET'])]
    public function todayStats(EntityManagerInterface $em, Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();
        $dateStr = $request->query->get('date');
        if (!$dateStr) {
            $dateStr = (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d');
        }
        $date = \DateTimeImmutable::createFromFormat('Y-m-d', $dateStr);
        if (!$date) {
            return $this->json(['error' => 'Invalid date'], 400);
        }
        $start = $date->setTime(0, 0, 0);
        $end = $start->modify('+1 day');

        $stats = $em->createQueryBuilder()
            ->select('COUNT(s.id) as driveCount, AVG(s.score) as averageScore')
            ->from(DrivingSession::class, 's')
            ->where('s.driver = :user')
            ->andWhere('s.status = :status')
            ->andWhere('s.score IS NOT NULL')
            ->andWhere('s.endedAt >= :start')
            ->andWhere('s.endedAt < :end')
            ->setParameter('user', $user)
            ->setParameter('status', 'completed')
            ->setParameter('start', $start)
            ->setParameter('end', $end)
            ->getQuery()
            ->getSingleResult();

        $driveCount = (int) $stats['driveCount'];
        $averageScore = $stats['averageScore'] !== null ? round((float) $stats['averageScore'], 2) : null;

        return $this->json([
            'date' => $dateStr,
            'driveCount' => $driveCount,
            'averageScore' => $averageScore,
        ]);
    }
}