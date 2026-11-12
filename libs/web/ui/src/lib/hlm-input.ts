import { Directive } from '@angular/core';

@Directive({
  selector: 'input[hlmInput]',
  host: {
    class:
      'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-invalid:border-destructive',
  },
})
export class HlmInput {}
