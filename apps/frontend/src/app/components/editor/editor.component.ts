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

  onCompile(): void {
    if (this.isLoading || !this.code.trim()) {
      return;
    }
    
    this.isLoading = true;
    console.log('Compiling Rust smart contract code:', this.code);
    
    // TODO: Implement API call to backend compiler
    const timeoutId = setTimeout(() => {
      this.isLoading = false;
      this.timeoutIds.delete(timeoutId);
      console.log('Compilation complete');
    }, 2000) as unknown as number;
    this.timeoutIds.add(timeoutId);
  }

  onTest(): void {
    if (this.isLoading || !this.code.trim()) {
      return;
    }
    
    this.isLoading = true;
    console.log('Testing Rust smart contract code:', this.code);
    
    // TODO: Implement API call to backend test runner  
    const timeoutId = setTimeout(() => {
      this.isLoading = false;
      this.timeoutIds.delete(timeoutId);
      console.log('Testing complete');
    }, 2000) as unknown as number;
    this.timeoutIds.add(timeoutId);
  }
}
