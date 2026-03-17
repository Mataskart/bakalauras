<?php

namespace App\Tests\Service;

use App\Repository\SpeedLimitCacheRepository;
use App\Service\SpeedLimitService;
use PHPUnit\Framework\TestCase;

class SpeedLimitServiceTest extends TestCase
{
    private SpeedLimitService $service;

    protected function setUp(): void
    {
        $repo = $this->createMock(SpeedLimitCacheRepository::class);
        $repo->method('findByRoundedLatLon')->willReturn(null);
        $repo->method('save')->willReturnCallback(function (): void {});
        $this->service = new SpeedLimitService($repo);
    }

    public function testParseMaxspeed(): void
    {
        $method = new \ReflectionMethod(SpeedLimitService::class, 'parseMaxspeed');
        $method->setAccessible(true);

        $cases = [
            ['50', 50.0],
            ['90', 90.0],
            ['50 mph', 80.47],
            ['30 mph', 48.28],
            ['50mph', 80.47],
            ['100 km/h', 100.0],
            ['EU:urban', null],
            ['walk', null],
            ['', null],
        ];

        foreach ($cases as [$value, $expectedKmh]) {
            $result = $method->invoke($this->service, $value);
            if ($expectedKmh === null) {
                $this->assertNull($result, "Failed for value: " . var_export($value, true));
            } else {
                $this->assertIsFloat($result, "Failed for value: " . var_export($value, true));
                $this->assertEqualsWithDelta($expectedKmh, $result, 0.01, "Failed for value: " . var_export($value, true));
            }
        }
    }

    public function testClearCache(): void
    {
        $this->service->clearCache();
        $this->assertTrue(true); // no exception; cache is cleared
    }
}
