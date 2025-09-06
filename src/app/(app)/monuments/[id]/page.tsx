import SharedLayoutBridge from '@/app/components/transition/SharedLayoutBridge';
import { MonumentHeader } from './MonumentHeader';
import { MonumentGoals } from './MonumentGoals';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MonumentPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <SharedLayoutBridge>
      <MonumentHeader id={id} />
      <MonumentGoals id={id} />
    </SharedLayoutBridge>
  );
}

