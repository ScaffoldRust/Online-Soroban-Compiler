import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MonacoEditorModule, MonacoEditorLoaderService } from '@materia-ui/ngx-monaco-editor';
import { of } from 'rxjs';
import { provideZoneChangeDetection } from '@angular/core';

import { EditorComponent } from './editor.component';

describe('EditorComponent', () => {
  let component: EditorComponent;
  let fixture: ComponentFixture<EditorComponent>;
  let mockMonacoLoaderService: jasmine.SpyObj<MonacoEditorLoaderService>;

  beforeEach(async () => {
    // Create mock Monaco loader service
    mockMonacoLoaderService = jasmine.createSpyObj('MonacoEditorLoaderService', [], {
      isMonacoLoaded$: of(true)
    });

    await TestBed.configureTestingModule({
      imports: [EditorComponent, FormsModule, MonacoEditorModule],
      providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        { provide: MonacoEditorLoaderService, useValue: mockMonacoLoaderService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have initial code', () => {
    expect(component.code).toContain('Soroban Smart Contract');
  });

  it('should have vs-dark theme', () => {
    expect(component.editorOptions.theme).toBe('vs-dark');
  });

  it('should have rust language', () => {
    expect(component.editorOptions.language).toBe('rust');
  });

  it('should start with loading state as false', () => {
    expect(component.isLoading).toBe(false);
  });

  it('should set loading state when compile is called', () => {
    component.onCompile();
    expect(component.isLoading).toBe(true);
  });

  it('should set loading state when test is called', () => {
    component.onTest();
    expect(component.isLoading).toBe(true);
  });

  it('should have proper editor options types', () => {
    expect(component.editorOptions.theme).toBe('vs-dark');
    expect(component.editorOptions.language).toBe('rust');
    expect(component.editorOptions.automaticLayout).toBe(true);
    expect(component.editorOptions.readOnly).toBe(false);
  });

  it('should provide getCurrentCode method', () => {
    const currentCode = component.getCurrentCode();
    expect(typeof currentCode).toBe('string');
    expect(currentCode).toContain('Soroban Smart Contract');
  });

  it('should provide setEditorCode method', () => {
    const newCode = 'fn test() {}';
    component.setEditorCode(newCode);
    expect(component.code).toBe(newCode);
  });

  it('should handle editor initialization', () => {
    const mockEditor = {
      getValue: jasmine.createSpy('getValue').and.returnValue('test code'),
      setValue: jasmine.createSpy('setValue'),
      focus: jasmine.createSpy('focus'),
      layout: jasmine.createSpy('layout'),
      dispose: jasmine.createSpy('dispose')
    };

    component.onEditorInit(mockEditor);
    expect(component.editorLoaded).toBe(true);
  });
});
