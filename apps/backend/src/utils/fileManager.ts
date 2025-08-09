import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import sanitizeFilename from 'sanitize-filename';

/**
 * Configuration interface for project setup
 */
export interface ProjectSetup {
  /** Absolute path to the temporary directory */
  tempDir: string;
  /** Function to clean up the temporary directory */
  cleanup: () => Promise<void>;
}

/**
 * Options for project setup
 */
export interface ProjectSetupOptions {
  /** Base name for the project directory (will be sanitized) */
  baseName?: string;
  /** Custom temporary directory root (defaults to OS temp dir) */
  tempRoot?: string;
  /** Custom Rust code for the contract */
  rustCode?: string;
}

/**
 * Default Rust contract template
 * This is a simple Soroban contract that greets a user by name.
 * It can be customized by passing a different `rustCode` in the options.
 */
const DEFAULT_RUST_CODE = `#![no_std]
use soroban_sdk::{contractimpl, Env};

pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn hello(env: Env, name: String) -> String {
        format!("Hello, {}!", name)
    }
}`;

/**
 * Default Cargo.toml template for Soroban contracts
 */
const DEFAULT_CARGO_TOML = `[package]
name = "temp-contract"
version = "0.1.0"
edition = "2021"

[lib]
name = "temp_project"
path = "src/lib.rs"
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "21.2.0"

[dev-dependencies]
soroban-sdk = { version = "21.2.0", features = ["testutils"] }

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
debug-assertions = true
`;

/**
 * Sanitizes a directory name to prevent path traversal and ensure cross-platform compatibility
 */
export function getSanitizedDirName(baseName: string): string {
  if (!baseName || typeof baseName !== 'string') {
    return '';
  }

  const trimmed = baseName.trim();
  if (!trimmed) {
    return '';
  }

  let sanitized = sanitizeFilename(trimmed, { replacement: '_' });
  sanitized = sanitized.replace(/\.\./g, '').replace(/^[._]+/, '');

  if (sanitized.length > 50) {
    sanitized = sanitized.substring(0, 50);
  }

  return sanitized || 'project';
}

/**
 * Creates a unique, sanitized temporary directory for Rust project compilation
 */
export async function setupProject(options: ProjectSetupOptions = {}): Promise<ProjectSetup> {
  const { baseName = 'project', tempRoot = tmpdir(), rustCode = DEFAULT_RUST_CODE } = options;

  // Create a unique identifier to prevent collisions
  const timestamp = Date.now();
  const randomId = randomBytes(8).toString('hex');

  // Sanitize the base name
  const sanitizedBase = getSanitizedDirName(baseName);
  const finalBaseName = sanitizedBase || 'project';
  const dirName = `${finalBaseName}_${timestamp}_${randomId}`;
  const tempDir = join(tempRoot, dirName);

  try {
    // Create the temporary directory
    await fs.mkdir(tempDir, { recursive: true });

    // Verify the directory was created and is accessible
    const stats = await fs.stat(tempDir);
    if (!stats.isDirectory()) {
      throw new Error(`Created path is not a directory: ${tempDir}`);
    }

    // Create the Rust project structure
    await createRustProject(tempDir, rustCode);

    return {
      tempDir,
      cleanup: () => cleanupProject(tempDir),
    };
  } catch (error) {
    throw new Error(
      `Failed to create temporary directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Safely removes a temporary project directory and all its contents
 */
export async function cleanupProject(tempDir: string): Promise<void> {
  if (!tempDir || typeof tempDir !== 'string') {
    throw new Error('Invalid tempDir provided for cleanup');
  }

  // Basic safety check: ensure we're only cleaning temp directories
  const systemTempDir = tmpdir();
  if (!tempDir.startsWith(systemTempDir)) {
    throw new Error(`Refusing to clean directory outside temp folder: ${tempDir}`);
  }

  try {
    // Check if directory exists before attempting to remove
    const stats = await fs.stat(tempDir).catch(() => null);
    if (!stats) {
      return;
    }

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${tempDir}`);
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    throw new Error(
      `Failed to cleanup directory ${tempDir}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Creates a basic Rust project structure with Cargo.toml and lib.rs
 */
export async function createRustProject(tempDir: string, rustCode: string): Promise<void> {
  if (!tempDir || typeof tempDir !== 'string') {
    throw new Error('Invalid tempDir provided');
  }

  if (!rustCode || typeof rustCode !== 'string') {
    throw new Error('Invalid rustCode provided');
  }

  try {
    // Create Cargo.toml for Soroban contract

    // Create src directory
    const srcDir = join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // Write Cargo.toml
    await fs.writeFile(join(tempDir, 'Cargo.toml'), DEFAULT_CARGO_TOML, 'utf8');

    // Write lib.rs
    await fs.writeFile(join(srcDir, 'lib.rs'), rustCode, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to create Rust project structure: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
