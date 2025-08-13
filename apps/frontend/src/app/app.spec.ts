import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

// Mock Monaco Editor for tests
(globalThis as unknown as { monaco: unknown }).monaco = {
  editor: {
    create: () => ({
      getValue: () => '',
      setValue: () => {},
      dispose: () => {},
      onDidChangeModelContent: () => {},
      updateOptions: () => {},
      layout: () => {}
    })
  }
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Online Soroban Compiler');
  });
});
