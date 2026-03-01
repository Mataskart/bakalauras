<?php

namespace App\Tests\Controller;

use App\Entity\DrivingEvent;
use App\Entity\DrivingSession;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

// Integration tests for the GET /api/me endpoint.
class MeControllerTest extends WebTestCase
{
    private $client;
    private EntityManagerInterface $em;
    private string $token;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->cleanDatabase();
        $this->token = $this->registerAndLogin();
    }

    private function cleanDatabase(): void
    {
        $this->em->createQuery('DELETE FROM App\Entity\DrivingEvent')->execute();
        $this->em->createQuery('DELETE FROM App\Entity\DrivingSession')->execute();
        $this->em->createQuery('DELETE FROM App\Entity\User')->execute();
    }

    private function registerAndLogin(): string
    {
        $this->postJson('/api/auth/register', [
            'email'     => 'test@test.com',
            'password'  => 'password123',
            'firstName' => 'Matas',
            'lastName'  => 'Sidekerskis',
        ]);

        $this->postJson('/api/auth/login', [
            'email'    => 'test@test.com',
            'password' => 'password123',
        ]);

        $data = json_decode($this->client->getResponse()->getContent(), true);
        return $data['token'];
    }

    private function postJson(string $url, array $data, ?string $token = null): void
    {
        $headers = ['CONTENT_TYPE' => 'application/json'];
        if ($token) {
            $headers['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
        }

        $this->client->request('POST', $url, [], [], $headers, json_encode($data));
    }

    private function getJson(string $url, ?string $token = null): array
    {
        $headers = ['CONTENT_TYPE' => 'application/json'];
        if ($token) {
            $headers['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
        }

        $this->client->request('GET', $url, [], [], $headers);
        return json_decode($this->client->getResponse()->getContent(), true);
    }

    public function testMeReturnsUserProfile(): void
    {
        $data = $this->getJson('/api/me', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertSame('test@test.com', $data['email']);
        $this->assertSame('Matas', $data['firstName']);
        $this->assertSame('Sidekerskis', $data['lastName']);
        $this->assertArrayHasKey('createdAt', $data);
    }

    public function testMeReturnsZeroStatsWithNoSessions(): void
    {
        $data = $this->getJson('/api/me', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertSame(0, $data['totalSessions']);
        $this->assertNull($data['averageScore']);
        $this->assertNull($data['bestScore']);
    }

    public function testMeReturnsStatsAfterCompletedSession(): void
    {
        // Start a session
        $this->postJson('/api/sessions', [], $this->token);
        $session = json_decode($this->client->getResponse()->getContent(), true);
        $sessionId = $session['id'];

        // Submit a normal event (should result in score 100)
        $this->postJson('/api/sessions/' . $sessionId . '/events', [[
            'latitude'      => 54.8985,
            'longitude'     => 23.9036,
            'accelerationX' => 0.1,
            'accelerationY' => 0.2,
            'accelerationZ' => 9.8,
        ]], $this->token);

        // Stop the session
        $this->client->request(
            'PATCH',
            '/api/sessions/' . $sessionId . '/stop',
            [], [], ['HTTP_AUTHORIZATION' => 'Bearer ' . $this->token]
        );

        $data = $this->getJson('/api/me', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertSame(1, $data['totalSessions']);
        $this->assertNotNull($data['averageScore']);
        $this->assertNotNull($data['bestScore']);
        $this->assertEquals($data['averageScore'], $data['bestScore']);
    }

    public function testMeRequiresAuth(): void
    {
        $this->getJson('/api/me');
        $this->assertResponseStatusCodeSame(401);
    }
}