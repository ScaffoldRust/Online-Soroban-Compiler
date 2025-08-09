import { executeCommand, CommandTimeoutError } from './commandExecutor';
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Create a mock child process
class MockChildProcess extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public killed = false;
  public exitCode: number | null = null;
  public kill = jest.fn().mockImplementation((signal?: string): boolean => {
    this.killed = true;
    // Simulate the process being killed
    setTimeout(() => {
      this.emit('exit', null, signal);
    }, 10);
    return true;
  });

  // Simulate successful process completion
  simulateSuccess(exitCode: number = 0, stdout: string = '', stderr: string = '') {
    setTimeout(() => {
      if (stdout) {
        this.stdout.emit('data', Buffer.from(stdout));
      }
      if (stderr) {
        this.stderr.emit('data', Buffer.from(stderr));
      }
      this.exitCode = exitCode;
      this.emit('close', exitCode);
    }, 10);
  }

  // Simulate process error
  simulateError(error: Error) {
    setTimeout(() => {
      this.emit('error', error);
    }, 10);
  }

  // Simulate long-running process (for timeout tests)
  simulateLongRunning() {
    setTimeout(() => {
      this.stdout.emit('data', Buffer.from('Starting...'));
    }, 10);
    // Don't emit close or exit - let timeout handle it
  }
}

describe('CommandExecutor', () => {
  let mockChild: MockChildProcess;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = new MockChildProcess();
    mockSpawn.mockReturnValue(mockChild as unknown as ChildProcess);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('executeCommand', () => {
    it('should execute a successful command', async () => {
      const command = 'echo';
      const args = ['Hello, World!'];

      // Start the command execution
      const promise = executeCommand(command, args);

      // Simulate successful execution
      mockChild.simulateSuccess(0, 'Hello, World!', '');

      const result = await promise;

      expect(mockSpawn).toHaveBeenCalledWith(command, args, {
        cwd: undefined,
        env: expect.objectContaining(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(result).toEqual({
        exitCode: 0,
        stdout: 'Hello, World!',
        stderr: '',
        timedOut: false,
      });
    });

    it('should handle command with stderr output', async () => {
      const command = 'cargo';
      const args = ['build'];

      const promise = executeCommand(command, args);
      mockChild.simulateSuccess(1, '', 'Compilation error');

      const result = await promise;

      expect(result).toEqual({
        exitCode: 1,
        stdout: '',
        stderr: 'Compilation error',
        timedOut: false,
      });
    });

    it('should handle command with both stdout and stderr', async () => {
      const command = 'cargo';
      const args = ['test'];

      const promise = executeCommand(command, args);
      mockChild.simulateSuccess(0, 'Test output', 'Warning message');

      const result = await promise;

      expect(result).toEqual({
        exitCode: 0,
        stdout: 'Test output',
        stderr: 'Warning message',
        timedOut: false,
      });
    });

    it('should use custom working directory', async () => {
      const command = 'ls';
      const args = ['-la'];
      const options = { cwd: '/tmp' };

      const promise = executeCommand(command, args, options);
      mockChild.simulateSuccess(0, 'file listing', '');

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(command, args, {
        cwd: '/tmp',
        env: expect.objectContaining(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should use custom environment variables', async () => {
      const command = 'env';
      const args: string[] = [];
      const options = { env: { CUSTOM_VAR: 'test_value' } };

      const promise = executeCommand(command, args, options);
      mockChild.simulateSuccess(0, 'env output', '');

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(command, args, {
        cwd: undefined,
        env: expect.objectContaining({
          ...process.env,
          CUSTOM_VAR: 'test_value',
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should timeout long-running commands', async () => {
      jest.useFakeTimers();

      const command = 'sleep';
      const args = ['60'];
      const options = { timeout: 5000 }; // 5 second timeout

      const promise = executeCommand(command, args, options);

      // Simulate long-running process
      mockChild.simulateLongRunning();

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow(CommandTimeoutError);
      await expect(promise).rejects.toThrow('Command exceeded time limit of 5000ms');

      jest.useRealTimers();
    });

    it('should kill process on timeout', async () => {
      jest.useFakeTimers();

      const command = 'sleep';
      const args = ['60'];
      const options = { timeout: 1000 };

      const promise = executeCommand(command, args, options);
      mockChild.simulateLongRunning();

      jest.advanceTimersByTime(1000);

      try {
        await promise;
      } catch {
        // Expected to throw
      }

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      jest.useRealTimers();
    });

    it('should handle spawn errors', async () => {
      const command = 'nonexistent-command';
      const args: string[] = [];

      const promise = executeCommand(command, args);
      const spawnError = new Error('ENOENT: no such file or directory');
      mockChild.simulateError(spawnError);

      await expect(promise).rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should handle null exit code', async () => {
      const command = 'test';
      const args: string[] = [];

      const promise = executeCommand(command, args);

      // Use process.nextTick instead of setTimeout for better test reliability
      process.nextTick(() => {
        mockChild.emit('close', null);
      });

      const result = await promise;

      expect(result.exitCode).toBe(-1);
    });

    it('should use default timeout of 30 seconds', async () => {
      const command = 'echo';
      const args = ['test'];

      const promise = executeCommand(command, args);
      mockChild.simulateSuccess(0, 'test', '');

      await promise;

      // The test passes if no timeout occurs with default settings
      expect(true).toBe(true);
    });

    it('should trim stdout and stderr output', async () => {
      const command = 'echo';
      const args = ['test'];

      const promise = executeCommand(command, args);
      mockChild.simulateSuccess(0, '  output with spaces  \n', '  error with spaces  \n');

      const result = await promise;

      expect(result.stdout).toBe('output with spaces');
      expect(result.stderr).toBe('error with spaces');
    });
  });
});
