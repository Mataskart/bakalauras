<?php

namespace App\Controller;

use App\Entity\DrivingEvent;
use App\Entity\DrivingSession;
use App\Service\ScoringService;
use App\Service\SpeedImputationService;
use App\Service\SpeedLimitService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

// Handles ingestion of driving events sent by the mobile app during an active session.
// Events are processed in batches and the session score is recalculated after each batch.
#[Route('/api/sessions/{sessionId}/events')]
class EventController extends AbstractController
{
    // POST /api/sessions/{sessionId}/events
    // Accepts a single event object or an array of events in the request body.
    // Recalculates and persists the session score after every batch.
    #[Route('', name: 'api_events_add', methods: ['POST'])]
    public function add(
        int $sessionId,
        Request $request,
        EntityManagerInterface $em,
        ScoringService $scoring,
        SpeedLimitService $speedLimitService,
        SpeedImputationService $speedImputation
    ): JsonResponse {
        $session = $em->getRepository(DrivingSession::class)->find($sessionId);

        if (!$session) {
            return $this->json(['error' => 'Session not found'], 404);
        }

        // Prevent users from submitting events to sessions they don't own
        if ($session->getDriver() !== $this->getUser()) {
            return $this->json(['error' => 'Access denied'], 403);
        }

        // Only accept events for sessions that are currently recording
        if ($session->getStatus() !== 'active') {
            return $this->json(['error' => 'Session is not active'], 400);
        }

        $data = json_decode($request->getContent(), true);

        // Normalise input — the app can send a single object or a batch array.
        // Wrapping a single event in an array allows the same loop to handle both.
        $eventsData = isset($data[0]) ? $data : [$data];

        $speedLimitService->clearCache();

        foreach ($eventsData as $eventData) {
            if (!isset($eventData['accelerationX'], $eventData['accelerationY'], $eventData['accelerationZ'], $eventData['latitude'], $eventData['longitude'])) {
                return $this->json(['error' => 'Missing required fields'], 400);
            }

            $event = new DrivingEvent();
            $event->setSession($session);
            if (!empty($eventData['recordedAt'])) {
                try {
                    $event->setRecordedAt(new \DateTimeImmutable($eventData['recordedAt']));
                } catch (\Throwable) {
                    $event->setRecordedAt(new \DateTimeImmutable());
                }
            } else {
                $event->setRecordedAt(new \DateTimeImmutable());
            }
            $event->setLatitude($eventData['latitude']);
            $event->setLongitude($eventData['longitude']);
            $event->setAccelerationX($eventData['accelerationX']);
            $event->setAccelerationY($eventData['accelerationY']);
            $event->setAccelerationZ($eventData['accelerationZ']);

            if (isset($eventData['speed']) && is_numeric($eventData['speed']) && (float) $eventData['speed'] >= 0) {
                $speedKmh = (float) $eventData['speed'];
                $event->setSpeed($speedKmh);
                $limit = $speedLimitService->getSpeedLimitKmh($eventData['latitude'], $eventData['longitude']);
                if ($limit !== null) {
                    $event->setSpeedLimitKmh($limit);
                }
            }

            $session->addDrivingEvent($event);
            $em->persist($event);
        }

        // Persist all events in a single transaction for efficiency
        $em->flush();

        // Fill missing speed from consecutive GPS points when device did not report speed
        $speedImputation->imputeForSession($session);

        // Recalculate score across all session events including the new batch.
        $score = $scoring->calculateScore($session);
        $session->setScore($score);
        $em->flush();

        // Current location speed limit for UI (same 2s refresh as events; cache avoids extra lookup when already fetched for event).
        $last = $eventsData[array_key_last($eventsData)];
        $speedLimitKmh = $speedLimitService->getSpeedLimitKmh($last['latitude'], $last['longitude']);

        return $this->json([
            'received' => count($eventsData),
            'currentScore' => $score,
            'speedLimitKmh' => $speedLimitKmh,
        ], 201);
    }
}