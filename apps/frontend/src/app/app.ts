import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MonacoEditorComponent } from './monaco-editor/monaco-editor.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MonacoEditorComponent, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('frontend');
  protected readonly rustCode = signal(`// Sample Rust smart contract for Stellar
use soroban_sdk::{contract, contractimpl, log, Env, Symbol, symbol_short};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    /// Says hello to someone
    pub fn hello(env: Env, to: Symbol) -> Symbol {
        log!(&env, "Hello {}", to);
        symbol_short!("Hello")
    }
    
    /// Returns a greeting
    pub fn greet(env: Env, name: Symbol) -> Symbol {
        log!(&env, "Greeting {}", name);
        symbol_short!("Greet")
    }
}`);

  onEditorChange(value: string) {
    this.rustCode.set(value);
  }
}
