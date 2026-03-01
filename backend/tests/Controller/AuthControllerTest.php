<?php

namespace App\Tests\Controller;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

// Integration tests for the authentication endpoints.
// These tests use a real HTTP client against the test database.
class AuthControllerTest extends WebTestCase
{
    private $client;
    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->cleanDatabase();
    }

    // Remove all users before each test to ensure a clean state
    private function cleanDatabase(): void
    {
        $this->em->createQuery('DELETE FROM App\Entity\DrivingEvent')->execute();
        $this->em->createQuery('DELETE FROM App\Entity\DrivingSession')->execute();
        $this->em->createQuery('DELETE FROM App\Entity\User')->execute();
    }

    // Helper to send a JSON POST request
    private function postJson(string $url, array $data): void
    {
        $this->client->request(
            'POST',
            $url,
            [],
            [],
            ['CONTENT_TYPE' => 'application/json'],
            json_encode($data)
        );
    }

    public function testRegisterSuccessfully(): void
    {
        $this->postJson('/api/auth/register', [
            'email'     => 'test@test.com',
            'password'  => 'password123',
            'firstName' => 'Matas',
            'lastName'  => 'Sidekerskis',
        ]);

        $this->assertResponseStatusCodeSame(201);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame('test@test.com', $data['email']);
    }

    public function testRegisterFailsWithMissingFields(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'test@test.com',
            // password, firstName, lastName missing
        ]);

        $this->assertResponseStatusCodeSame(400);
    }

    public function testRegisterFailsWithDuplicateEmail(): void
    {
        $this->postJson('/api/auth/register', [
            'email'     => 'test@test.com',
            'password'  => 'password123',
            'firstName' => 'Matas',
            'lastName'  => 'Sidekerskis',
        ]);

        // Second registration with the same email
        $this->postJson('/api/auth/register', [
            'email'     => 'test@test.com',
            'password'  => 'different123',
            'firstName' => 'Other',
            'lastName'  => 'User',
        ]);

        $this->assertResponseStatusCodeSame(409);
    }

    public function testLoginSuccessfully(): void
    {
        // Register first so the user exists
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

        $this->assertResponseStatusCodeSame(200);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertArrayHasKey('token', $data);
        $this->assertNotEmpty($data['token']);
    }

    public function testLoginFailsWithWrongPassword(): void
    {
        $this->postJson('/api/auth/register', [
            'email'     => 'test@test.com',
            'password'  => 'password123',
            'firstName' => 'Matas',
            'lastName'  => 'Sidekerskis',
        ]);

        $this->postJson('/api/auth/login', [
            'email'    => 'test@test.com',
            'password' => 'wrongpassword',
        ]);

        $this->assertResponseStatusCodeSame(401);
    }

    public function testProtectedRouteRequiresToken(): void
    {
        $this->client->request('GET', '/api/sessions');
        $this->assertResponseStatusCodeSame(401);
    }
}