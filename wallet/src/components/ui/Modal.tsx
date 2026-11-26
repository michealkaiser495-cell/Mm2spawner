import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './primitives';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => (dismissible || v ? onOpenChange(v) : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          className={cn(
            'glass-strong fixed z-50 w-full overflow-y-auto shadow-2xl outline-none data-[state=open]:animate-rise',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86vh] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6',
            className,
          )}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-lg font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-mist-400">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
              )}
            </div>
            {dismissible && (
              <Dialog.Close className="-mr-1 -mt-1 rounded-lg p-1.5 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100" aria-label="Close">
                <X className="h-5 w-5" />
              </Dialog.Close>
            )}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
