'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import DocumentosPanel from '@/components/admin/DocumentosPanel';
import { Skeleton } from '@/components/ui/Skeleton';

function Contenido() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  return (
    <DocumentosPanel
      ambito="evento"
      id={id}
      audienciaInicial={searchParams.get('audiencia') || 'participantes'}
      volverA="/admin/eventos"
    />
  );
}

export default function DocumentosEventoPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <Contenido />
    </Suspense>
  );
}
