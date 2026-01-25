import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config';

const MAX_FILE_AGE_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

async function getFileAge(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return Date.now() - stats.mtimeMs;
  } catch {
    return 0;
  }
}

async function cleanDirectory(dirPath: string): Promise<number> {
  let deletedCount = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        deletedCount += await cleanDirectory(fullPath);

        const remainingFiles = await fs.readdir(fullPath);
        if (remainingFiles.length === 0) {
          await fs.rmdir(fullPath);
        }
      } else {
        const age = await getFileAge(fullPath);
        if (age > MAX_FILE_AGE_MS) {
          await fs.unlink(fullPath);
          deletedCount++;
        }
      }
    }
  } catch (error) {
    console.error(`Cleanup error in ${dirPath}:`, error);
  }

  return deletedCount;
}

export async function runCleanup(): Promise<void> {
  const directories = [
    config.uploadDir,
    config.extractedDir,
    config.reportsDir,
    config.sessionsDir,
  ];

  let totalDeleted = 0;

  for (const dir of directories) {
    const deleted = await cleanDirectory(dir);
    totalDeleted += deleted;
  }

  if (totalDeleted > 0) {
    console.log(`🧹 Cleanup: ${totalDeleted} old files deleted`);
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCleanupScheduler(): void {
  runCleanup().catch(console.error);

  cleanupInterval = setInterval(() => {
    runCleanup().catch(console.error);
  }, CLEANUP_INTERVAL_MS);

  console.log('🗑️ File cleanup scheduler started (1h max age, 15min interval)');
}

export function stopCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
