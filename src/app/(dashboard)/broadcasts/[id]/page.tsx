'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast, BroadcastRecipient, RecipientStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Loader2,
  Users,
  Send,
  CheckCheck,
  Eye,
  AlertCircle,
  MessageCircle,
  Filter,
  Download,
  ChevronDown,
  Trash2,
  RotateCcw,
  Search,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getBroadcastStatus,
  getRecipientStatus,
  canResendBroadcast,
  canAddContactsToBroadcast,
} from '@/lib/broadcast-status';
import { useCan } from '@/hooks/use-can';
import { useBroadcastSending } from '@/hooks/use-broadcast-sending';
import { GatedButton } from '@/components/ui/gated-button';
import {
  BroadcastPersonalizeDialog,
  type BroadcastPersonalizePayload,
} from '@/components/broadcasts/broadcast-personalize-dialog';
import { BroadcastAddContactsDialog } from '@/components/broadcasts/broadcast-add-contacts-dialog';

interface StatCardProps {
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, total, icon, color }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

/**
 * Pure-CSS funnel chart: decreasing-width rounded bars.
 * Width is relative to the largest step (typically Sent) so we
 * always render a full bar at the top and proportional tails.
 */
function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Funnel</h3>
      <div className="space-y-2">
        {steps.map((step) => {
          const pctOfMax = Math.max(5, Math.round((step.value / max) * 100));
          const pctOfSent =
            steps[0].value > 0
              ? Math.round((step.value / steps[0].value) * 100)
              : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {step.label}
              </span>
              <div className="relative h-7 flex-1 rounded-full bg-muted">
                <div
                  className={`h-7 rounded-full ${step.color} transition-[width] duration-500`}
                  style={{ width: `${pctOfMax}%` }}
                />
                <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-foreground">
                  {step.value.toLocaleString()}
                  <span className="ml-2 text-muted-foreground/80">
                    ({pctOfSent}%)
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RECIPIENT_STATUSES: readonly RecipientStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
];

/**
 * CSV export helper — RFC 4180 quoting. Quote every field so
 * commas/newlines/quotes round-trip cleanly.
 */
function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

function recipientMatchesSearch(
  recipient: BroadcastRecipient,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const name = (recipient.contact?.name ?? '').toLowerCase();
  const phone = recipient.contact?.phone ?? '';
  const phoneDigits = phone.replace(/\D/g, '');
  const queryDigits = q.replace(/\D/g, '');

  if (name.includes(q)) return true;
  if (phone.toLowerCase().includes(q)) return true;
  if (queryDigits.length >= 3 && phoneDigits.includes(queryDigits)) return true;
  return false;
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const broadcastId = params.id as string;
  const canSend = useCan('send-messages');
  const { resendBroadcast, retryBroadcastRecipient, addContactsToBroadcast, isProcessing } =
    useBroadcastSending();

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'all'>(
    'all',
  );
  const [recipientSearch, setRecipientSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [retryRecipient, setRetryRecipient] =
    useState<BroadcastRecipient | null>(null);
  const [retryingRecipientId, setRetryingRecipientId] = useState<string | null>(
    null,
  );
  const [addContactsOpen, setAddContactsOpen] = useState(false);
  const [pendingContactIds, setPendingContactIds] = useState<string[]>([]);
  const [addPersonalizeOpen, setAddPersonalizeOpen] = useState(false);
  const [addingContacts, setAddingContacts] = useState(false);

  async function loadBroadcastData() {
    const supabase = createClient();

    const { data: bc, error: bcError } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .single();

    if (bcError) throw bcError;

    const { data: recs, error: recsError } = await supabase
      .from('broadcast_recipients')
      .select('*, contact:contacts(*)')
      .eq('broadcast_id', broadcastId)
      .order('created_at', { ascending: false });

    if (recsError) throw recsError;

    setBroadcast(bc);
    setRecipients(recs ?? []);
  }

  useEffect(() => {
    async function fetchData() {
      try {
        await loadBroadcastData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load broadcast');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [broadcastId]);

  const filteredRecipients = useMemo(() => {
    let list = recipients;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (recipientSearch.trim()) {
      list = list.filter((r) => recipientMatchesSearch(r, recipientSearch));
    }
    return list;
  }, [recipients, statusFilter, recipientSearch]);

  const hasRecipientFilters =
    statusFilter !== 'all' || recipientSearch.trim().length > 0;

  function handleExport() {
    if (!broadcast) return;
    const header = [
      'Contact',
      'Phone',
      'Status',
      'Sent At',
      'Delivered At',
      'Read At',
      'Replied At',
      'Error',
    ];
    const rows = recipients.map((r) => [
      r.contact?.name ?? '',
      r.contact?.phone ?? '',
      r.status,
      r.sent_at ?? '',
      r.delivered_at ?? '',
      r.read_at ?? '',
      r.replied_at ?? '',
      r.error_message ?? '',
    ]);
    const csv = toCsv([header, ...rows]);
    const safeName = broadcast.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    downloadBlob(`broadcast-${safeName}-${broadcastId.slice(0, 8)}.csv`, csv);
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    // broadcast_recipients cascades on broadcasts.id (migration 001), so a
    // single delete is sufficient — the aggregate trigger in migration 003
    // is defined on broadcast_recipients but fires only on its own row
    // changes, not on a cascaded drop of the parent row.
    const { error: delErr } = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', broadcastId);
    setDeleting(false);
    if (delErr) {
      toast.error(`Failed to delete: ${delErr.message}`);
      return;
    }
    toast.success('Broadcast deleted');
    router.push('/broadcasts');
  }

  async function handleResend(payload: BroadcastPersonalizePayload) {
    setResending(true);
    try {
      const newId = await resendBroadcast(broadcastId, payload);
      toast.success('Broadcast sent again');
      setResendOpen(false);
      router.push(`/broadcasts/${newId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send again');
    } finally {
      setResending(false);
    }
  }

  async function handleRetryRecipient(payload: BroadcastPersonalizePayload) {
    if (!retryRecipient) return;
    setRetryingRecipientId(retryRecipient.id);
    try {
      await retryBroadcastRecipient(broadcastId, retryRecipient.id, payload);
      toast.success(
        `Message sent again to ${retryRecipient.contact?.name ?? retryRecipient.contact?.phone ?? 'contact'}`,
      );
      setRetryRecipient(null);
      await loadBroadcastData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
      await loadBroadcastData();
    } finally {
      setRetryingRecipientId(null);
    }
  }

  function handleAddContactsSelected(contactIds: string[]) {
    setPendingContactIds(contactIds);
    setAddContactsOpen(false);
    setAddPersonalizeOpen(true);
  }

  async function handleAddContactsConfirm(payload: BroadcastPersonalizePayload) {
    if (pendingContactIds.length === 0) return;
    setAddingContacts(true);
    try {
      const result = await addContactsToBroadcast(
        broadcastId,
        pendingContactIds,
        payload,
      );
      toast.success(
        `Added ${result.added} contact${result.added === 1 ? '' : 's'}${
          result.skipped > 0 ? ` (${result.skipped} already in broadcast)` : ''
        }`,
      );
      setAddPersonalizeOpen(false);
      setPendingContactIds([]);
      await loadBroadcastData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add contacts');
      await loadBroadcastData();
    } finally {
      setAddingContacts(false);
    }
  }

  const existingContactIds = useMemo(
    () =>
      recipients
        .map((r) => r.contact_id)
        .filter((id): id is string => Boolean(id)),
    [recipients],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error ?? 'Broadcast not found'}</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          Back to Broadcasts
        </Button>
      </div>
    );
  }

  const status = getBroadcastStatus(broadcast.status);

  const funnelSteps: FunnelStep[] = [
    { label: 'Sent', value: broadcast.sent_count, color: 'bg-primary' },
    { label: 'Delivered', value: broadcast.delivered_count, color: 'bg-teal-500' },
    { label: 'Read', value: broadcast.read_count, color: 'bg-blue-500' },
    { label: 'Replied', value: broadcast.replied_count, color: 'bg-indigo-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            className="border-border"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{broadcast.name}</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
              >
                {status.label}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              <span>Template: {broadcast.template_name}</span>
              <span>-</span>
              <span>
                Created {new Date(broadcast.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Delete — inline-confirm pattern matches the pipeline-settings
            "Delete Pipeline" flow. Mid-send broadcasts can't be deleted
            because orphaning in-flight Meta messages would leave the
            funnel inconsistent. */}
        <div className="flex items-center gap-2">
          {canAddContactsToBroadcast(broadcast.status) && (
            <GatedButton
              canAct={canSend}
              gateReason="add contacts to broadcasts"
              variant="outline"
              size="sm"
              disabled={isProcessing || addingContacts || broadcast.status === 'sending'}
              onClick={() => setAddContactsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {addingContacts ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Add contacts
            </GatedButton>
          )}

          {canResendBroadcast(broadcast.status) && (
            <GatedButton
              canAct={canSend}
              gateReason="send broadcasts"
              variant="outline"
              size="sm"
              disabled={isProcessing || resending || broadcast.status === 'sending'}
              onClick={() => setResendOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {resending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Send again
            </GatedButton>
          )}

          {confirmDelete ? (
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm">
            <span className="text-red-300">Delete this broadcast?</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="h-7 border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-7 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Confirm'}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={broadcast.status === 'sending'}
            onClick={() => setConfirmDelete(true)}
            title={
              broadcast.status === 'sending'
                ? 'Cannot delete while a broadcast is actively sending'
                : 'Delete this broadcast'
            }
            className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
        </div>
      </div>

      {/* Stats — 6 cards: Total / Sent / Delivered / Read / Replied / Failed */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Recipients"
          value={broadcast.total_recipients}
          total={broadcast.total_recipients}
          icon={<Users className="h-4 w-4" />}
          color="bg-muted text-muted-foreground"
        />
        <StatCard
          label="Sent"
          value={broadcast.sent_count}
          total={broadcast.total_recipients}
          icon={<Send className="h-4 w-4" />}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label="Delivered"
          value={broadcast.delivered_count}
          total={broadcast.total_recipients}
          icon={<CheckCheck className="h-4 w-4" />}
          color="bg-teal-500/10 text-teal-400"
        />
        <StatCard
          label="Read"
          value={broadcast.read_count}
          total={broadcast.total_recipients}
          icon={<Eye className="h-4 w-4" />}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label="Replied"
          value={broadcast.replied_count}
          total={broadcast.total_recipients}
          icon={<MessageCircle className="h-4 w-4" />}
          color="bg-indigo-500/10 text-indigo-400"
        />
        <StatCard
          label="Failed"
          value={broadcast.failed_count}
          total={broadcast.total_recipients}
          icon={<AlertCircle className="h-4 w-4" />}
          color="bg-red-500/10 text-red-400"
        />
      </div>

      <FunnelChart steps={funnelSteps} />

      {/* Recipients Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">
            Recipients ({filteredRecipients.length}
            {hasRecipientFilters ? ` of ${recipients.length}` : ''})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-[200px] max-w-xs sm:w-56">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Search name or phone..."
                className="h-8 border-border bg-card pl-8 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-muted-foreground hover:bg-muted"
                  />
                }
              >
                <Filter className="h-3.5 w-3.5" />
                {statusFilter === 'all'
                  ? 'All statuses'
                  : getRecipientStatus(statusFilter).label}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-border bg-popover">
                <DropdownMenuItem
                  onClick={() => setStatusFilter('all')}
                  className={
                    statusFilter === 'all' ? 'text-primary' : 'text-popover-foreground'
                  }
                >
                  All statuses
                </DropdownMenuItem>
                {RECIPIENT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      statusFilter === s
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    }
                  >
                    {getRecipientStatus(s).label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={recipients.length === 0}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {recipients.length === 0
                ? 'No recipients found.'
                : recipientSearch.trim()
                  ? 'No recipients match your search.'
                  : 'No recipients match this filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Contact</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Sent</TableHead>
                  <TableHead className="text-muted-foreground">Delivered</TableHead>
                  <TableHead className="text-muted-foreground">Read</TableHead>
                  <TableHead className="text-muted-foreground">Error</TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipients.map((recipient) => {
                  const rStatus = getRecipientStatus(recipient.status);
                  const isRetrying = retryingRecipientId === recipient.id;
                  return (
                    <TableRow key={recipient.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {recipient.contact?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.contact?.phone ?? '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${rStatus.classes}`}
                        >
                          {rStatus.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.sent_at
                          ? new Date(recipient.sent_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.delivered_at
                          ? new Date(recipient.delivered_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.read_at
                          ? new Date(recipient.read_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-red-400">
                        {recipient.error_message ?? '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {recipient.status === 'failed' && (
                          <GatedButton
                            canAct={canSend}
                            gateReason="retry failed broadcasts"
                            variant="outline"
                            size="sm"
                            disabled={
                              isProcessing ||
                              isRetrying ||
                              broadcast.status === 'sending'
                            }
                            onClick={() => setRetryRecipient(recipient)}
                            className="border-border text-muted-foreground hover:bg-muted"
                          >
                            {isRetrying ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Try again
                          </GatedButton>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <BroadcastPersonalizeDialog
        open={resendOpen}
        onOpenChange={setResendOpen}
        broadcast={broadcast}
        title={`Send again — ${broadcast.name}`}
        description="Review and update template placeholders before sending to the same audience."
        confirmLabel="Send again"
        submitting={resending}
        onConfirm={handleResend}
      />

      <BroadcastPersonalizeDialog
        open={retryRecipient !== null}
        onOpenChange={(open) => {
          if (!open) setRetryRecipient(null);
        }}
        broadcast={broadcast}
        title={
          retryRecipient
            ? `Try again — ${retryRecipient.contact?.name ?? retryRecipient.contact?.phone ?? 'contact'}`
            : 'Try again'
        }
        description="Update today's prices or other placeholder values, then resend to this contact only."
        confirmLabel="Try again"
        submitting={retryingRecipientId !== null}
        onConfirm={handleRetryRecipient}
      />

      <BroadcastAddContactsDialog
        open={addContactsOpen}
        onOpenChange={setAddContactsOpen}
        existingContactIds={existingContactIds}
        onContinue={handleAddContactsSelected}
      />

      <BroadcastPersonalizeDialog
        open={addPersonalizeOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddPersonalizeOpen(false);
            setPendingContactIds([]);
          }
        }}
        broadcast={broadcast}
        title={`Add contacts — ${broadcast.name}`}
        description="Review and update template placeholders before sending to the new contacts."
        confirmLabel={`Send to ${pendingContactIds.length} contact${pendingContactIds.length === 1 ? '' : 's'}`}
        submitting={addingContacts}
        onConfirm={handleAddContactsConfirm}
      />
    </div>
  );
}
