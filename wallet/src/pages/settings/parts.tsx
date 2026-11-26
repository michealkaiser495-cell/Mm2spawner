import type { ReactNode } from 'react';
import { Card, cn } from '@/components/ui/primitives';

export function SettingRow({ title, desc, children, className }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-4', className)}>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {desc && <p className="mt-0.5 text-sm text-mist-400">{desc}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export function SettingsCard({ title, children, desc }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-mist-400">{desc}</p>}
      <div className="mt-2 divide-y divide-white/[0.05]">{children}</div>
    </Card>
  );
}

