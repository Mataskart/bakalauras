<?php

namespace App\Controller;

use App\Service\SpeedLimitService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/speed-limit', methods: ['GET'])]
class SpeedLimitController extends AbstractController
{
    public function __construct(
        private readonly SpeedLimitService $speedLimitService,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $lat = $request->query->get('lat');
        $lon = $request->query->get('lon');

        if ($lat === null || $lon === null || !is_numeric($lat) || !is_numeric($lon)) {
            return $this->json(['error' => 'lat and lon query parameters are required and must be numeric'], 400);
        }

        $lat = (float) $lat;
        $lon = (float) $lon;

        if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
            return $this->json(['error' => 'lat must be -90..90, lon must be -180..180'], 400);
        }

        $speedLimitKmh = $this->speedLimitService->getSpeedLimitKmh($lat, $lon);

        return $this->json(['speedLimitKmh' => $speedLimitKmh]);
    }
}
