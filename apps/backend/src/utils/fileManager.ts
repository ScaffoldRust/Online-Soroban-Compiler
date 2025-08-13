import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import sanitizeFilename from 'sanitize-filename';

/**
 * Interface for project setup configuration
 */
export interface ProjectConfig {
  /** The Rust source code */
  code: string;
  /** Optional project name (will be sanitized) */
  projectName?: string;
  /** Optional dependencies to add to Cargo.toml */
  dependencies?: Record<string, string>;
}

/**
 * Interface for created project information
 */
export interface ProjectInfo {
  /** Path to the project directory */
  projectPath: string;
  /** Path to the source file (lib.rs) */
  sourcePath: string;
  /** Path to Cargo.toml */
  cargoPath: string;
  /** Cleanup function to remove the project */
  cleanup: () => Promise<void>;
}

/**
 * Default Cargo.toml template for Soroban projects
 */
const DEFAULT_CARGO_TOML = `[package]
name = "soroban-contract"
version = "0.1.0"
edition = "2021"

[lib]
name = "soroban-contract"
path = "src/lib.rs"
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "22.0.0"

[dev_dependencies]
soroban-sdk = { version = "22.0.0", features = ["testutils"] }

[features]
testutils = ["soroban-sdk/testutils"]

[[bin]]
name = "soroban-contract"
path = "src/bin/soroban-contract.rs"

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true

[profile.release-with-logs]
inherits = "release"
debug-assertions = true`;

/**
 * File manager utility for handling temporary Rust projects
 */
export class FileManager {
  private static activeProjects = new Set<string>();

  /**
   * Creates a temporary Rust project with the provided code
   *
   * @param config - Project configuration
   * @returns Promise that resolves to project information
   */
  static async createProject(config: ProjectConfig): Promise<ProjectInfo> {
    const { code, projectName = 'soroban-contract', dependencies = {} } = config;

    // Sanitize the project name
    const safeName = sanitizeFilename(projectName) || 'soroban-contract';

    // Create unique temporary directory with improved randomness
    const timestamp = Date.now();
    const randomId = randomBytes(8).toString('hex');
    const projectDirName = `${safeName}-${timestamp}-${randomId}`;

    const projectPath = join(tmpdir(), projectDirName);
    const sourcePath = join(projectPath, 'src', 'lib.rs');
    const cargoPath = join(projectPath, 'Cargo.toml');

    try {
      // Create project directory structure
      await fs.mkdir(projectPath, { recursive: true });
      await fs.mkdir(join(projectPath, 'src'), { recursive: true });

      // Generate Cargo.toml with any additional dependencies
      let cargoToml = DEFAULT_CARGO_TOML;
      if (Object.keys(dependencies).length > 0) {
        const depsSection = Object.entries(dependencies)
          .map(([name, version]) => `${name} = "${version}"`)
          .join('\n');
        cargoToml = cargoToml.replace('[dependencies]', `[dependencies]\n${depsSection}`);
      }

      // Write Cargo.toml
      await fs.writeFile(cargoPath, cargoToml, 'utf8');

      // Write source code
      await fs.writeFile(sourcePath, code, 'utf8');

      // Track active project
      this.activeProjects.add(projectPath);

      // Create cleanup function
      const cleanup = async () => {
        await this.cleanupProject(projectPath);
      };

      return {
        projectPath,
        sourcePath,
        cargoPath,
        cleanup,
      };
    } catch (error) {
      // Clean up on error
      try {
        await this.cleanupProject(projectPath);
      } catch {
        // Ignore cleanup errors during error handling
      }
      throw error;
    }
  }

  /**
   * Cleans up a temporary project directory
   *
   * @param projectPath - Path to the project directory
   */
  static async cleanupProject(projectPath: string): Promise<void> {
    if (this.activeProjects.has(projectPath)) {
      this.activeProjects.delete(projectPath);
    }

    // Check if directory exists before trying to remove it
    try {
      await fs.access(projectPath);
      await fs.rm(projectPath, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Cleans up all active projects (useful for shutdown)
   */
  static async cleanupAllProjects(): Promise<void> {
    const cleanupPromises = Array.from(this.activeProjects).map((projectPath) =>
      this.cleanupProject(projectPath).catch(() => {
        // Ignore cleanup errors during bulk cleanup
      })
    );

    await Promise.all(cleanupPromises);
    this.activeProjects.clear();
  }

  /**
   * Gets the list of active project paths
   */
  static getActiveProjects(): string[] {
    return Array.from(this.activeProjects);
  }

  /**
   * Reads the contents of a file within a project
   *
   * @param filePath - Path to the file
   * @returns Promise that resolves to file contents
   */
  static async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Writes content to a file within a project
   *
   * @param filePath - Path to the file
   * @param content - Content to write
   */
  static async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${(error as Error).message}`);
    }
  }
}
