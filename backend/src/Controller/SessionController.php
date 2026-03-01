<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

// Manages driving session lifecycle: starting, stopping, and retrieving sessions.
// All routes require a valid JWT token (enforced by security.yaml).
#[Route('/api/sessions')]
class SessionController extends AbstractController
{
    // POST /api/sessions — starts a new active driving session for the logged-in user
    #[Route('', name: 'api_sessions_start', methods: ['POST'])]
    public function start(EntityManagerInterface $em): JsonResponse
    {
        $user = $this->getUser();

        $session = new DrivingSession();
        $session->setDriver($user);
        $session->setStartedAt(new \DateTimeImmutable());
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
    // Score remains as last calculated by the scoring service during event ingestion.
    #[Route('/{id}/stop', name: 'api_sessions_stop', methods: ['PATCH'])]
    public function stop(DrivingSession $session, EntityManagerInterface $em): JsonResponse
    {
        // Prevent users from stopping sessions that belong to someone else
        if ($session->getDriver() !== $this->getUser()) {
            return $this->json(['error' => 'Access denied'], 403);
        }

        // Guard against stopping an already completed session
        if ($session->getStatus() !== 'active') {
            return $this->json(['error' => 'Session is not active'], 400);
        }

        $session->setEndedAt(new \DateTimeImmutable());
        $session->setStatus('completed');
        $em->flush();

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