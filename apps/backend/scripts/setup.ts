import { setupProject } from '../src/utils/fileManager';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';

async function main() {
  try {
    // Test with custom options
    const project = await setupProject({
      baseName: 'my-advanced-contract',
      rustCode: `#![no_std]
use soroban_sdk::{contractimpl, Env, log};

pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn sum(env: Env, a: i32, b: i32) -> i32 {
        log!(&env, "Adding {} and {}", a, b);
        a + b
    }
    
    pub fn multiply(env: Env, a: i32, b: i32) -> i32 {
        a * b
    }
}`
    });

    console.log('Advanced project created at:', project.tempDir);
    
    // Verify files were created
    const libRsPath = join(project.tempDir, 'src', 'lib.rs');
    const cargoTomlPath = join(project.tempDir, 'Cargo.toml');
    
    console.log('\nFiles created:');
    console.log('-', libRsPath);
    console.log('-', cargoTomlPath);
    
    console.log('\nlib.rs content:');
    console.log(await fs.readFile(libRsPath, 'utf8'));
    
    console.log('\nProject will be automatically cleaned up in 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Cleanup will happen automatically when the cleanup function is called
    await project.cleanup();
    console.log('\nCleanup completed successfully');
  } catch (error) {
    console.error('Advanced setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

await main();