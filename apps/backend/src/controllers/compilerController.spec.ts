import { jest } from '@jest/globals';
import { FileManager } from '../utils/fileManager';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { CommandResult } from '../utils/commandExecutor';

// Mock the utility modules
jest.mock('../utils/fileManager');
jest.mock('../utils/commandExecutor');

const mockExecuteCommand = jest.fn() as jest.MockedFunction<
  (...args: unknown[]) => Promise<CommandResult>
>;
const mockFileManager = FileManager as jest.MockedClass<typeof FileManager>;

// Get the mocked modules using jest.requireMock
const mockedCommandExecutor = jest.requireMock('../utils/commandExecutor') as {
  executeCommand: typeof mockExecuteCommand;
};
mockedCommandExecutor.executeCommand = mockExecuteCommand;

describe('CompilerController', () => {
  let mockRequest: Partial<ExpressRequest>;
  let mockResponse: Partial<ExpressResponse>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<ExpressResponse>;
  });

  describe('compile', () => {
    it('should return 400 when code is missing', async () => {
      mockRequest.body = {};

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code is required and must be a string',
        duration: expect.any(Number),
      });
    });

    it('should return 400 when code is empty string', async () => {
      mockRequest.body = { code: '   ' };

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code cannot be empty',
        duration: expect.any(Number),
      });
    });

    it('should return 400 when code is not a string', async () => {
      mockRequest.body = { code: 123 };

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code is required and must be a string',
        duration: expect.any(Number),
      });
    });

    it('should compile successfully with valid code', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Compilation successful',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Optimization successful',
          stderr: '',
        });

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockFileManager.createProject).toHaveBeenCalledWith({
        code,
        projectName: undefined,
        dependencies: undefined,
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'cargo',
        ['build', '--target', 'wasm32-unknown-unknown', '--release'],
        {
          cwd: mockProject.projectPath,
          timeout: 30000,
        }
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Compilation and optimization successful',
        output: expect.stringContaining('Build Output:'),
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });

    it('should handle compilation failure', async () => {
      const code = 'invalid rust code';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );
      mockExecuteCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Compilation error: expected one of',
      });

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Compilation failed',
        output: '',
        error: 'Compilation error: expected one of',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });

    it('should handle optimization failure gracefully', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Compilation successful',
          stderr: '',
        })
        .mockRejectedValueOnce(new Error('stellar command not found'));

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Compilation successful (optimization failed)',
        output: 'Compilation successful',
        error: 'stellar command not found',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );

      // Create a mock timeout error that will pass the instanceof check
      const timeoutError = Object.create(Error.prototype);
      timeoutError.name = 'CommandTimeoutError';
      timeoutError.message = 'Command exceeded time limit of 30000ms';
      Object.setPrototypeOf(timeoutError, Error.prototype);
      mockExecuteCommand.mockRejectedValue(timeoutError);

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(408);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Compilation timed out',
        error: 'Command exceeded time limit of 30000ms',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });

    it('should handle other errors', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );
      mockExecuteCommand.mockRejectedValue(new Error('Unexpected error'));

      await (
        await import('../controllers/compilerController')
      ).CompilerController.compile(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error during compilation',
        error: 'Unexpected error',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });
  });

  describe('test', () => {
    it('should return 400 when code is missing', async () => {
      mockRequest.body = {};

      await (
        await import('../controllers/compilerController')
      ).CompilerController.test(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code is required and must be a string',
        duration: expect.any(Number),
      });
    });

    it('should return 400 when code is empty string', async () => {
      mockRequest.body = { code: '   ' };

      await (
        await import('../controllers/compilerController')
      ).CompilerController.test(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code cannot be empty',
        duration: expect.any(Number),
      });
    });

    it('should return 400 when code is not a string', async () => {
      mockRequest.body = { code: 123 };

      await (
        await import('../controllers/compilerController')
      ).CompilerController.test(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid request: code is required and must be a string',
        duration: expect.any(Number),
      });
    });

    it('should run tests successfully with valid code', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'test result: ok. 1 passed; 0 failed',
        stderr: '',
      });

      await (
        await import('../controllers/compilerController')
      ).CompilerController.test(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockFileManager.createProject).toHaveBeenCalledWith({
        code,
        projectName: undefined,
        dependencies: undefined,
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith('cargo', ['test'], {
        cwd: mockProject.projectPath,
        timeout: 30000,
      });

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'All tests passed',
        output: 'test result: ok. 1 passed; 0 failed',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });

    it('should handle test failures', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );
      mockExecuteCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'test result: FAILED. 0 passed; 1 failed',
      });

      await (
        await import('../controllers/compilerController')
      ).CompilerController.test(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Tests failed',
        output: '',
        error: 'test result: FAILED. 0 passed; 1 failed',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });

    it('should handle timeout errors during testing', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );

      // Create a mock timeout error that will pass the instanceof check
      const timeoutError = Object.create(Error.prototype);
      timeoutError.name = 'CommandTimeoutError';
      timeoutError.message = 'Command exceeded time limit of 30000ms';
      Object.setPrototypeOf(timeoutError, Error.prototype);
      mockExecuteCommand.mockRejectedValue(timeoutError);

      await (
        await import('../controllers/compilerController')
      ).CompilerController.test(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(408);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Testing timed out',
        error: 'Command exceeded time limit of 30000ms',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });

    it('should handle other errors during testing', async () => {
      const code = 'pub fn hello() -> &str { "Hello, World!" }';
      mockRequest.body = { code };

      const mockProject = {
        projectPath: '/tmp/test-project',
        sourcePath: '/tmp/test-project/src/lib.rs',
        cargoPath: '/tmp/test-project/Cargo.toml',
        cleanup: jest.fn().mockImplementation(() => Promise.resolve()),
      };

      mockFileManager.createProject.mockResolvedValue(
        mockProject as unknown as Awaited<ReturnType<typeof FileManager.createProject>>
      );
      mockExecuteCommand.mockRejectedValue(new Error('Unexpected error'));

      await (
        await import('../controllers/compilerController')
      ).CompilerController.test(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error during testing',
        error: 'Unexpected error',
        duration: expect.any(Number),
      });

      expect(mockProject.cleanup).toHaveBeenCalled();
    });
  });

  describe('health', () => {
    it('should return 200 when all services are healthy', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'cargo 1.70.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'wasm32-unknown-unknown',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'stellar 0.1.0',
          stderr: '',
        });

      await (
        await import('../controllers/compilerController')
      ).CompilerController.health(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
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

    it('should return 503 when some services are unhealthy', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'cargo 1.70.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'x86_64-unknown-linux-gnu',
          stderr: '',
        })
        .mockRejectedValueOnce(new Error('stellar command not found'));

      await (
        await import('../controllers/compilerController')
      ).CompilerController.health(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Service has issues',
        checks: {
          cargo: true,
          rustTarget: false,
          stellar: false,
        },
        timestamp: expect.any(String),
      });
    });

    it('should return 503 when health check fails', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('Health check failed'));

      await (
        await import('../controllers/compilerController')
      ).CompilerController.health(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
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
