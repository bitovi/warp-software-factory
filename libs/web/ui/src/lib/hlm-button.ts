import { Directive } from '@angular/core';
import { BrnButton } from '@spartan-ng/brain/button';

@Directive({
  selector: 'button[hlmBtn], a[hlmBtn]',
  hostDirectives: [{ directive: BrnButton, inputs: ['disabled'] }],
  host: {
    'data-slot': 'button',
    class:
      'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:pointer-events-none data-disabled:opacity-50',
  },
})
export class HlmButton {}
