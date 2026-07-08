"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronRight,
  LayoutTemplate,
  Loader2,
} from "lucide-react";
import {
  extractVariableIndices,
  applyUrlButtonVariable,
  normalizeUrlVariablePlaceholders,
} from "@/lib/whatsapp/template-validators";
import {
  isMediaHeaderType,
  mediaHeaderFieldLabel,
  mediaHeaderFieldPlaceholder,
  resolveHeaderMediaUrl,
  validateHeaderMediaUrl,
} from "@/lib/whatsapp/template-header-media";

export interface TemplateSendValues {
  body: string[];
  headerText?: string;
  headerMediaUrl?: string;
  headerMediaId?: string;
  thumbnailProductRetailerId?: string;
  productRetailerIds?: string[];
  buttonParams?: Record<number, string>;
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
}

function renderBodyPreview(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    const value = params[idx];
    return value && value.trim().length > 0 ? value : `{{${raw}}}`;
  });
}

interface UrlButtonSlot {
  index: number;
  text: string;
  url: string;
}

/**
 * Templates may need values for: body variables, a text-header
 * variable, and per-URL-button suffixes. Collect them all so the
 * send-message path doesn't 400 on missing parameters.
 */
function collectVariableSlots(template: MessageTemplate): {
  bodyVars: number[];
  headerVarCount: number;
  urlButtonSlots: UrlButtonSlot[];
  mediaHeaderType: "image" | "video" | "document" | null;
  needsCatalogThumbnail: boolean;
} {
  const bodyVars = extractVariableIndices(template.body_text);
  const headerVarCount =
    template.header_type === "text" && template.header_content
      ? extractVariableIndices(template.header_content).length
      : 0;
  const urlButtonSlots: UrlButtonSlot[] = [];
  (template.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url).length > 0) {
      urlButtonSlots.push({ index: i, text: b.text, url: b.url });
    }
  });
  const mediaHeaderType = isMediaHeaderType(template.header_type)
    ? template.header_type
    : null;
  const needsCatalogThumbnail = (template.buttons ?? []).some(
    (button) => button.type === "CATALOG" || button.type === "MPM",
  );
  return {
    bodyVars,
    headerVarCount,
    urlButtonSlots,
    mediaHeaderType,
    needsCatalogThumbnail,
  };
}

function templateNeedsSendForm(template: MessageTemplate): boolean {
  const slots = collectVariableSlots(template);
  return (
    slots.bodyVars.length > 0 ||
    slots.headerVarCount > 0 ||
    slots.urlButtonSlots.length > 0 ||
    slots.mediaHeaderType !== null ||
    slots.needsCatalogThumbnail
  );
}

function isHeaderMediaUrlValid(
  mediaHeaderType: "image" | "video" | "document" | null,
  headerMediaUrl: string,
  headerMediaId: string,
): boolean {
  if (!mediaHeaderType) return true;
  if (headerMediaId.trim()) return true;
  const url = headerMediaUrl.trim();
  if (!url) return false;
  try {
    validateHeaderMediaUrl(url);
    return true;
  } catch {
    return false;
  }
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState<string>("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>("");
  const [headerMediaId, setHeaderMediaId] = useState<string>("");
  const [thumbnailProductRetailerId, setThumbnailProductRetailerId] =
    useState<string>("");
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  const [headerMediaError, setHeaderMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const accountId = profile?.account_id as string | undefined;

      if (!accountId) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("account_id", accountId)
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch templates:", error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function resetSelection() {
    setSelected(null);
    setParams([]);
    setHeaderText("");
    setHeaderMediaUrl("");
    setHeaderMediaId("");
    setThumbnailProductRetailerId("");
    setButtonParams({});
    setHeaderMediaError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    if (!templateNeedsSendForm(template)) {
      onSelect(template, { body: [] });
      handleOpenChange(false);
      return;
    }
    const slots = collectVariableSlots(template);
    setSelected(template);
    setParams(new Array(slots.bodyVars.length).fill(""));
    setHeaderText("");
    setHeaderMediaUrl(
      resolveHeaderMediaUrl(template.header_media_url?.trim() ?? ""),
    );
    setHeaderMediaId("");
    setThumbnailProductRetailerId(template.product_retailer_ids?.[0] ?? "");
    setButtonParams({});
    setHeaderMediaError(null);
  }

  function confirm() {
    if (!selected) return;
    const values: TemplateSendValues = { body: params };
    if (headerText.trim()) values.headerText = headerText.trim();
    const mediaUrl = resolveHeaderMediaUrl(headerMediaUrl.trim());
    const mediaId = headerMediaId.trim();
    if (mediaUrl) values.headerMediaUrl = mediaUrl;
    if (mediaId) values.headerMediaId = mediaId;
    if (thumbnailProductRetailerId.trim()) {
      values.thumbnailProductRetailerId = thumbnailProductRetailerId.trim();
      values.productRetailerIds = [thumbnailProductRetailerId.trim()];
    }
    if (Object.keys(buttonParams).length > 0) {
      values.buttonParams = Object.fromEntries(
        Object.entries(buttonParams).map(([k, v]) => [Number(k), v.trim()]),
      );
    }
    onSelect(selected, values);
    handleOpenChange(false);
  }

  const slots = useMemo(
    () => (selected ? collectVariableSlots(selected) : null),
    [selected],
  );
  const canConfirm =
    !!selected &&
    !!slots &&
    slots.bodyVars.every((_, i) => (params[i] ?? "").trim().length > 0) &&
    (slots.headerVarCount === 0 || headerText.trim().length > 0) &&
    slots.urlButtonSlots.every(
      (s) => (buttonParams[s.index] ?? "").trim().length > 0,
    ) &&
    (!slots.needsCatalogThumbnail ||
      thumbnailProductRetailerId.trim().length > 0) &&
    isHeaderMediaUrlValid(
      slots.mediaHeaderType,
      headerMediaUrl,
      headerMediaId,
    ) &&
    !headerMediaError;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {selected ? selected.name : "Send template"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected
              ? "Fill in the placeholders to render this template. Meta requires every variable to be set."
              : "Pick an approved WhatsApp template to send to this contact."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                <p className="text-sm text-popover-foreground">No approved templates</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Approve a template in Meta WhatsApp Manager, then sync it
                  from Settings → Templates.
                </p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className="w-full rounded-md border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-popover"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-popover-foreground">
                          {t.name}
                        </p>
                        <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                          {t.category}
                        </Badge>
                        {t.language && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {t.language}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {t.body_text}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background/50 p-3">
              <p className="mb-1 text-xs text-muted-foreground">Preview</p>
              <p className="whitespace-pre-wrap text-sm text-popover-foreground">
                {renderBodyPreview(selected.body_text, params)}
              </p>
              {selected.footer_text && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  {selected.footer_text}
                </p>
              )}
            </div>
            {slots && slots.headerVarCount > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`Header {{1}}`}
                </Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Value for the header variable"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
            {slots?.mediaHeaderType && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-popover-foreground">
                    {mediaHeaderFieldLabel(slots.mediaHeaderType)}
                  </Label>
                  <Input
                    value={headerMediaUrl}
                    onChange={(e) => {
                      const value = e.target.value;
                      setHeaderMediaUrl(value);
                      if (!value.trim()) {
                        setHeaderMediaError(null);
                        return;
                      }
                      try {
                        validateHeaderMediaUrl(value);
                        setHeaderMediaError(null);
                      } catch (err) {
                        setHeaderMediaError(
                          err instanceof Error ? err.message : "Invalid URL",
                        );
                      }
                    }}
                    placeholder={mediaHeaderFieldPlaceholder(slots.mediaHeaderType)}
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                  />
                  {headerMediaError ? (
                    <p className="text-[10px] text-red-400">{headerMediaError}</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Public HTTPS URL required. Meta cannot fetch localhost or
                      private links.
                    </p>
                  )}
                </div>
                {slots.mediaHeaderType === "image" && headerMediaUrl.trim() && !headerMediaError && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headerMediaUrl.trim()}
                    alt="Header preview"
                    className="max-h-32 rounded-md border border-border object-contain"
                  />
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Header media ID (optional)
                  </Label>
                  <Input
                    value={headerMediaId}
                    onChange={(e) => setHeaderMediaId(e.target.value)}
                    placeholder="Meta media id from a prior upload"
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            )}
            {slots?.bodyVars.map((v, i) => (
              <div key={v} className="space-y-1">
                <Label className="text-xs text-popover-foreground">{`Body {{${v}}}`}</Label>
                <Input
                  value={params[i] ?? ""}
                  onChange={(e) => {
                    const next = [...params];
                    next[i] = e.target.value;
                    setParams(next);
                  }}
                  placeholder={`Value for {{${v}}}`}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}
            {slots?.needsCatalogThumbnail && (
              <div className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  Catalog thumbnail product retailer ID
                </Label>
                <Input
                  value={thumbnailProductRetailerId}
                  onChange={(e) =>
                    setThumbnailProductRetailerId(e.target.value)
                  }
                  placeholder="A product retailer ID from your Meta catalog"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-[10px] text-muted-foreground">
                  Required by Meta for catalog-style template buttons. Use a
                  valid product retailer ID from Commerce Manager.
                </p>
              </div>
            )}
            {slots?.urlButtonSlots.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {`URL button "${slot.text}" — value for `}{`{{1}}`}
                </Label>
                <Input
                  value={buttonParams[slot.index] ?? ""}
                  onChange={(e) =>
                    setButtonParams((prev) => ({
                      ...prev,
                      [slot.index]: e.target.value,
                    }))
                  }
                  placeholder="Product slug only, e.g. kaira-harmony-ring-for-women-abc123"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-[10px] text-muted-foreground break-all">
                  Final URL:{" "}
                  {applyUrlButtonVariable(
                    slot.url,
                    buttonParams[slot.index] ?? "",
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Enter only the part that replaces {`{{1}}`}, not the full URL.
                  Template base: {normalizeUrlVariablePlaceholders(slot.url)}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                disabled={!canConfirm}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Send template
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
