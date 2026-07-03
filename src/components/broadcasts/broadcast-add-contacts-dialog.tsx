'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Search, UserPlus } from 'lucide-react';

interface BroadcastAddContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingContactIds: string[];
  onContinue: (contactIds: string[]) => void;
}

export function BroadcastAddContactsDialog({
  open,
  onOpenChange,
  existingContactIds,
  onContinue,
}: BroadcastAddContactsDialogProps) {
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);

  const existingSet = useMemo(
    () => new Set(existingContactIds),
    [existingContactIds],
  );

  const fetchContacts = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const supabase = createClient();
      let request = supabase.from('contacts').select('*').order('name');

      const term = query.trim();
      if (term) {
        const pattern = `%${term}%`;
        request = request.or(`name.ilike.${pattern},phone.ilike.${pattern}`);
      }

      const { data, error } = await request.limit(200);
      if (error) throw error;
      setContacts(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    setSearch('');
    setSelectedIds(new Set());
    fetchContacts('');

    async function loadTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }

    loadTags();
  }, [open, fetchContacts]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      fetchContacts(search);
    }, 250);
    return () => clearTimeout(handle);
  }, [search, open, fetchContacts]);

  async function addContactsWithTag(tagId: string) {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: contactTags, error } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .eq('tag_id', tagId);

      if (error) throw error;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const row of contactTags ?? []) {
          if (!existingSet.has(row.contact_id)) {
            next.add(row.contact_id);
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function toggleContact(contactId: string) {
    if (existingSet.has(contactId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  const selectableContacts = contacts.filter((c) => !existingSet.has(c.id));
  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add contacts</DialogTitle>
          <DialogDescription>
            Choose contacts to add to this broadcast. Contacts already in the
            list are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="h-8 border-border bg-card pl-8 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {tags.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Add by tag</p>
              <div className="flex flex-wrap gap-1.5">
                {loadingTags ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => addContactsWithTag(tag.id)}
                      className="inline-flex cursor-pointer items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        borderColor: `${tag.color}40`,
                      }}
                    >
                      + {tag.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <ScrollArea className="h-64 rounded-lg border border-border">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                No contacts match your search.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {contacts.map((contact) => {
                  const alreadyAdded = existingSet.has(contact.id);
                  const checked = alreadyAdded || selectedIds.has(contact.id);
                  return (
                    <li key={contact.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${
                          alreadyAdded
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={alreadyAdded}
                          onCheckedChange={() => toggleContact(contact.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {contact.name || 'Unnamed'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {contact.phone ?? 'No phone'}
                          </p>
                        </div>
                        {alreadyAdded && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            Already added
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          {selectableContacts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedCount} contact{selectedCount === 1 ? '' : 's'} selected
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            disabled={selectedCount === 0}
            onClick={() => onContinue([...selectedIds])}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Continue ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
