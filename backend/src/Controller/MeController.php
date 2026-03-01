<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
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
}