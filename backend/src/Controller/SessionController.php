<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

// Manages driving session lifecycle: starting, stopping, and retrieving sessions.
// All routes require a valid JWT token (enforced by security.yaml).
#[Route('/api/sessions')]
class SessionController extends AbstractController
{
    private const LEADERBOARD_CACHE_KEY = 'leaderboard_top10';

    public function __construct(
        private readonly CacheItemPoolInterface $leaderboardCache
    ) {
    }
    // POST /api/sessions — starts a new active driving session for the logged-in user.
    // Optional body: { "startedAt": "ISO8601" } for offline/buffered drives (client-provided start time).
    #[Route('', name: 'api_sessions_start', methods: ['POST'])]
    public function start(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $user = $this->getUser();

        $session = new DrivingSession();
        $session->setDriver($user);
        $body = json_decode($request->getContent(), true) ?: [];
        if (!empty($body['startedAt'])) {
            try {
                $session->setStartedAt(new \DateTimeImmutable($body['startedAt']));
            } catch (\Throwable) {
                $session->setStartedAt(new \DateTimeImmutable());
            }
        } else {
            $session->setStartedAt(new \DateTimeImmutable());
        }
        $session->setStatus('active');

        $em->persist($session);
        $em->flush();

        return $this->json([
            'id' => $session->getId(),
            'status' => $session->getStatus(),
            'startedAt' => $session->getStartedAt()->format(\DateTimeInterface::ATOM),
        ], 201);
    }

    // PATCH /api/sessions/{id}/stop — ends an active session.
    // Optional body: { "endedAt": "ISO8601" } for offline/buffered drives (client-provided end time).
    #[Route('/{id}/stop', name: 'api_sessions_stop', methods: ['PATCH'])]
    public function stop(DrivingSession $session, Request $request, EntityManagerInterface $em): JsonResponse
    {
        // Prevent users from stopping sessions that belong to someone else
        if ($session->getDriver() !== $this->getUser()) {
            return $this->json(['error' => 'Access denied'], 403);
        }

        // Guard against stopping an already completed session
        if ($session->getStatus() !== 'active') {
            return $this->json(['error' => 'Session is not active'], 400);
        }

        $body = json_decode($request->getContent(), true) ?: [];
        if (!empty($body['endedAt'])) {
            try {
                $session->setEndedAt(new \DateTimeImmutable($body['endedAt']));
            } catch (\Throwable) {
                $session->setEndedAt(new \DateTimeImmutable());
            }
        } else {
            $session->setEndedAt(new \DateTimeImmutable());
        }
        $session->setStatus('completed');
        $em->flush();

        $this->leaderboardCache->deleteItem(self::LEADERBOARD_CACHE_KEY);

        return $this->json([
            'id' => $session->getId(),
            'status' => $session->getStatus(),
            'startedAt' => $session->getStartedAt()->format(\DateTimeInterface::ATOM),
            'endedAt' => $session->getEndedAt()->format(\DateTimeInterface::ATOM),
            'score' => $session->getScore(),
        ]);
    }

    // GET /api/sessions — returns all sessions for the logged-in user, newest first
    #[Route('', name: 'api_sessions_list', methods: ['GET'])]
    public function list(EntityManagerInterface $em): JsonResponse
    {
        $sessions = $em->getRepository(DrivingSession::class)->findBy(
            ['driver' => $this->getUser()],
            ['startedAt' => 'DESC']
        );

        $data = array_map(fn(DrivingSession $s) => [
            'id' => $s->getId(),
            'status' => $s->getStatus(),
            'startedAt' => $s->getStartedAt()->format(\DateTimeInterface::ATOM),
            'endedAt' => $s->getEndedAt()?->format(\DateTimeInterface::ATOM),
            'score' => $s->getScore(),
        ], $sessions);

        return $this->json($data);
    }

    // GET /api/sessions/{id} — returns a single session by ID.
    // Symfony automatically resolves the {id} parameter to a DrivingSession entity.
    #[Route('/{id}', name: 'api_sessions_get', methods: ['GET'])]
    public function get(DrivingSession $session): JsonResponse
    {
        // Prevent users from reading sessions that belong to someone else
        if ($session->getDriver() !== $this->getUser()) {
            return $this->json(['error' => 'Access denied'], 403);
        }

        return $this->json([
            'id' => $session->getId(),
            'status' => $session->getStatus(),
            'startedAt' => $session->getStartedAt()->format(\DateTimeInterface::ATOM),
            'endedAt' => $session->getEndedAt()?->format(\DateTimeInterface::ATOM),
            'score' => $session->getScore(),
        ]);
    }
}