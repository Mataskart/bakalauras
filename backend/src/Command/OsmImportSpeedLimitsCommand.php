<?php

namespace App\Command;

use App\Repository\SpeedLimitCacheRepository;
use App\Service\SpeedLimitService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Imports road speed limits from a GeoJSONSeq file (one Feature per line) into the DB cache.
 *
 * The file is produced on the VPS by osmium-tool from a Lithuania OSM extract:
 *   osmium tags-filter lithuania-latest.osm.pbf w/maxspeed -o lithuania-maxspeed.osm.pbf
 *   osmium export lithuania-maxspeed.osm.pbf --geometry-types=linestring -f geojsonseq -o lithuania-maxspeed.geojsonseq
 *
 * Then run:
 *   php bin/console app:osm:import-speed-limits --file=/path/to/lithuania-maxspeed.geojsonseq
 *
 * Each coordinate of every road LineString is rounded to 4 decimal places (~11 m) and inserted
 * into speed_limit_cache (ON CONFLICT DO NOTHING), so after the import the app never needs to
 * call the public Overpass API for Lithuanian roads.
 */
#[AsCommand(
    name: 'app:osm:import-speed-limits',
    description: 'Import road speed limits from a GeoJSONSeq file (osmium export output) into DB cache',
)]
class OsmImportSpeedLimitsCommand extends Command
{
    private const BATCH_SIZE = 500;
    private const ROUND_PRECISION = 4;

    public function __construct(
        private readonly SpeedLimitCacheRepository $cacheRepository,
        private readonly SpeedLimitService $speedLimitService,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('file', null, InputOption::VALUE_REQUIRED, 'Path to the GeoJSONSeq file (one Feature JSON per line)')
            ->addOption('highway-only', null, InputOption::VALUE_NONE, 'Skip features that have no "highway" property (default: include all)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $filePath = $input->getOption('file');
        if (!$filePath || !file_exists($filePath)) {
            $io->error('Provide a valid --file path to the GeoJSONSeq file.');
            return Command::FAILURE;
        }

        $highwayOnly = (bool) $input->getOption('highway-only');

        $fh = fopen($filePath, 'r');
        if ($fh === false) {
            $io->error("Cannot open file: {$filePath}");
            return Command::FAILURE;
        }

        $io->title('OSM speed limit import');
        $io->text("File: {$filePath}");
        $io->text('Batch size: ' . self::BATCH_SIZE);
        if ($highwayOnly) {
            $io->text('Mode: highway features only');
        }
        $io->newLine();

        $batch        = [];
        $linesRead    = 0;
        $featuresKept = 0;
        $pointsTotal  = 0;
        $inserted     = 0;

        while (($line = fgets($fh)) !== false) {
            $linesRead++;
            // GeoJSONSeq (RFC 8142) prefixes each record with ASCII 0x1E (Record Separator).
            // Strip it along with normal whitespace so json_decode gets clean JSON.
            $line = trim($line, " \t\n\r\0\x0B\x1E");
            if ($line === '') {
                continue;
            }

            $feature = json_decode($line, true);
            if (!is_array($feature)
                || ($feature['type'] ?? '') !== 'Feature'
                || ($feature['geometry']['type'] ?? '') !== 'LineString'
            ) {
                continue;
            }

            $props    = $feature['properties'] ?? [];
            $maxspeed = $props['maxspeed'] ?? null;

            if ($maxspeed === null) {
                continue;
            }

            if ($highwayOnly && !isset($props['highway'])) {
                continue;
            }

            $speedKmh = $this->speedLimitService->parseMaxspeed((string) $maxspeed);
            if ($speedKmh === null) {
                continue;
            }

            $featuresKept++;

            // GeoJSON coordinates are [longitude, latitude]
            foreach ($feature['geometry']['coordinates'] as [$lon, $lat]) {
                $latR = round((float) $lat, self::ROUND_PRECISION);
                $lonR = round((float) $lon, self::ROUND_PRECISION);

                $batch[] = ['lat' => $latR, 'lon' => $lonR, 'speed' => $speedKmh];
                $pointsTotal++;

                if (count($batch) >= self::BATCH_SIZE) {
                    $this->cacheRepository->batchInsertIgnore($batch);
                    $inserted += count($batch);
                    $batch = [];

                    if ($inserted % 50_000 === 0) {
                        $io->text("  {$inserted} points inserted (lines read: {$linesRead}, features kept: {$featuresKept})");
                    }
                }
            }
        }

        // Flush remaining batch
        if ($batch !== []) {
            $this->cacheRepository->batchInsertIgnore($batch);
            $inserted += count($batch);
        }

        fclose($fh);

        $io->success(sprintf(
            'Done. Lines read: %d | Features with valid maxspeed: %d | Coordinate points processed: %d | DB rows attempted: %d (duplicates skipped automatically)',
            $linesRead,
            $featuresKept,
            $pointsTotal,
            $inserted,
        ));

        return Command::SUCCESS;
    }
}
