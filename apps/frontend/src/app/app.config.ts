import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, NgZone } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MONACO_PATH, MonacoEditorLoaderService } from '@materia-ui/ngx-monaco-editor';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes), 
    provideClientHydration(withEventReplay()),
    {
      provide: MONACO_PATH,
      useValue: 'https://unpkg.com/monaco-editor@0.31.1/min/vs'
    },
    {
      provide: MonacoEditorLoaderService,
      useFactory: (ngZone: NgZone) => {
        return new MonacoEditorLoaderService(ngZone, 'https://unpkg.com/monaco-editor@0.31.1/min/vs');
      },
      deps: [NgZone]
    }
  ]
};
