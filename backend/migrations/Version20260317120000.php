<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Add speed, speed_limit_kmh and speeding columns to driving_event for GPS/OSM speed limit scoring.
 */
final class Version20260317120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add speed (km/h), speed_limit_kmh (OSM), and speeding flag to driving_event';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE driving_event ADD speed DOUBLE PRECISION DEFAULT NULL');
        $this->addSql('ALTER TABLE driving_event ADD speed_limit_kmh DOUBLE PRECISION DEFAULT NULL');
        $this->addSql('ALTER TABLE driving_event ADD speeding BOOLEAN DEFAULT FALSE NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE driving_event DROP speed');
        $this->addSql('ALTER TABLE driving_event DROP speed_limit_kmh');
        $this->addSql('ALTER TABLE driving_event DROP speeding');
    }
}
