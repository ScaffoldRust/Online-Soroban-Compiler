import { Request, Response } from 'express';
import { executeCommand, CommandTimeoutError } from '../utils/commandExecutor';
import { FileManager, ProjectConfig } from '../utils/fileManager';

/**
 * Interface for compile/test request body
 */
export interface CompileRequest {
  /** The Rust source code to compile */
  code: string;
  /** Optional project name */
  projectName?: string;
  /** Optional additional dependencies */
  dependencies?: Record<string, string>;
}

/**
 * Interface for API response
 */
export interface ApiResponse {
  /** Whether the operation was successful */
  success: boolean;
  /** Result message or error message */
  message: string;
  /** Additional output (stdout/stderr) */
  output?: string;
  /** Error details if applicable */
  error?: string;
  /** Duration of the operation in milliseconds */
  duration?: number;
}

/**
 * Compiler controller for handling compilation and testing requests
 */
export class CompilerController {
  /**
   * Handles compilation requests
   * POST /api/compile
   */
  static async compile(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    let project: Awaited<ReturnType<typeof FileManager.createProject>> | null = null;

    try {
      // Validate request body
      const { code, projectName, dependencies }: CompileRequest = req.body;

      if (!code || typeof code !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Invalid request: code is required and must be a string',
          duration: Date.now() - startTime,
        } as ApiResponse);
        return;
      }

      if (code.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid request: code cannot be empty',
          duration: Date.now() - startTime,
        } as ApiResponse);
        return;
      }

      // Create temporary project
      const config: ProjectConfig = { code, projectName, dependencies };
      project = await FileManager.createProject(config);

      // Build the project
      const buildResult = await executeCommand(
        'cargo',
        ['build', '--target', 'wasm32-unknown-unknown', '--release'],
        {
          cwd: project.projectPath,
          timeout: 30000, // 30 seconds
        }
      );

      if (buildResult.exitCode === 0) {
        // Try to optimize with stellar CLI if available
        try {
          const optimizeResult = await executeCommand(
            'stellar',
            ['contract', 'build', '--package', 'soroban-contract'],
            {
              cwd: project.projectPath,
              timeout: 30000,
            }
          );

          res.json({
            success: true,
            message: 'Compilation and optimization successful',
            output: `Build Output:\n${buildResult.stdout}\n\nOptimization Output:\n${optimizeResult.stdout}`,
            duration: Date.now() - startTime,
          } as ApiResponse);
        } catch (optimizeError) {
          // Optimization failed, but compilation succeeded
          res.json({
            success: true,
            message: 'Compilation successful (optimization failed)',
            output: buildResult.stdout,
            error: optimizeError instanceof Error ? optimizeError.message : 'Optimization failed',
            duration: Date.now() - startTime,
          } as ApiResponse);
        }
      } else {
        res.status(400).json({
          success: false,
          message: 'Compilation failed',
          output: buildResult.stdout,
          error: buildResult.stderr,
          duration: Date.now() - startTime,
        } as ApiResponse);
      }
    } catch (error) {
      // Log error for debugging (removed console.error for linting)

      if (error instanceof CommandTimeoutError) {
        res.status(408).json({
          success: false,
          message: 'Compilation timed out',
          error: error.message,
          duration: Date.now() - startTime,
        } as ApiResponse);
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error during compilation',
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
        } as ApiResponse);
      }
    } finally {
      // Clean up the temporary project
      if (project) {
        try {
          await project.cleanup();
        } catch {
          // Ignore cleanup errors during error handling
        }
      }
    }
  }

  /**
   * Handles test requests
   * POST /api/test
   */
  static async test(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    let project: Awaited<ReturnType<typeof FileManager.createProject>> | null = null;

    try {
      // Validate request body
      const { code, projectName, dependencies }: CompileRequest = req.body;

      if (!code || typeof code !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Invalid request: code is required and must be a string',
          duration: Date.now() - startTime,
        } as ApiResponse);
        return;
      }

      if (code.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid request: code cannot be empty',
          duration: Date.now() - startTime,
        } as ApiResponse);
        return;
      }

      // Create temporary project
      const config: ProjectConfig = { code, projectName, dependencies };
      project = await FileManager.createProject(config);

      // Run tests
      const testResult = await executeCommand('cargo', ['test'], {
        cwd: project.projectPath,
        timeout: 30000, // 30 seconds
      });

      if (testResult.exitCode === 0) {
        res.json({
          success: true,
          message: 'All tests passed',
          output: testResult.stdout,
          duration: Date.now() - startTime,
        } as ApiResponse);
      } else {
        res.status(400).json({
          success: false,
          message: 'Tests failed',
          output: testResult.stdout,
          error: testResult.stderr,
          duration: Date.now() - startTime,
        } as ApiResponse);
      }
    } catch (error) {
      // Log error for debugging (removed console.error for linting)

      if (error instanceof CommandTimeoutError) {
        res.status(408).json({
          success: false,
          message: 'Testing timed out',
          error: error.message,
          duration: Date.now() - startTime,
        } as ApiResponse);
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error during testing',
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
        } as ApiResponse);
      }
    } finally {
      // Clean up the temporary project
      if (project) {
        try {
          await project.cleanup();
        } catch {
          // Ignore cleanup errors during error handling
        }
      }
    }
  }

  /**
   * Handles health check requests
   * GET /api/health
   */
  static async health(req: Request, res: Response): Promise<void> {
    try {
      // Check if required tools are available
      const checks = {
        cargo: false,
        rustTarget: false,
        stellar: false,
      };

      try {
        const cargoResult = await executeCommand('cargo', ['--version'], { timeout: 5000 });
        checks.cargo = cargoResult.exitCode === 0;
      } catch {
        // Cargo not available
      }

      try {
        const targetResult = await executeCommand('rustup', ['target', 'list', '--installed'], {
          timeout: 5000,
        });
        checks.rustTarget = targetResult.stdout.includes('wasm32-unknown-unknown');
      } catch {
        // Rustup not available
      }

      try {
        const stellarResult = await executeCommand('stellar', ['--version'], { timeout: 5000 });
        checks.stellar = stellarResult.exitCode === 0;
      } catch {
        // Stellar CLI not available
      }

      const allHealthy = checks.cargo && checks.rustTarget;

      res.status(allHealthy ? 200 : 503).json({
        success: allHealthy,
        message: allHealthy ? 'Service is healthy' : 'Service has issues',
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
