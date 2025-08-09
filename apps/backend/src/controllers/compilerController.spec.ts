import type { Request, Response } from 'express';
import { CompilerController } from './compilerController';
import { executeCommand, CommandTimeoutError } from '../utils/commandExecutor';
import { FileManager } from '../utils/fileManager';

// Mock dependencies
jest.mock('../utils/commandExecutor');
jest.mock('../utils/fileManager');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockFileManager = FileManager as jest.Mocked<typeof FileManager>;

describe('CompilerController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockJson = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnThis();

    mockRequest = {
      body: {},
    };

    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };

    // Setup default FileManager mock
    const mockProjectInfo = {
      projectPath: '/tmp/test-project',
      sourcePath: '/tmp/test-project/src/lib.rs',
      cargoPath: '/tmp/test-project/Cargo.toml',
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    mockFileManager.createProject.mockResolvedValue(mockProjectInfo);
  });

  describe('compile', () => {
    it('should compile code successfully', async () => {
      mockRequest.body = {
        code: 'use soroban_sdk::*;',
        projectName: 'test-project',
      };

      // Mock successful cargo build
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Compiling test-project v0.1.0',
        stderr: '',
        timedOut: false,
      });

      // Mock successful stellar optimization
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Optimization complete',
        stderr: '',
        timedOut: false,
      });

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockFileManager.createProject).toHaveBeenCalledWith({
        code: 'use soroban_sdk::*;',
        projectName: 'test-project',
        dependencies: undefined,
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'cargo',
        ['build', '--target', 'wasm32-unknown-unknown', '--release'],
        {
          cwd: '/tmp/test-project',
          timeout: 30000,
        }
      );

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'stellar',
        ['contract', 'build', '--package', 'soroban-contract'],
        {
          cwd: '/tmp/test-project',
          timeout: 30000,
        }
      );

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Compilation and optimization successful',
        output: expect.stringContaining(
          'Build Output:\nCompiling test-project v0.1.0\n\nOptimization Output:\nOptimization complete'
        ),
        duration: expect.any(Number),
      });
    });

    it('should handle compilation without optimization when stellar fails', async () => {
      mockRequest.body = {
        code: 'use soroban_sdk::*;',
      };

      // Mock successful cargo build
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Build successful',
        stderr: '',
        timedOut: false,
      });

      // Mock stellar optimization failure
      mockExecuteCommand.mockRejectedValueOnce(new Error('Stellar CLI not found'));

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Compilation successful (optimization failed)',
        output: 'Build successful',
        error: 'Stellar CLI not found',
        duration: expect.any(Number),
      });
    });

    it('should handle compilation failure', async () => {
      mockRequest.body = {
        code: 'invalid rust code',
      };

      // Mock failed cargo build
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'error: expected expression, found `invalid`',
        timedOut: false,
      });

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Compilation failed',
        output: '',
        error: 'error: expected expression, found `invalid`',
        duration: expect.any(Number),
      });
    });

    it('should handle timeout errors', async () => {
      mockRequest.body = {
        code: 'use soroban_sdk::*;',
      };

      const timeoutError = new CommandTimeoutError(30000);
      // Ensure the error has the proper message property
      Object.defineProperty(timeoutError, 'message', {
        value: 'Command exceeded time limit of 30000ms',
        writable: false,
        configurable: true,
      });
      mockExecuteCommand.mockRejectedValueOnce(timeoutError);

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(408);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Compilation timed out',
        error: expect.stringContaining('Command exceeded time limit'),
        duration: expect.any(Number),
      });
    });

    it('should validate request body - missing code', async () => {
      mockRequest.body = {};

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code is required and must be a string',
        duration: expect.any(Number),
      });

      expect(mockFileManager.createProject).not.toHaveBeenCalled();
    });

    it('should validate request body - empty code', async () => {
      mockRequest.body = {
        code: '   ',
      };

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code cannot be empty',
        duration: expect.any(Number),
      });
    });

    it('should validate request body - invalid code type', async () => {
      mockRequest.body = {
        code: 123,
      };

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code is required and must be a string',
        duration: expect.any(Number),
      });
    });

    it('should cleanup project even on errors', async () => {
      mockRequest.body = {
        code: 'use soroban_sdk::*;',
      };

      const mockCleanup = jest.fn().mockResolvedValue(undefined);
      mockFileManager.createProject.mockResolvedValue({
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: mockCleanup,
      });

      mockExecuteCommand.mockRejectedValueOnce(new Error('Build failed'));

      await CompilerController.compile(mockRequest as Request, mockResponse as Response);

      expect(mockCleanup).toHaveBeenCalled();
    });
  });

  describe('test', () => {
    it('should run tests successfully', async () => {
      mockRequest.body = {
        code: `
          use soroban_sdk::*;
          
          #[cfg(test)]
          mod test {
              use super::*;
              
              #[test]
              fn test_example() {
                  assert_eq!(2 + 2, 4);
              }
          }
        `,
      };

      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'test test::test_example ... ok\n\ntest result: ok. 1 passed; 0 failed',
        stderr: '',
        timedOut: false,
      });

      await CompilerController.test(mockRequest as Request, mockResponse as Response);

      expect(mockExecuteCommand).toHaveBeenCalledWith('cargo', ['test'], {
        cwd: '/tmp/test-project',
        timeout: 30000,
      });

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'All tests passed',
        output: 'test test::test_example ... ok\n\ntest result: ok. 1 passed; 0 failed',
        duration: expect.any(Number),
      });
    });

    it('should handle test failures', async () => {
      mockRequest.body = {
        code: 'failing test code',
      };

      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 1,
        stdout: 'test test::failing_test ... FAILED',
        stderr: 'assertion failed: false',
        timedOut: false,
      });

      await CompilerController.test(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Tests failed',
        output: 'test test::failing_test ... FAILED',
        error: 'assertion failed: false',
        duration: expect.any(Number),
      });
    });

    it('should handle test timeout', async () => {
      mockRequest.body = {
        code: 'infinite loop test',
      };

      const timeoutError = new CommandTimeoutError(30000);
      // Ensure the error has the proper message property
      Object.defineProperty(timeoutError, 'message', {
        value: 'Command exceeded time limit of 30000ms',
        writable: false,
        configurable: true,
      });
      mockExecuteCommand.mockRejectedValueOnce(timeoutError);

      await CompilerController.test(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(408);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Testing timed out',
        error: expect.stringContaining('Command exceeded time limit'),
        duration: expect.any(Number),
      });
    });

    it('should validate test request body', async () => {
      mockRequest.body = {};

      await CompilerController.test(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code is required and must be a string',
        duration: expect.any(Number),
      });
    });
  });

  describe('health', () => {
    it('should return healthy status when all tools are available', async () => {
      // Mock cargo --version
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'cargo 1.75.0',
        stderr: '',
        timedOut: false,
      });

      // Mock rustup target list
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'wasm32-unknown-unknown\nx86_64-unknown-linux-gnu',
        stderr: '',
        timedOut: false,
      });

      // Mock stellar --version
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'stellar 21.0.0',
        stderr: '',
        timedOut: false,
      });

      await CompilerController.health(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Service is healthy',
        checks: {
          cargo: true,
          rustTarget: true,
          stellar: true,
        },
        timestamp: expect.any(String),
      });
    });

    it('should return unhealthy status when cargo is missing', async () => {
      // Mock cargo failure
      mockExecuteCommand.mockRejectedValueOnce(new Error('Command not found'));

      // Mock rustup success but no wasm target
      mockExecuteCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'x86_64-unknown-linux-gnu',
        stderr: '',
        timedOut: false,
      });

      // Mock stellar failure
      mockExecuteCommand.mockRejectedValueOnce(new Error('Command not found'));

      await CompilerController.health(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Service has issues',
        checks: {
          cargo: false,
          rustTarget: false,
          stellar: false,
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle health check errors gracefully', async () => {
      // Mock all health checks to fail, which should result in 503 status
      mockExecuteCommand.mockRejectedValue(new Error('Unexpected error'));

      await CompilerController.health(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Service has issues',
        checks: {
          cargo: false,
          rustTarget: false,
          stellar: false,
        },
        timestamp: expect.any(String),
      });
    });
  });
});
