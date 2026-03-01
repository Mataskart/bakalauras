<?php

namespace App\Controller;

use App\Entity\DrivingEvent;
use App\Entity\DrivingSession;
use App\Service\ScoringService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/sessions/{sessionId}/events')]
class EventController extends AbstractController
{
    #[Route('', name: 'api_events_add', methods: ['POST'])]
    public function add(
        int $sessionId,
        Request $request,
        EntityManagerInterface $em,
        ScoringService $scoring
    ): JsonResponse {
        $session = $em->getRepository(DrivingSession::class)->find($sessionId);

        if (!$session) {
            return $this->json(['error' => 'Session not found'], 404);
        }

        if ($session->getDriver() !== $this->getUser()) {
            return $this->json(['error' => 'Access denied'], 403);
        }

        if ($session->getStatus() !== 'active') {
            return $this->json(['error' => 'Session is not active'], 400);
        }

        $data = json_decode($request->getContent(), true);

        // Support both single event and batch array
        $eventsData = isset($data[0]) ? $data : [$data];

        foreach ($eventsData as $eventData) {
            if (!isset($eventData['accelerationX'], $eventData['accelerationY'], $eventData['accelerationZ'], $eventData['latitude'], $eventData['longitude'])) {
                return $this->json(['error' => 'Missing required fields'], 400);
            }

            $event = new DrivingEvent();
            $event->setSession($session);
            $event->setRecordedAt(new \DateTimeImmutable());
            $event->setLatitude($eventData['latitude']);
            $event->setLongitude($eventData['longitude']);
            $event->setAccelerationX($eventData['accelerationX']);
            $event->setAccelerationY($eventData['accelerationY']);
            $event->setAccelerationZ($eventData['accelerationZ']);

            $em->persist($event);
        }

        $em->flush();

        // Recalculate score after every batch
        $score = $scoring->calculateScore($session);
        $session->setScore($score);
        $em->flush();

        return $this->json([
            'received' => count($eventsData),
            'currentScore' => $score,
        ], 201);
    }
}