import { Component, Input, forwardRef, OnInit, OnDestroy, ViewEncapsulation, signal, effect, ViewChild, ElementRef, inject, PLATFORM_ID } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { isPlatformBrowser } from '@angular/common';

interface MonacoEditor {
  getValue(): string;
  setValue(value: string): void;
  dispose(): void;
  onDidChangeModelContent(callback: () => void): void;
  updateOptions(options: MonacoEditorOptions): void;
  layout(): void;
}

interface MonacoEditorOptions {
  value?: string;
  language?: string;
  theme?: string;
  minimap?: { enabled: boolean };
  automaticLayout?: boolean;
  scrollBeyondLastLine?: boolean;
  fontSize?: number;
  wordWrap?: string;
  lineNumbers?: string;
  glyphMargin?: boolean;
  folding?: boolean;
  lineDecorationsWidth?: number;
  lineNumbersMinChars?: number;
  renderLineHighlight?: string;
  contextmenu?: boolean;
  mouseWheelZoom?: boolean;
  readOnly?: boolean;
}

interface WindowRequire {
  config(config: { paths: { vs: string } }): void;
  (modules: string[], callback: () => void): void;
}

declare const monaco: {
  editor: {
    create(element: HTMLElement, options: MonacoEditorOptions): MonacoEditor;
  };
};

declare global {
  interface Window {
    require: WindowRequire;
  }
}

@Component({
  selector: 'app-monaco-editor',
  template: `<div #editorContainer style="height: 100%;"></div>`,
  styleUrls: [],
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MonacoEditorComponent),
      multi: true
    }
  ],
  imports: [FormsModule],
  standalone: true
})
export class MonacoEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
  @Input() language = 'rust';
  @Input() theme = 'vs-dark';
  @Input() height = '500px';
  @Input() options: MonacoEditorOptions = {};

  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef<HTMLDivElement>;

  private editor: MonacoEditor | null = null;
  private currentValue = signal('');
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onChange = (_value: string) => { /* no-op */ };
  private onTouched = () => {};
  
  private platformId = inject(PLATFORM_ID);

  constructor() {
    effect(() => {
      if (this.editor && this.currentValue() !== this.editor.getValue()) {
        this.editor.setValue(this.currentValue());
      }
    });
  }

  ngOnInit() {
    this.loadMonacoEditor();
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.dispose();
    }
  }

  private loadMonacoEditor() {
    // Only load Monaco Editor in the browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Load Monaco Editor
    if (typeof monaco === 'undefined') {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/assets/monaco-editor/min/vs/loader.js';
      script.onload = () => {
        window.require.config({
          paths: { vs: '/assets/monaco-editor/min/vs' }
        });
        window.require(['vs/editor/editor.main'], () => {
          this.initEditor();
        });
      };
      script.onerror = () => {
        this.loadFromCDN();
      };
      document.getElementsByTagName('head')[0].appendChild(script);
    } else {
      this.initEditor();
    }
  }

  private loadFromCDN() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/monaco-editor@latest/min/vs/loader.js';
    script.onload = () => {
      window.require.config({
        paths: { vs: 'https://unpkg.com/monaco-editor@latest/min/vs' }
      });
      window.require(['vs/editor/editor.main'], () => {
        this.initEditor();
      });
    };
    document.head.appendChild(script);
  }

  private initEditor() {
    const editorElement = this.editorContainer.nativeElement;
    if (!editorElement) {
      setTimeout(() => this.initEditor(), 100);
      return;
    }

    const defaultOptions: MonacoEditorOptions = {
      value: this.currentValue(),
      language: this.language,
      theme: this.theme,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      fontSize: 14,
      wordWrap: 'on',
      lineNumbers: 'on',
      glyphMargin: false,
      folding: true,
      lineDecorationsWidth: 20,
      lineNumbersMinChars: 3,
      renderLineHighlight: 'line',
      contextmenu: true,
      mouseWheelZoom: true,
      ...this.options
    };

    this.editor = monaco.editor.create(editorElement, defaultOptions);

    // Set up change listener
    this.editor.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || '';
      this.currentValue.set(value);
      this.onChange(value);
      this.onTouched();
    });

    // Set height
    editorElement.style.height = this.height;
    this.editor.layout();
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.currentValue.set(value || '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (this.editor) {
      this.editor.updateOptions({ readOnly: isDisabled });
    }
  }
}