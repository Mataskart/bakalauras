<?php

namespace App\Command;

use App\Service\SpeedLimitService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Pre-fill the speed limit cache for a bounding box so the app rarely needs to call Overpass.
 * Example: php bin/console app:speed-limit-cache:fill --bbox=53.8,20.9,56.5,26.9 (Lithuania approx.)
 * Step size 0.01 ≈ 1 km; use --step=0.005 for denser coverage.
 */
#[AsCommand(
    name: 'app:speed-limit-cache:fill',
    description: 'Pre-fill speed limit cache from Overpass for a bounding box (lat/lon)',
)]
class SpeedLimitCacheFillCommand extends Command
{
    public function __construct(
        private readonly SpeedLimitService $speedLimitService
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('bbox', null, InputOption::VALUE_REQUIRED, 'Bounding box: minLat,minLon,maxLat,maxLon (e.g. 53.8,20.9,56.5,26.9 for Lithuania)')
            ->addOption('step', null, InputOption::VALUE_REQUIRED, 'Grid step in degrees (default 0.01 ≈ 1km)', '0.01')
            ->addOption('delay', null, InputOption::VALUE_REQUIRED, 'Seconds to wait between Overpass requests (default 1)', '1');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $bbox = $input->getOption('bbox');
        $step = (float) $input->getOption('step');
        $delay = (float) $input->getOption('delay');

        if ($bbox === null || $bbox === '') {
            $io->error('Provide --bbox=minLat,minLon,maxLat,maxLon');
            return Command::FAILURE;
        }

        $parts = array_map('trim', explode(',', $bbox));
        if (count($parts) !== 4) {
            $io->error('bbox must be minLat,minLon,maxLat,maxLon (four numbers)');
            return Command::FAILURE;
        }

        $minLat = (float) $parts[0];
        $minLon = (float) $parts[1];
        $maxLat = (float) $parts[2];
        $maxLon = (float) $parts[3];

        if ($minLat >= $maxLat || $minLon >= $maxLon) {
            $io->error('Invalid bbox: min must be less than max');
            return Command::FAILURE;
        }

        $roundPrecision = 4;
        $step = round($step, 4);
        if ($step <= 0 || $step > 1) {
            $io->error('step must be between 0 and 1 (e.g. 0.01)');
            return Command::FAILURE;
        }

        $count = 0;
        $lat = $minLat;
        while ($lat <= $maxLat) {
            $lon = $minLon;
            while ($lon <= $maxLon) {
                $latR = round($lat, $roundPrecision);
                $lonR = round($lon, $roundPrecision);
                $this->speedLimitService->getSpeedLimitKmh($latR, $lonR);
                $count++;
                if ($delay > 0) {
                    usleep((int) ($delay * 1_000_000));
                }
                $lon += $step;
            }
            $lat += $step;
            $this->speedLimitService->clearCache();
        }

        $io->success("Processed {$count} grid points. Cache is filled (existing DB entries were reused).");
        return Command::SUCCESS;
    }
}
