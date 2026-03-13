<?php

namespace App\Tests\Controller;

use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

// Integration tests for the GET /api/leaderboard endpoint.
class LeaderboardControllerTest extends WebTestCase
{
    private $client;
    private EntityManagerInterface $em;
    private string $token;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->cleanDatabase();
        $this->token = $this->registerAndLogin('test@test.com', 'Matas', 'Sidekerskis');
    }

    private function cleanDatabase(): void
    {
        $this->em->createQuery('DELETE FROM App\Entity\DrivingEvent')->execute();
        $this->em->createQuery('DELETE FROM App\Entity\DrivingSession')->execute();
        $this->em->createQuery('DELETE FROM App\Entity\User')->execute();
    }

    private function registerAndLogin(string $email, string $firstName, string $lastName): string
    {
        $this->postJson('/api/auth/register', [
            'email'     => $email,
            'password'  => 'password123',
            'firstName' => $firstName,
            'lastName'  => $lastName,
        ]);

        $this->postJson('/api/auth/login', [
            'email'    => $email,
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

    private function patchJson(string $url, ?string $token = null): void
    {
        $headers = ['CONTENT_TYPE' => 'application/json'];
        if ($token) {
            $headers['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
        }
        $this->client->request('PATCH', $url, [], [], $headers);
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

    // Starts a session, submits events and stops it — returns the final score
    private function completeSession(string $token, float $accelerationY): float
    {
        $this->postJson('/api/sessions', [], $token);
        $session = json_decode($this->client->getResponse()->getContent(), true);
        $sessionId = $session['id'];

        $this->postJson('/api/sessions/' . $sessionId . '/events', [[
            'latitude'      => 54.8985,
            'longitude'     => 23.9036,
            'accelerationX' => 0.0,
            'accelerationY' => $accelerationY,
            'accelerationZ' => 9.8,
        ]], $token);

        $this->patchJson('/api/sessions/' . $sessionId . '/stop', $token);
        $stopped = json_decode($this->client->getResponse()->getContent(), true);
        return (float) $stopped['score'];
    }

    public function testLeaderboardRequiresAuth(): void
    {
        $this->getJson('/api/leaderboard');
        $this->assertResponseStatusCodeSame(401);
    }

    public function testLeaderboardEmptyWithNoCompletedSessions(): void
    {
        $data = $this->getJson('/api/leaderboard', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertSame([], $data);
    }

    public function testLeaderboardShowsUserAfterCompletedSession(): void
    {
        $this->completeSession($this->token, 0.2); // normal driving — score 100

        $data = $this->getJson('/api/leaderboard', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertCount(1, $data);
        $this->assertSame(1, $data[0]['rank']);
        $this->assertSame('Matas Sidekerskis', $data[0]['name']);
        $this->assertEquals(100, $data[0]['averageScore']);
        $this->assertSame(1, $data[0]['totalSessions']);
    }

    public function testLeaderboardRanksHigherScoreFirst(): void
    {
        // First user — normal driving, score 100
        $this->completeSession($this->token, 0.2);

        // Second user — hard braking, lower score
        $token2 = $this->registerAndLogin('second@test.com', 'Jonas', 'Jonaitis');
        $this->completeSession($token2, -5.2);

        $data = $this->getJson('/api/leaderboard', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertCount(2, $data);

        // Higher score should be rank 1
        $this->assertSame(1, $data[0]['rank']);
        $this->assertSame('Matas Sidekerskis', $data[0]['name']);
        $this->assertSame(2, $data[1]['rank']);
        $this->assertSame('Jonas Jonaitis', $data[1]['name']);

        // Rank 1 score must be higher than rank 2
        $this->assertGreaterThan($data[1]['averageScore'], $data[0]['averageScore']);
    }

    public function testLeaderboardAveragesMultipleSessions(): void
    {
        // Complete two sessions with different scores
        $this->completeSession($this->token, 0.2);  // score 100
        $this->completeSession($this->token, -5.2); // score < 100

        $data = $this->getJson('/api/leaderboard', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertCount(1, $data);
        $this->assertSame(2, $data[0]['totalSessions']);

        // Average must be between the two scores
        $this->assertGreaterThan(0, $data[0]['averageScore']);
        $this->assertLessThan(100, $data[0]['averageScore']);
    }

    public function testLeaderboardLimitedToTen(): void
    {
        // Register 11 users and complete a session for each
        for ($i = 1; $i <= 11; $i++) {
            $token = $this->registerAndLogin("user{$i}@test.com", "User", "Number{$i}");
            $this->completeSession($token, 0.2);
        }

        $data = $this->getJson('/api/leaderboard', $this->token);

        $this->assertResponseStatusCodeSame(200);
        $this->assertCount(10, $data);
    }
}