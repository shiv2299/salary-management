import { Suspense } from 'react';
import { ChangesPage } from '@/features/insights/changes-page';

export default function Page() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense>
      <ChangesPage />
    </Suspense>
  );
}
