<?php

namespace App\Controller;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;

// Handles user registration. Login is handled automatically by Symfony's
// security layer via the json_login firewall defined in security.yaml.
#[Route('/api/auth')]
class AuthController extends AbstractController
{
    // POST /api/auth/register — creates a new user account.
    // This route is publicly accessible (no JWT required).
    #[Route('/register', name: 'api_auth_register', methods: ['POST'])]
    public function register(
        Request $request,
        UserPasswordHasherInterface $passwordHasher,
        EntityManagerInterface $em
    ): JsonResponse {
        $data = json_decode($request->getContent(), true);

        // Ensure all required fields are present before proceeding
        if (empty($data['email']) || empty($data['password']) || empty($data['firstName']) || empty($data['lastName'])) {
            return $this->json(['error' => 'Missing required fields'], 400);
        }

        // Prevent duplicate accounts — email must be unique
        $existing = $em->getRepository(User::class)->findOneBy(['email' => $data['email']]);
        if ($existing) {
            return $this->json(['error' => 'Email already registered'], 409);
        }

        $user = new User();
        $user->setEmail($data['email']);
        $user->setFirstName($data['firstName']);
        $user->setLastName($data['lastName']);
        $user->setCreatedAt(new \DateTimeImmutable());

        // Hash the plain-text password before persisting — never stored raw
        $user->setPassword(
            $passwordHasher->hashPassword($user, $data['password'])
        );

        $em->persist($user);
        $em->flush();

        return $this->json([
            'message' => 'User registered successfully',
            'email' => $user->getEmail(),
        ], 201);
    }
}