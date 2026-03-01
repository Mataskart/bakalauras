<?php

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

// User entity — represents a registered driver in the system.
// Implements Symfony's UserInterface for authentication and
// PasswordAuthenticatedUserInterface for password hashing.
#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: '`user`')]
#[ORM\UniqueConstraint(name: 'UNIQ_IDENTIFIER_EMAIL', fields: ['email'])]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    // Used as the unique login identifier
    #[ORM\Column(length: 180)]
    private ?string $email = null;

    // Stores assigned roles e.g. ROLE_USER, ROLE_ADMIN
    #[ORM\Column]
    private array $roles = [];

    // Bcrypt/argon2 hashed password — never stored in plain text
    #[ORM\Column]
    private ?string $password = null;

    #[ORM\Column(length: 255)]
    private ?string $firstName = null;

    #[ORM\Column(length: 255)]
    private ?string $lastName = null;

    #[ORM\Column]
    private ?\DateTimeImmutable $createdAt = null;

    // One user can have many driving sessions
    #[ORM\OneToMany(targetEntity: DrivingSession::class, mappedBy: 'driver')]
    private Collection $drivingSessions;

    public function __construct()
    {
        $this->drivingSessions = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setEmail(string $email): static
    {
        $this->email = $email;
        return $this;
    }

    // Returns the field Symfony uses to identify the user (email in our case)
    public function getUserIdentifier(): string
    {
        return (string) $this->email;
    }

    // Every user gets ROLE_USER by default even if the roles column is empty
    public function getRoles(): array
    {
        $roles = $this->roles;
        $roles[] = 'ROLE_USER';
        return array_unique($roles);
    }

    public function setRoles(array $roles): static
    {
        $this->roles = $roles;
        return $this;
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function setPassword(string $password): static
    {
        $this->password = $password;
        return $this;
    }

    // Required by UserInterface — was used for clearing plain-text passwords
    // from memory. Deprecated in Symfony 7, kept for interface compatibility.
    #[\Deprecated]
    public function eraseCredentials(): void {}

    public function getFirstName(): ?string
    {
        return $this->firstName;
    }

    public function setFirstName(string $firstName): static
    {
        $this->firstName = $firstName;
        return $this;
    }

    public function getLastName(): ?string
    {
        return $this->lastName;
    }

    public function setLastName(string $lastName): static
    {
        $this->lastName = $lastName;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeImmutable $createdAt): static
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    // Returns all driving sessions belonging to this user
    public function getDrivingSessions(): Collection
    {
        return $this->drivingSessions;
    }

    public function addDrivingSession(DrivingSession $drivingSession): static
    {
        if (!$this->drivingSessions->contains($drivingSession)) {
            $this->drivingSessions->add($drivingSession);
            $drivingSession->setDriver($this);
        }
        return $this;
    }

    public function removeDrivingSession(DrivingSession $drivingSession): static
    {
        if ($this->drivingSessions->removeElement($drivingSession)) {
            // Clear the owning side of the relation if it still points to this user
            if ($drivingSession->getDriver() === $this) {
                $drivingSession->setDriver(null);
            }
        }
        return $this;
    }
}