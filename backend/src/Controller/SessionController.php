<?php

namespace App\Controller;

use App\Entity\DrivingSession;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/sessions')]
class SessionController extends AbstractController
{
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

    #[Route('/{id}/stop', name: 'api_sessions_stop', methods: ['PATCH'])]
    public function stop(DrivingSession $session, EntityManagerInterface $em): JsonResponse
    {
        // Make sure the session belongs to the current user
        if ($session->getDriver() !== $this->getUser()) {
            return $this->json(['error' => 'Access denied'], 403);
        }

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

    #[Route('/{id}', name: 'api_sessions_get', methods: ['GET'])]
    public function get(DrivingSession $session): JsonResponse
    {
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