import { spawn, type SpawnOptionsWithoutStdio, type ChildProcess } from 'child_process';

export interface ExecuteOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface CommandResult {
  /** Exit code of the command */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

export class CommandTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Command exceeded time limit of ${timeout}ms`);
    this.name = 'CommandTimeoutError';
  }
}

/**
 * Executes a shell command with timeout and proper output capture
 * @param command The command to execute
 * @param args Command arguments
 * @param options Execution options
 * @returns Promise that resolves with command result
 * @throws CommandTimeoutError if command exceeds timeout
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: ExecuteOptions = {}
): Promise<CommandResult> {
  const { cwd, env, timeout = 30000 } = options;

  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    };

    const child: ChildProcess = spawn(command, args, spawnOptions);
    let stdout = '';
    let stderr = '';
    const timeoutId: NodeJS.Timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new CommandTimeoutError(timeout));
    }, timeout);

    // Capture stdout
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    // Capture stderr
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    // Handle process completion
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    // Handle spawn errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}
