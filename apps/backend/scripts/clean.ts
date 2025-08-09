import { cleanupProject } from '../src/utils/fileManager';

async function main() {
  const customPath = process.argv[2];
  
  if (!customPath) {
    console.error('Please provide a path to clean');
    console.log('Usage: bun run clean-advanced -- /path/to/project');
    process.exit(1);
  }

  try {
    await cleanupProject(customPath);
    console.log('Advanced cleanup completed successfully');
  } catch (error) {
    console.error('Advanced cleanup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

await main();