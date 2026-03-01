<?php

namespace App\Tests\Controller;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

// Integration tests for the driving session endpoints.
// Each test registers a fresh user and obtains a JWT token to authenticate requests.
class SessionControllerTest extends WebTestCase
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

    // Registers a test user and returns the JWT token from the login response
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

        $this->client->request(
            'POST',
            $url,
            [],
            [],
            $headers,
            json_encode($data)
        );
    }

    private function requestJson(string $method, string $url, ?string $token = null, array $data = []): void
    {
        $headers = ['CONTENT_TYPE' => 'application/json'];
        if ($token) {
            $headers['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
        }

        $this->client->request(
            $method,
            $url,
            [],
            [],
            $headers,
            empty($data) ? null : json_encode($data)
        );
    }

    public function testStartSessionSuccessfully(): void
    {
        $this->postJson('/api/sessions', [], $this->token);

        $this->assertResponseStatusCodeSame(201);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame('active', $data['status']);
        $this->assertArrayHasKey('id', $data);
        $this->assertArrayHasKey('startedAt', $data);
    }

    public function testStartSessionRequiresAuth(): void
    {
        $this->postJson('/api/sessions', []);
        $this->assertResponseStatusCodeSame(401);
    }

    public function testListSessionsReturnsEmpty(): void
    {
        $this->requestJson('GET', '/api/sessions', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame([], $data);
    }

    public function testListSessionsAfterStarting(): void
    {
        $this->postJson('/api/sessions', [], $this->token);
        $this->requestJson('GET', '/api/sessions', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertCount(1, $data);
        $this->assertSame('active', $data[0]['status']);
    }

    public function testStopSessionSuccessfully(): void
    {
        // Start a session first
        $this->postJson('/api/sessions', [], $this->token);
        $session = json_decode($this->client->getResponse()->getContent(), true);
        $sessionId = $session['id'];

        // Stop it
        $this->requestJson('PATCH', '/api/sessions/' . $sessionId . '/stop', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame('completed', $data['status']);
        $this->assertNotNull($data['endedAt']);
    }

    public function testStopAlreadyStoppedSessionFails(): void
    {
        $this->postJson('/api/sessions', [], $this->token);
        $session = json_decode($this->client->getResponse()->getContent(), true);
        $sessionId = $session['id'];

        // Stop once
        $this->requestJson('PATCH', '/api/sessions/' . $sessionId . '/stop', $this->token);
        // Stop again
        $this->requestJson('PATCH', '/api/sessions/' . $sessionId . '/stop', $this->token);

        $this->assertResponseStatusCodeSame(400);
    }

    public function testSubmitEventsToActiveSession(): void
    {
        $this->postJson('/api/sessions', [], $this->token);
        $session = json_decode($this->client->getResponse()->getContent(), true);
        $sessionId = $session['id'];

        $this->postJson('/api/sessions/' . $sessionId . '/events', [
            [
                'latitude'      => 54.8985,
                'longitude'     => 23.9036,
                'accelerationX' => 0.1,
                'accelerationY' => 0.2,
                'accelerationZ' => 9.8,
            ],
        ], $this->token);

        $this->assertResponseStatusCodeSame(201);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame(1, $data['received']);
        $this->assertEquals(100, $data['currentScore']);
    }

    public function testSubmitEventsToCompletedSessionFails(): void
    {
        $this->postJson('/api/sessions', [], $this->token);
        $session = json_decode($this->client->getResponse()->getContent(), true);
        $sessionId = $session['id'];

        $this->requestJson('PATCH', '/api/sessions/' . $sessionId . '/stop', $this->token);

        $this->postJson('/api/sessions/' . $sessionId . '/events', [
            [
                'latitude'      => 54.8985,
                'longitude'     => 23.9036,
                'accelerationX' => 0.1,
                'accelerationY' => 0.2,
                'accelerationZ' => 9.8,
            ],
        ], $this->token);

        $this->assertResponseStatusCodeSame(400);
    }
}