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
      ambito="programa"
      id={id}
      audienciaInicial={searchParams.get('audiencia') || 'participantes'}
      volverA="/admin/programas"
    />
  );
}

export default function DocumentosProgramaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <Contenido />
    </Suspense>
  );
}
