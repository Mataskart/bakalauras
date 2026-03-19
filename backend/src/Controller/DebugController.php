<?php

namespace App\Controller;

use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Lightweight debug endpoint — mobile app POSTs a ping each time the background
 * watch task fires, so you can verify detection is working via the server logs.
 *
 * Read on the VPS:  tail -f var/log/prod.log | grep "gps_ping"
 */
#[Route('/api/debug')]
class DebugController extends AbstractController
{
    #[Route('/gps-ping', name: 'api_debug_gps_ping', methods: ['POST'])]
    public function gpsPing(Request $request, LoggerInterface $logger): JsonResponse
    {
        $user = $this->getUser();
        $body = json_decode($request->getContent(), true) ?? [];

        $logger->info('gps_ping', [
            'user_id'   => $user?->getId(),
            'speed_kmh' => isset($body['speedKmh']) ? round((float) $body['speedKmh'], 1) : null,
            'action'    => $body['action'] ?? null,
            'device_ts' => $body['timestamp'] ?? null,
            'server_ts' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
        ]);

        return new JsonResponse(['ok' => true]);
    }
}
