import { jest } from '@jest/globals';
import { executeCommand, CommandTimeoutError } from './commandExecutor';
import type { ChildProcess } from 'child_process';

// Mock child_process.spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const mockSpawn = (
  jest.requireMock('child_process') as {
    spawn: jest.MockedFunction<(...args: unknown[]) => unknown>;
  }
).spawn;

describe('CommandExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('executeCommand', () => {
    it('should execute a successful command', async () => {
      const command = 'echo';
      const args = ['Hello, World!'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      // Mock stdout data
      const mockStdoutOn = mockChild.stdout!.on as jest.Mock;
      mockStdoutOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from('Hello, World!\n'));
        }
      });

      // Mock stderr data
      const mockStderrOn = mockChild.stderr!.on as jest.Mock;
      mockStderrOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from(''));
        }
      });

      // Mock close event
      const mockOn = mockChild.on as jest.Mock;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'close') {
          process.nextTick(() => (callback as (code: number) => void)(0));
        }
      });

      const promise = executeCommand(command, args);
      jest.runAllTimers();
      const result = await promise;

      expect(mockSpawn).toHaveBeenCalledWith(command, args, {
        cwd: undefined,
        env: process.env,
      });

      expect(result).toEqual({
        exitCode: 0,
        stdout: 'Hello, World!',
        stderr: '',
      });
    });

    it('should handle command with stderr output', async () => {
      const command = 'cargo';
      const args = ['build'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      // Mock stdout data
      const mockStdoutOn = mockChild.stdout!.on as jest.Mock;
      mockStdoutOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from(''));
        }
      });

      // Mock stderr data
      const mockStderrOn = mockChild.stderr!.on as jest.Mock;
      mockStderrOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from('Compilation error\n'));
        }
      });

      // Mock close event
      const mockOn = mockChild.on as jest.Mock;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'close') {
          process.nextTick(() => (callback as (code: number) => void)(1));
        }
      });

      const promise = executeCommand(command, args);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toEqual({
        exitCode: 1,
        stdout: '',
        stderr: 'Compilation error',
      });
    });

    it('should handle command with both stdout and stderr', async () => {
      const command = 'cargo';
      const args = ['test'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      // Mock stdout data
      const mockStdoutOn = mockChild.stdout!.on as jest.Mock;
      mockStdoutOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from('Test output\n'));
        }
      });

      // Mock stderr data
      const mockStderrOn = mockChild.stderr!.on as jest.Mock;
      mockStderrOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from('Warning message\n'));
        }
      });

      // Mock close event
      const mockOn = mockChild.on as jest.Mock;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'close') {
          process.nextTick(() => (callback as (code: number) => void)(0));
        }
      });

      const promise = executeCommand(command, args);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toEqual({
        exitCode: 0,
        stdout: 'Test output',
        stderr: 'Warning message',
      });
    });

    it('should use custom working directory', async () => {
      const command = 'ls';
      const args = ['-la'];
      const options = { cwd: '/tmp' };

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      // Mock close event
      const mockOn = mockChild.on as jest.Mock;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'close') {
          process.nextTick(() => (callback as (code: number) => void)(0));
        }
      });

      const promise = executeCommand(command, args, options);
      jest.runAllTimers();
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(command, args, {
        cwd: '/tmp',
        env: process.env,
      });
    });

    it('should use custom environment variables', async () => {
      const command = 'env';
      const args: string[] = [];
      const options = { env: { CUSTOM_VAR: 'test' } };

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      // Mock close event
      const mockOn = mockChild.on as jest.Mock;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'close') {
          process.nextTick(() => (callback as (code: number) => void)(0));
        }
      });

      const promise = executeCommand(command, args, options);
      jest.runAllTimers();
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(command, args, {
        cwd: undefined,
        env: {
          ...process.env,
          CUSTOM_VAR: 'test',
        },
      });
    });

    it('should timeout long-running commands', async () => {
      const command = 'sleep';
      const args = ['40'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      const promise = executeCommand(command, args, { timeout: 1000 });

      // Advance timers to trigger timeout
      jest.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow(CommandTimeoutError);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should kill process on timeout', async () => {
      const command = 'sleep';
      const args = ['30'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      const promise = executeCommand(command, args, { timeout: 500 });

      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow(CommandTimeoutError);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle spawn errors', async () => {
      const command = 'nonexistent';
      const args: string[] = [];

      const spawnError = new Error('ENOENT: no such file or directory');
      mockSpawn.mockImplementation(() => {
        throw spawnError;
      });

      await expect(executeCommand(command, args)).rejects.toThrow(spawnError);
    });

    it('should handle null exit code', async () => {
      const command = 'echo';
      const args = ['test'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      // Mock close event with null exit code
      const mockOn = mockChild.on as jest.Mock;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'close') {
          process.nextTick(() => (callback as (code: number | null) => void)(null));
        }
      });

      const promise = executeCommand(command, args);
      jest.runAllTimers();
      const result = await promise;

      expect(result.exitCode).toBe(-1);
    });

    it('should use default timeout of 30 seconds', async () => {
      const command = 'sleep';
      const args = ['35'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      const promise = executeCommand(command, args);

      // Advance timers to trigger default timeout
      jest.advanceTimersByTime(30000);

      await expect(promise).rejects.toThrow(CommandTimeoutError);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should trim stdout and stderr output', async () => {
      const command = 'echo';
      const args = ['output with spaces'];

      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      } as unknown as ChildProcess;

      mockSpawn.mockReturnValue(mockChild);

      // Mock stdout data with extra whitespace
      const mockStdoutOn = mockChild.stdout!.on as jest.Mock;
      mockStdoutOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from('  output with spaces  \n'));
        }
      });

      // Mock stderr data with extra whitespace
      const mockStderrOn = mockChild.stderr!.on as jest.Mock;
      mockStderrOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          (callback as (data: Buffer) => void)(Buffer.from('  error with spaces  \n'));
        }
      });

      // Mock close event
      const mockOn = mockChild.on as jest.Mock;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'close') {
          process.nextTick(() => (callback as (code: number) => void)(0));
        }
      });

      const promise = executeCommand(command, args);
      jest.runAllTimers();
      const result = await promise;

      expect(result.stdout).toBe('output with spaces');
      expect(result.stderr).toBe('error with spaces');
    });
  });
});
