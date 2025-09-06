import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

// Define interfaces for type safety
export interface CompileRequest {
  code: string;
}

export interface CompileResponse {
  output: string;
  success?: boolean;
  error?: string;
}

export interface TestResponse {
  output: string;
  success?: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CompilerService {
  private readonly API_BASE_URL = 'http://localhost:3000/api';
  private http = inject(HttpClient);

  /**
   * Compile Rust smart contract code
   */
  compile(code: string): Observable<CompileResponse> {
    const request: CompileRequest = { code };
    
    return this.http.post<CompileResponse>(`${this.API_BASE_URL}/compile`, request)
      .pipe(
        map(response => ({
          ...response,
          success: true
        })),
        catchError(this.handleError)
      );
  }

  /**
   * Test Rust smart contract code
   */
  test(code: string): Observable<TestResponse> {
    const request: CompileRequest = { code };
    
    return this.http.post<TestResponse>(`${this.API_BASE_URL}/test`, request)
      .pipe(
        map(response => ({
          ...response,
          success: true
        })),
        catchError(this.handleError)
      );
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = error.error?.message || 
                    error.error?.output ||
                    `Server Error: ${error.status} - ${error.statusText}`;
    }
    
    console.error('CompilerService Error:', errorMessage);
    return throwError(() => ({
      output: errorMessage,
      success: false,
      error: errorMessage
    }));
  }
}
