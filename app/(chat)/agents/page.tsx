// Agents Dashboard Page
// Accessible at /agents

import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import { AgentDashboard } from '@/components/agent-dashboard';

export default async function AgentsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <AgentDashboard />
    </div>
  );
}