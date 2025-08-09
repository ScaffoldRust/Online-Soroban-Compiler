import { Router, type Request, type Response } from 'express';
import { setupProject, createRustProject } from '../utils/fileManager';
import { executeCommand } from '../utils/commandExecutor';

const router = Router();

/**
 * Request body interface for compile and test endpoints
 */
interface CompilerRequest {
  code: string;
}

/**
 * Response interface for successful operations
 */
interface CompilerResponse {
  output: string;
}

/**
 * Error response interface
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Validates the request body to ensure code is a non-empty string
 */
function validateRequest(req: Request): string | null {
  const { code } = req.body as CompilerRequest;

  if (!code || typeof code !== 'string') {
    return 'Code must be provided as a non-empty string';
  }

  if (code.trim() === '') {
    return 'Code cannot be empty';
  }

  return null;
}

/**
 * POST /api/compile
 * Compiles Rust/Soroban code using cargo build and stellar contract build
 */
router.post('/compile', async (req: Request, res: Response<CompilerResponse | ErrorResponse>) => {
  try {
    // Validate request
    const validationError = validateRequest(req);
    if (validationError) {
      return res.status(400).json({
        error: 'Invalid input',
        message: validationError,
      });
    }

    const { code } = req.body as CompilerRequest;

    // Set up temporary project
    const project = await setupProject({ baseName: 'compile-project' });

    try {
      // Create Rust project structure
      await createRustProject(project.tempDir, code);

      // Execute compilation commands
      const buildCommand = `cargo build --target wasm32-unknown-unknown --release`;
      await executeCommand(buildCommand, 300000, project.tempDir);

      // Execute stellar contract build using full path
      const stellarCommand = `stellar contract build`;
      const output = await executeCommand(stellarCommand, 300000, project.tempDir);

      // Return successful compilation result
      res.status(200).json({
        output: output || 'Compilation successful',
      });
    } catch (error) {
      // Handle compilation errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown compilation error';
      res.status(400).json({
        error: 'Compilation failed',
        message: errorMessage,
      });
    } finally {
      // Always cleanup the temporary directory
      await project.cleanup();
    }
  } catch {
    // Handle server errors
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process compilation request',
    });
  }
});

/**
 * POST /api/test
 * Runs tests for Rust/Soroban code using cargo test
 */
router.post('/test', async (req: Request, res: Response<CompilerResponse | ErrorResponse>) => {
  try {
    // Validate request
    const validationError = validateRequest(req);
    if (validationError) {
      return res.status(400).json({
        error: 'Invalid input',
        message: validationError,
      });
    }

    const { code } = req.body as CompilerRequest;

    // Set up temporary project
    const project = await setupProject({ baseName: 'test-project' });

    try {
      // Create Rust project structure
      await createRustProject(project.tempDir, code);

      // Execute test command
      const testCommand = `cargo test`;
      const output = await executeCommand(testCommand, 300000, project.tempDir);

      // Return successful test result
      res.status(200).json({
        output: output || 'All tests passed',
      });
    } catch (error) {
      // Handle test errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown test error';
      res.status(400).json({
        error: 'Tests failed',
        message: errorMessage,
      });
    } finally {
      // Always cleanup the temporary directory
      await project.cleanup();
    }
  } catch {
    // Handle server errors
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process test request',
    });
  }
});

export default router;
