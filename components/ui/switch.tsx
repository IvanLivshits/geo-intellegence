'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-graphite transition-colors',
      'focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40',
      'data-[state=checked]:bg-stellar-white data-[state=checked]:border-stellar-white data-[state=unchecked]:bg-transparent',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-3.5 w-3.5 rounded-full transition-transform',
        'data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-void-black',
        'data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-ash'
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

export { Switch };
