import { TestBed } from '@angular/core/testing';

import { Compiler } from './compiler';

describe('Compiler', () => {
  let service: Compiler;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Compiler);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
