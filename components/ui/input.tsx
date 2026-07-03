import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'w-full rounded-input border border-graphite bg-void-black px-4 py-[18px] text-body text-stellar-white placeholder:text-ash',
          'transition-colors focus-visible:outline-none focus-visible:border-signal-blue focus-visible:shadow-focus',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
