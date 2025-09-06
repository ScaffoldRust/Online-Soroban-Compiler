import { Component, OnDestroy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonacoEditorModule } from '@materia-ui/ngx-monaco-editor';
import { PLATFORM_ID, inject } from '@angular/core';


const DEFAULT_RUST_CODE = `// Welcome to Soroban Smart Contract Editor
// Write your Rust smart contract code here

#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        vec![&env, symbol_short!("Hello"), to]
    }
}`;

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MonacoEditorModule],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.css'
})
export class EditorComponent implements OnDestroy {
  code: string = DEFAULT_RUST_CODE;
  private timeoutIds = new Set<number>();
  isLoading = false;
  isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  
  // Validation and output properties
  errorMessage: string = '';
  outputMessage: string = '';
  outputType: 'error' | 'success' | 'info' = 'info';
  
  editorOptions = {
    theme: 'vs-dark',
    language: 'rust',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    wordWrap: 'on' as const,
    scrollBeyondLastLine: false,
    lineNumbers: 'on' as const
  };

  ngOnDestroy(): void {
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
  }

  private validateCode(): boolean {
    // Clear previous messages
    this.clearOutput();
    
    // Check if code is empty or only whitespace
    if (!this.code || !this.code.trim()) {
      this.errorMessage = 'Error: Code cannot be empty or contain only whitespace';
      this.outputType = 'error';
      return false;
    }
    
    // Check code length (50KB limit)
    if (this.code.length > 50000) {
      this.errorMessage = 'Error: Code exceeds maximum length (50KB). Please reduce code size.';
      this.outputType = 'error';
      return false;
    }
    
    // Basic Rust syntax check - look for common Rust keywords
    const rustKeywords = ['fn', 'impl', 'pub', 'struct', 'enum', 'mod', 'use', 'let', 'const', 'static'];
    const hasRustKeyword = rustKeywords.some(keyword => this.code.includes(keyword));
    
    if (!hasRustKeyword && this.code.trim().length > 10) {
      this.errorMessage = 'Warning: Code may not be valid Rust. Please ensure you\'re writing Rust code.';
      this.outputType = 'error';
      return false;
    }
    
    // Check for basic contract structure for Soroban
    if (!this.code.includes('contract') && !this.code.includes('soroban')) {
      this.errorMessage = 'Info: Consider using Soroban contract structure for smart contract development.';
      this.outputType = 'info';
      // This is just a warning, still allow compilation
    }
    
    return true;
  }

  clearOutput(): void {
    this.errorMessage = '';
    this.outputMessage = '';
    this.outputType = 'info';
  }

  onCompile(): void {
    if (this.isLoading) {
      return;
    }
    
    // Validate code before proceeding
    if (!this.validateCode()) {
      return;
    }
    
    this.isLoading = true;
    this.outputMessage = 'Compiling Rust smart contract...';
    this.outputType = 'info';
    console.log('Compiling Rust smart contract code:', this.code);
    
    // TODO: Implement API call to backend compiler
    const timeoutId = setTimeout(() => {
      this.isLoading = false;
      this.timeoutIds.delete(timeoutId);
      this.outputMessage = 'Compilation completed successfully!';
      this.outputType = 'success';
      console.log('Compilation complete');
    }, 2000) as unknown as number;
    this.timeoutIds.add(timeoutId);
  }

  onTest(): void {
    if (this.isLoading) {
      return;
    }
    
    // Validate code before proceeding
    if (!this.validateCode()) {
      return;
    }
    
    this.isLoading = true;
    this.outputMessage = 'Running tests for smart contract...';
    this.outputType = 'info';
    console.log('Testing Rust smart contract code:', this.code);
    
    // TODO: Implement API call to backend test runner  
    const timeoutId = setTimeout(() => {
      this.isLoading = false;
      this.timeoutIds.delete(timeoutId);
      this.outputMessage = 'All tests passed successfully!';
      this.outputType = 'success';
      console.log('Testing complete');
    }, 2000) as unknown as number;
    this.timeoutIds.add(timeoutId);
  }
}
