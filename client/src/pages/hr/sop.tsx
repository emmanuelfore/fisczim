import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Archive,
  ClipboardCheck,
  CopyPlus,
  Eye,
  FileSignature,
  FileText,
  History,
  ListChecks,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/api";
import { useBranchContext } from "@/lib/branch-context";
import { cn } from "@/lib/utils";

import { HRLayout } from "./layout";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/**
 * Standard operating procedures that named people read and sign.
 *
 * The unit of proof is the (version, person) pair, so this screen is built
 * around two questions an auditor asks: what is the current text, and who has
 * signed it. Every write goes through the server's refusals — a published
 * version is immutable, a publish needs a body, readers and (for an exam)
 * questions — and those refusal messages are shown verbatim because they are
 * the design, not an error to hide.
 */

// ---------------------------------------------------------------------------
// Shapes returned by /api/companies/:id/payroll/sop
// ---------------------------------------------------------------------------

type SopStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED" | "ARCHIVED";

/** The reader's own receipt, when they have already signed this version. */
type Acknowledgement = {
  acknowledgedAt: string | null;
  signatureName: string | null;
  examScore: number | string | null;
  examPassed: boolean | null;
};

type SopListRow = {
  id: number;
  code: string;
  title: string;
  category: string;
  version: number;
  status: SopStatus;
  effectiveDate: string | null;
  requiresExam: boolean;
  acknowledgementDays: number;
  departmentId: number | null;
  departmentName: string | null;
  branchId: number | null;
  branchName: string | null;
  authorNote: string | null;
  publishedAt: string | null;
  publishedByName: string | null;
  updatedAt: string | null;
  readerCount: number;
  signedCount: number;
  myAcknowledgement?: Acknowledgement | null;
};

/** A document the signed-in user must sign (GET /my). */
type PendingRow = SopListRow & { dueDate: string | null; overdue: boolean };

/** A document the signed-in user has signed (GET /my). */
type SignedRow = SopListRow & {
  acknowledgedAt?: string | null;
  examScore?: number | string | null;
  examPassed?: boolean | null;
};

type MyPayload = { pending: PendingRow[]; signed: SignedRow[] };
type DocumentsPayload = {
  documents: SopListRow[];
  totals: { draft: number; published: number; superseded: number; archived: number };
};
type CategoriesPayload = { categories: string[]; inUse: string[] };

/**
 * A question. On the signing path the server strips `correctIndex` and
 * `explanation` from anyone who has not signed, so the reader UI must only
 * ever touch `question`, `options` and `questionOrder` — those two fields are
 * optional here on purpose and are read only by the writer's question editor.
 */
type QuestionRow = {
  id: number;
  question: string;
  options: string[];
  questionOrder: number | null;
  correctIndex?: number | null;
  explanation?: string | null;
};

type CoverageRow = {
  userId: string;
  name: string | null;
  email: string | null;
  signedAt: string | null;
  examScore: number | string | null;
  examPassed: boolean | null;
};

type CoveragePayload = {
  required: CoverageRow[];
  signed: number;
  outstanding: number;
};

type DocumentPayload = {
  document: SopListRow & { body?: string; supersededById?: number | null };
  questions: QuestionRow[];
  readerCount: number;
  signedCount: number;
  coverage: CoveragePayload;
};

/** Only the fields the reader picker needs from the company user list. */
type CompanyUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  username?: string | null;
};

type DepartmentRow = {
  id: number;
  name: string;
  code?: string | null;
  isActive?: boolean | null;
};

/** The 422 body of a failed exam carries what the reader needs to retry. */
type ExamFailure = {
  score: number | string | null;
  passMark: number | string | null;
  incorrectQuestionIds: number[];
};

// ---------------------------------------------------------------------------
// Keys and small helpers
// ---------------------------------------------------------------------------

const sopBase = (companyId: number | null) =>
  `/api/companies/${companyId}/payroll/sop`;

/**
 * Filtered list keys are the request path, like every other payroll page, so
 * the cached response matches exactly the query the server was given.
 */
const documentsKey = (
  companyId: number | null,
  filters: { status: string; category: string; q: string },
) => {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "ALL") params.set("status", filters.status);
  if (filters.category && filters.category !== "ALL") params.set("category", filters.category);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return `${sopBase(companyId)}/documents${qs ? `?${qs}` : ""}`;
};

/**
 * Writes on this page change several lists at once (library totals, the reader's
 * own queue, a document's coverage), and every key is the request path under the
 * same base — so invalidate the whole subtree instead of guessing filter strings.
 */
function invalidateSop(companyId: number | null) {
  queryClient.invalidateQueries({
    predicate: (query) => String(query.queryKey[0]).startsWith(sopBase(companyId)),
  });
}

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const fmtDate = (value: unknown): string => {
  const n = value instanceof Date ? value : value ? new Date(String(value)) : null;
  return n && !Number.isNaN(n.getTime()) ? format(n, "dd MMM yyyy") : "—";
};

const fmtDateTime = (value: unknown): string => {
  const n = value instanceof Date ? value : value ? new Date(String(value)) : null;
  return n && !Number.isNaN(n.getTime()) ? format(n, "dd MMM yyyy 'at' HH:mm") : "—";
};

const scoreLabel = (value: unknown): string => {
  const n = asNumber(value);
  return n === null ? "—" : `${Math.round(n)}%`;
};

const statusStyles: Record<SopStatus, string> = {
  DRAFT: "border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  PUBLISHED: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  SUPERSEDED: "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  ARCHIVED: "border-slate-200 bg-white text-slate-500 dark:bg-transparent dark:text-slate-400",
};

function StatusBadge({ status }: { status: SopStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", statusStyles[status])}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

/** "signed of required", drawn as a bar so a half-signed version reads at a glance. */
function CoverageMeter({ signed, required }: { signed: number; required: number }) {
  const total = Math.max(required, 0);
  const done = Math.max(signed, 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex min-w-[7rem] flex-col gap-1">
      <span className="text-xs tabular-nums text-muted-foreground">
        {total === 0 ? "Nobody named" : `${done} of ${total} signed`}
      </span>
      <span
        className={cn(
          "h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800",
          total === 0 && "opacity-40",
        )}
      >
        <span
          className={cn(
            "block h-full rounded-full transition-all",
            total > 0 && done === total ? "bg-emerald-500" : "bg-blue-500",
          )}
          style={{ width: `${total === 0 ? 0 : pct}%` }}
        />
      </span>
    </div>
  );
}

const scopeLabel = (row: { departmentName?: string | null; branchName?: string | null }) => {
  const parts = [row.departmentName, row.branchName].filter((v): v is string => !!v);
  return parts.length ? parts.join(" · ") : "Whole company";
};

// ---------------------------------------------------------------------------
// Body rendering
// ---------------------------------------------------------------------------

type BodyBlock = { kind: "heading" | "para" | "ul" | "ol"; level: number; lines: string[] };

/**
 * The body is markdown-ish text authored in a textarea. The project ships no
 * markdown renderer, so rather than add a dependency for one paragraph of
 * styling this walks the lines and emits headings, lists and paragraphs. It is
 * display-only: nothing here is trusted enough to need real markdown.
 */
function splitBody(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  let blankBefore = true;
  for (const raw of (body ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      blankBefore = true;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const kind: BodyBlock["kind"] = heading
      ? "heading"
      : bullet
        ? "ul"
        : numbered
          ? "ol"
          : "para";
    const text = heading ? heading[2] : bullet ? bullet[1] : numbered ? numbered[2] : line;
    const level = heading ? heading[1].length : 0;
    const last = blocks[blocks.length - 1];
    if (!blankBefore && last && last.kind === kind && kind !== "heading") {
      last.lines.push(text);
      continue;
    }
    blocks.push({ kind, level, lines: [text] });
    blankBefore = false;
  }
  return blocks;
}

function SopBodyText({ body }: { body: string }) {
  const blocks = useMemo(() => splitBody(body ?? ""), [body]);
  if (!blocks.length) {
    return (
      <p className="text-sm italic text-muted-foreground">
        This version has no text yet — the body is what a reader signs against, so
        publish will refuse it until it is written.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <p
              key={i}
              className={cn(
                "font-semibold text-foreground",
                block.level <= 2 ? "text-base" : "text-sm",
              )}
            >
              {block.lines[0]}
            </p>
          );
        }
        if (block.kind === "ul" || block.kind === "ol") {
          const items = block.lines.map((line, j) => <li key={j}>{line}</li>);
          return block.kind === "ol" ? (
            <ol
              key={i}
              className="space-y-1 list-decimal pl-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
            >
              {items}
            </ol>
          ) : (
            <ul
              key={i}
              className="space-y-1 list-disc pl-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
            >
              {items}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {block.lines.join(" ")}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — my sign-offs
// ---------------------------------------------------------------------------

function MySignoffs({
  companyId,
  onOpen,
}: {
  companyId: number;
  onOpen: (row: SopListRow) => void;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery<MyPayload>({
    queryKey: [`${sopBase(companyId)}/my`],
    enabled: !!companyId,
  });

  const pending = data?.pending ?? [];
  const signed = data?.signed ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <LoadingRows rows={4} />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Your sign-off queue could not be loaded.{" "}
          {error instanceof Error ? error.message : ""}{" "}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-blue-600" />
            Waiting on you
          </CardTitle>
          <CardDescription>
            Each version below names you as a reader and has not been signed by you
            yet. Signing covers that version only — when a procedure is reissued,
            it comes back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-900/30">
              <ClipboardCheck className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
              <p className="text-sm font-medium text-foreground">Nothing waiting on you.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every procedure addressed to you is signed. New ones appear here as
                soon as they are published.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:hover:bg-slate-900/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {row.code}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        v{row.version}
                      </span>
                      <span className="text-xs text-muted-foreground">{row.category}</span>
                      {row.overdue ? (
                        <Badge
                          variant="outline"
                          className="border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          OVERDUE
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 truncate text-sm font-semibold text-foreground">
                      {row.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.dueDate ? `Due ${fmtDate(row.dueDate)}` : "No due date set"}
                      {row.requiresExam ? " · has a short check you must pass" : ""}
                    </p>
                  </div>
                  <Button
                    className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => onOpen(row)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Read &amp; sign
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed by you</CardTitle>
          <CardDescription>
            Your record of what you have confirmed, with the date and the score where
            a check was required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signed.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing signed yet.
            </p>
          ) : (
            <div className="space-y-2">
              {signed.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onOpen(row)}
                  className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 px-4 py-3 text-left transition-colors hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:hover:bg-slate-900/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {row.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.code} · v{row.version}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {row.examScore != null ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          row.examPassed === false
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800",
                        )}
                      >
                        Score {scoreLabel(row.examScore)}
                      </Badge>
                    ) : null}
                    <span>{fmtDateTime(row.acknowledgedAt ?? row.myAcknowledgement?.acknowledgedAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — library
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { value: "ALL", label: "All statuses" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUPERSEDED", label: "Superseded" },
  { value: "ARCHIVED", label: "Archived" },
];

function Library({
  companyId,
  canWrite,
  canApprove,
  onOpen,
  onCoverage,
  onEditDraft,
  onPublish,
  onNewVersion,
  onArchive,
  onDeleteDraft,
  busy,
}: {
  companyId: number;
  canWrite: boolean;
  canApprove: boolean;
  onOpen: (row: SopListRow) => void;
  onCoverage: (row: SopListRow) => void;
  onEditDraft: (row: SopListRow) => void;
  onPublish: (row: SopListRow) => void;
  onNewVersion: (row: SopListRow) => void;
  onArchive: (row: SopListRow) => void;
  onDeleteDraft: (row: SopListRow) => void;
  busy: boolean;
}) {
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Debounced rather than per keystroke: every filter change is a request and
  // the server does the matching.
  useEffect(() => {
    const t = window.setTimeout(() => setSearchTerm(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch } = useQuery<DocumentsPayload>({
    queryKey: [documentsKey(companyId, { status, category, q: searchTerm })],
    enabled: !!companyId,
    placeholderData: (previous) => previous,
  });

  const { data: categoryData } = useQuery<CategoriesPayload>({
    queryKey: [`${sopBase(companyId)}/categories`],
    enabled: !!companyId,
  });

  const rows = data?.documents ?? [];
  const totals = data?.totals ?? { draft: 0, published: 0, superseded: 0, archived: 0 };
  const categories = categoryData?.categories ?? [];
  const inUse = new Set(categoryData?.inUse ?? []);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard label="Draft" value={totals.draft} icon={FileText} tone="slate" />
        <SummaryStatCard label="Published" value={totals.published} icon={ShieldCheck} tone="emerald" />
        <SummaryStatCard label="Superseded" value={totals.superseded} icon={History} tone="amber" />
        <SummaryStatCard label="Archived" value={totals.archived} icon={Archive} tone="violet" />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Document library</CardTitle>
          <CardDescription>
            Every version that has ever existed. A superseded row is history: the
            signatures on it stopped covering the procedure the day a new version was
            published.
          </CardDescription>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search code, title or text"
                className="pl-9"
                aria-label="Search procedures"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full md:w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full md:w-[190px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {categories.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No categories yet — one appears as soon as a document uses it.
                  </div>
                ) : (
                  categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                      {inUse.has(c) ? "" : " (unused)"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Reload library">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold text-foreground">Document</TableHead>
                  <TableHead className="font-semibold text-foreground">Category</TableHead>
                  <TableHead className="font-semibold text-foreground">Scope</TableHead>
                  <TableHead className="font-semibold text-foreground">Signatures</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">Published</TableHead>
                  <TableHead className="font-semibold text-foreground">You</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && !data ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <LoadingRows rows={4} />
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      The library could not be loaded.{" "}
                      {error instanceof Error ? error.message : ""}{" "}
                      <Button variant="outline" size="sm" onClick={() => refetch()}>
                        Try again
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No procedures match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const mine = row.myAcknowledgement;
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => onOpen(row)}
                      >
                        <TableCell className="max-w-[24rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {row.code}
                            </span>
                            <Badge variant="secondary" className="font-mono">
                              v{row.version}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate font-medium">{row.title}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.category}</TableCell>
                        <TableCell className="text-muted-foreground">{scopeLabel(row)}</TableCell>
                        <TableCell>
                          <CoverageMeter signed={row.signedCount} required={row.readerCount} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.publishedAt ? fmtDate(row.publishedAt) : "—"}
                        </TableCell>
                        <TableCell>
                          {mine ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              Signed
                            </Badge>
                          ) : row.status === "PUBLISHED" ? (
                            <Badge
                              variant="outline"
                              className="border-slate-300 text-muted-foreground"
                            >
                              Not signed
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4 text-slate-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[190px]">
                              <DropdownMenuItem className="cursor-pointer" onSelect={() => onOpen(row)}>
                                <Eye className="mr-2 h-4 w-4" /> View
                              </DropdownMenuItem>
                              {canWrite && row.status === "DRAFT" ? (
                                <DropdownMenuItem className="cursor-pointer" onSelect={() => onEditDraft(row)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit draft
                                </DropdownMenuItem>
                              ) : null}
                              {canApprove && row.status === "DRAFT" ? (
                                <DropdownMenuItem className="cursor-pointer" onSelect={() => onPublish(row)}>
                                  <Send className="mr-2 h-4 w-4" /> Publish
                                </DropdownMenuItem>
                              ) : null}
                              {canWrite && row.status === "PUBLISHED" ? (
                                <DropdownMenuItem className="cursor-pointer" onSelect={() => onNewVersion(row)}>
                                  <CopyPlus className="mr-2 h-4 w-4" /> Issue new version
                                </DropdownMenuItem>
                              ) : null}
                              {(canWrite || canApprove) && row.status !== "ARCHIVED" ? (
                                <DropdownMenuItem className="cursor-pointer" onSelect={() => onCoverage(row)}>
                                  <Users className="mr-2 h-4 w-4" /> Coverage
                                </DropdownMenuItem>
                              ) : null}
                              {canApprove && row.status === "PUBLISHED" ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="cursor-pointer text-amber-700 dark:text-amber-400"
                                    onSelect={() => onArchive(row)}
                                  >
                                    <Archive className="mr-2 h-4 w-4" /> Archive
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              {canWrite && row.status === "DRAFT" ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="cursor-pointer text-rose-600 dark:text-rose-400"
                                    onSelect={() => onDeleteDraft(row)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete draft
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {busy ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — draft & publish
// ---------------------------------------------------------------------------

const NEW_CATEGORY = "__new__";

type DraftForm = {
  code: string;
  title: string;
  category: string;
  effectiveDate: string;
  requiresExam: boolean;
  acknowledgementDays: number;
  departmentId: string;
  branchId: string;
  authorNote: string;
  body: string;
};

const blankDraft: DraftForm = {
  code: "",
  title: "",
  category: "GENERAL",
  effectiveDate: "",
  requiresExam: false,
  acknowledgementDays: 14,
  departmentId: "none",
  branchId: "none",
  authorNote: "",
  body: "",
};

const toIdNumber = (value: string): number | null => {
  if (!value || value === "none") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function DraftAndPublish({
  companyId,
  draftId,
  setDraftId,
  canWrite,
  canApprove,
  onPublish,
  onNewVersion,
}: {
  companyId: number;
  draftId: number | null;
  setDraftId: (id: number | null) => void;
  canWrite: boolean;
  canApprove: boolean;
  onPublish: (id: number) => void;
  onNewVersion: (id: number) => void;
}) {
  const { toast } = useToast();
  const { branches } = useBranchContext();
  const [form, setForm] = useState<DraftForm>(blankDraft);
  const [categoryChoice, setCategoryChoice] = useState<string>("GENERAL");
  const [hydratedFrom, setHydratedFrom] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [questionDraft, setQuestionDraft] = useState({
    question: "",
    options: ["", ""],
    correctIndex: 0,
    explanation: "",
  });
  const [readerSearch, setReaderSearch] = useState("");
  const [selectedReaders, setSelectedReaders] = useState<string[]>([]);

  const { data: categoryData } = useQuery<CategoriesPayload>({
    queryKey: [`${sopBase(companyId)}/categories`],
    enabled: !!companyId,
  });
  const categories = categoryData?.categories ?? [];

  const { data: draftOptions } = useQuery<DocumentsPayload>({
    queryKey: [documentsKey(companyId, { status: "DRAFT", category: "ALL", q: "" })],
    enabled: !!companyId,
    placeholderData: (previous) => previous,
  });
  const drafts = draftOptions?.documents ?? [];

  // "Issue a new version" belongs to the published row, not to the draft in front
  // of you — the server refuses a second draft for a code that already has one.
  // Look the current published version of this code up so the button aims at the
  // right id rather than guessing.
  const { data: publishedForCode } = useQuery<DocumentsPayload>({
    queryKey: [
      documentsKey(companyId, { status: "PUBLISHED", category: "ALL", q: form.code.trim() }),
    ],
    enabled: !!companyId && form.code.trim().length > 0,
    placeholderData: (previous) => previous,
  });
  const publishedRow =
    (publishedForCode?.documents ?? []).find((d) => d.code === form.code.trim()) ?? null;

  const { data: departments = [] } = useQuery<DepartmentRow[]>({
    queryKey: [`/api/companies/${companyId}/payroll/departments`],
    enabled: !!companyId,
  });

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    error: detailLoadError,
  } = useQuery<DocumentPayload>({
    queryKey: [`${sopBase(companyId)}/documents/${draftId}`],
    enabled: !!companyId && draftId != null,
  });

  // The reader picker is seeded from the version's coverage list: it is the only
  // response that says who is actually named, so the checkboxes start honest. If a
  // refetch has no coverage in it, leave the writer's in-flight selection alone
  // rather than silently clearing it.
  useEffect(() => {
    const required = detail?.coverage?.required;
    if (!required) return;
    setSelectedReaders(required.map((r) => String(r.userId)));
  }, [detail]);

  // Hydrate the editor once per document, not on every refetch, so an in-flight
  // edit is never overwritten by a background invalidate.
  useEffect(() => {
    const doc = detail?.document;
    if (!doc || hydratedFrom === doc.id) return;
    setForm({
      code: doc.code ?? "",
      title: doc.title ?? "",
      category: doc.category ?? "GENERAL",
      effectiveDate: doc.effectiveDate ? String(doc.effectiveDate).slice(0, 10) : "",
      requiresExam: !!doc.requiresExam,
      acknowledgementDays: Number(doc.acknowledgementDays ?? 14),
      departmentId: doc.departmentId ? String(doc.departmentId) : "none",
      branchId: doc.branchId ? String(doc.branchId) : "none",
      authorNote: doc.authorNote ?? "",
      body: doc.body ?? "",
    });
    setCategoryChoice(doc.category ?? "GENERAL");
    setHydratedFrom(doc.id);
  }, [detail, hydratedFrom]);

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ["company-users", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // Not an SOP endpoint: this is the app's existing company-account list, the
      // same one team settings and the POS reports read. Readers are accounts
      // because staff records are not linked to logins in this product yet.
      const res = await apiFetch(`/api/companies/${companyId}/users`);
      if (!res.ok) throw new Error("The account list could not be loaded.");
      return res.json();
    },
  });

  const questions = detail?.questions ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        title: form.title.trim(),
        category: form.category.trim() || "GENERAL",
        body: form.body,
        effectiveDate: form.effectiveDate || null,
        requiresExam: form.requiresExam,
        acknowledgementDays: Number(form.acknowledgementDays) || 14,
        departmentId: toIdNumber(form.departmentId),
        branchId: toIdNumber(form.branchId),
        authorNote: form.authorNote.trim() || null,
      };
      const res = draftId
        ? await apiRequest("PUT", `${sopBase(companyId)}/documents/${draftId}`, payload)
        : await apiRequest("POST", `${sopBase(companyId)}/documents`, payload);
      return res.json();
    },
    onSuccess: (saved: { id?: number }) => {
      const nextId = draftId ?? Number(saved?.id);
      toast({
        title: draftId ? "Draft saved" : "Draft created",
        description: "Only drafts can be edited; publish to freeze this text.",
      });
      if (Number.isFinite(nextId)) setDraftId(nextId);
      invalidateSop(companyId);
    },
    onError: (err: Error) => {
      // "Published versions are immutable; issue a new version." arrives here.
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });

  const addQuestion = useMutation({
    mutationFn: async () => {
      if (draftId == null) throw new Error("Save the draft before adding questions.");
      const res = await apiRequest("POST", `${sopBase(companyId)}/documents/${draftId}/questions`, {
        question: questionDraft.question.trim(),
        options: questionDraft.options.map((o) => o.trim()),
        correctIndex: questionDraft.correctIndex,
        explanation: questionDraft.explanation.trim() || undefined,
        questionOrder: questions.length + 1,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Question added" });
      setQuestionDraft({ question: "", options: ["", ""], correctIndex: 0, explanation: "" });
      invalidateSop(companyId);
    },
    onError: (err: Error) => {
      toast({ title: "Could not add the question", description: err.message, variant: "destructive" });
    },
  });

  const removeQuestion = useMutation({
    mutationFn: async (questionId: number) => {
      if (draftId == null) throw new Error("Save the draft before changing questions.");
      await apiRequest("DELETE", `${sopBase(companyId)}/documents/${draftId}/questions/${questionId}`);
    },
    onSuccess: () => invalidateSop(companyId),
    onError: (err: Error) => {
      toast({ title: "Could not remove the question", description: err.message, variant: "destructive" });
    },
  });

  const saveReaders = useMutation({
    mutationFn: async () => {
      if (draftId == null) throw new Error("Save the draft before naming readers.");
      const res = await apiRequest("POST", `${sopBase(companyId)}/documents/${draftId}/readers`, {
        userIds: selectedReaders,
      });
      return res.json();
    },
    onSuccess: (result: { readerCount?: number }) => {
      toast({
        title: "Readers set",
        description: `${Number(result?.readerCount ?? selectedReaders.length)} account${
          Number(result?.readerCount ?? 0) === 1 ? "" : "s"
        } must sign this version.`,
      });
      invalidateSop(companyId);
    },
    onError: (err: Error) => {
      toast({ title: "Could not set readers", description: err.message, variant: "destructive" });
    },
  });

  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!form.body.trim()) list.push("The body is empty — there is nothing to read.");
    if (selectedReaders.length === 0) {
      list.push("No readers named — nobody would be able to sign it.");
    }
    if (form.requiresExam && questions.length === 0) {
      list.push("The check is switched on but no questions have been written.");
    }
    return list;
  }, [form.body, form.requiresExam, selectedReaders.length, questions.length]);

  const canEditQuestions = draftId != null && detail?.document?.status === "DRAFT";

  const filteredUsers = useMemo(() => {
    const needle = readerSearch.trim().toLowerCase();
    const sorted = [...companyUsers].sort((a, b) =>
      String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")),
    );
    if (!needle) return sorted;
    return sorted.filter((u) =>
      [u.name, u.email, u.username].some((v) => String(v || "").toLowerCase().includes(needle)),
    );
  }, [companyUsers, readerSearch]);

  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draftId ? `Editing draft v${detail?.document?.version ?? ""}` : "New procedure"}
            </CardTitle>
            <CardDescription>
              A code plus a version is one document. Reissue rather than rewrite: a
              signature can only point at the text it was given against.
            </CardDescription>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
              <Select
                value={draftId ? String(draftId) : "new"}
                onValueChange={(v) => {
                  setHydratedFrom(null);
                  if (v === "new") {
                    setDraftId(null);
                    setForm(blankDraft);
                    setCategoryChoice("GENERAL");
                  } else {
                    setDraftId(Number(v));
                  }
                }}
              >
                <SelectTrigger className="w-full md:w-[22rem]">
                  <SelectValue placeholder="Pick a draft to edit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Start a new procedure</SelectItem>
                  {drafts.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Nothing is in draft right now.
                    </div>
                  ) : (
                    drafts.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.code} v{d.version} — {d.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  setHydratedFrom(null);
                  setDraftId(null);
                  setForm(blankDraft);
                  setCategoryChoice("GENERAL");
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                {detailLoadError instanceof Error ? detailLoadError.message : "This draft could not be loaded."}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sop-code">Code</Label>
                <Input
                  id="sop-code"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                  placeholder="e.g. FIN-PAY-01"
                />
                <p className="text-xs text-muted-foreground">
                  Unique per version. Reusing a code means a new version of the same
                  procedure.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sop-title">Title</Label>
                <Input
                  id="sop-title"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Month-end payroll reconciliation"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={categoryChoice}
                  onValueChange={(v) => {
                    setCategoryChoice(v);
                    if (v !== NEW_CATEGORY) set("category", v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.length ? categories : ["GENERAL"]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_CATEGORY}>New category…</SelectItem>
                  </SelectContent>
                </Select>
                {categoryChoice === NEW_CATEGORY ? (
                  <Input
                    value={form.category}
                    onChange={(e) => set("category", e.target.value.toUpperCase())}
                    placeholder="e.g. HEALTH_SAFETY"
                    aria-label="New category name"
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Categories come from the server; a brand-new one appears in the
                  library filter as soon as the first document uses it.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sop-effective">Effective date</Label>
                <Input
                  id="sop-effective"
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => set("effectiveDate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sop-window">Days to sign</Label>
                <Input
                  id="sop-window"
                  type="number"
                  min={1}
                  max={180}
                  value={form.acknowledgementDays}
                  onChange={(e) => set("acknowledgementDays", Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  From publication, and from a new joiner&apos;s start date, the
                  signature is due within this window.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sop-department">Department</Label>
                <Select value={form.departmentId} onValueChange={(v) => set("departmentId", v)}>
                  <SelectTrigger id="sop-department">
                    <SelectValue placeholder="Whole company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole company</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                        {d.code ? ` (${d.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sop-branch">Branch</Label>
                <Select value={form.branchId} onValueChange={(v) => set("branchId", v)}>
                  <SelectTrigger id="sop-branch">
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Scope says who a version is about. The people who must sign it are
                  named below.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Require a check before signing</Label>
                <p className="text-xs text-muted-foreground">
                  Readers answer the questions below and must pass before their
                  signature is recorded. Use it when misunderstanding is the risk, not
                  when the text is merely long.
                </p>
              </div>
              <Switch
                checked={form.requiresExam}
                onCheckedChange={(v) => set("requiresExam", v)}
                aria-label="Require a check before signing"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="sop-body">Procedure text</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview((v) => !v)}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  {showPreview ? "Back to editing" : "Preview"}
                </Button>
              </div>
              {showPreview ? (
                <div className="min-h-[16rem] rounded-lg border bg-slate-50/70 p-4 dark:bg-slate-900/30">
                  <SopBodyText body={form.body} />
                </div>
              ) : (
                <Textarea
                  id="sop-body"
                  rows={12}
                  value={form.body}
                  onChange={(e) => set("body", e.target.value)}
                  placeholder={"# Purpose\nWhat this procedure exists to control.\n\n# Steps\n1. Do the first thing\n2. Do the second thing"}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Written for the person doing the job, not for the person who wrote it.
                Plain structure works best: a purpose, the steps, and who to tell when
                something is wrong.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sop-note">Note to readers (optional)</Label>
              <Input
                id="sop-note"
                value={form.authorNote}
                onChange={(e) => set("authorNote", e.target.value)}
                placeholder="e.g. Replaces the paper checklist everyone was still using."
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setDraftId(null);
                  setForm(blankDraft);
                  setCategoryChoice("GENERAL");
                  setHydratedFrom(null);
                }}
              >
                Clear
              </Button>
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={
                  saveMutation.isPending ||
                  !form.code.trim() ||
                  !form.title.trim() ||
                  (draftId != null && detail != null && detail.document.status !== "DRAFT")
                }
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" /> {draftId ? "Save draft" : "Create draft"}
                  </>
                )}
              </Button>
            </div>
            {draftId != null && detail && detail.document.status !== "DRAFT" ? (
              <p className="text-right text-xs text-amber-700">
                This version is {detail.document.status.toLowerCase()} — the server will
                refuse to edit it. Issue a new version instead.
              </p>
            ) : null}
            {draftId == null ? (
              <p className="text-right text-xs text-muted-foreground">
                Questions, readers and publishing unlock once this draft is saved.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-blue-600" />
              Check questions
            </CardTitle>
            <CardDescription>
              The answer key is visible to writers only. A reader is served the
              question and its options and nothing else.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canEditQuestions ? (
              <p className="text-sm text-muted-foreground">
                {detailLoading ? (
                  <LoadingRows rows={2} />
                ) : draftId == null ? (
                  "Save the draft first, then add its questions."
                ) : (
                  "Questions can only change while the document is a draft."
                )}
              </p>
            ) : (
              <>
                {questions.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    No questions yet. With the check switched on, publish will refuse
                    this version until at least one exists.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {questions.map((q, i) => {
                      const options = Array.isArray(q.options) ? q.options : [];
                      return (
                        <div key={q.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium">
                              {i + 1}. {q.question}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:text-rose-700"
                              disabled={removeQuestion.isPending}
                              onClick={() => removeQuestion.mutate(q.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {options.map((opt, j) => (
                              <li
                                key={j}
                                className={cn(
                                  "rounded-md px-2 py-1 text-xs",
                                  j === q.correctIndex
                                    ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "text-muted-foreground",
                                )}
                              >
                                {j + 1}. {opt}
                                {j === q.correctIndex ? " — correct" : ""}
                              </li>
                            ))}
                          </ul>
                          {q.explanation ? (
                            <p className="mt-2 text-xs italic text-muted-foreground">
                              Why: {q.explanation}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-lg border bg-slate-50/70 p-4 dark:bg-slate-900/30">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="q-text">Question</Label>
                      <Input
                        id="q-text"
                        value={questionDraft.question}
                        onChange={(e) =>
                          setQuestionDraft((p) => ({ ...p, question: e.target.value }))
                        }
                        placeholder="e.g. Who signs off the reconciliation before the run is locked?"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Options — mark one correct</Label>
                      {questionDraft.options.map((opt, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <RadioGroup
                            className="flex items-center"
                            value={String(questionDraft.correctIndex)}
                            onValueChange={(v) =>
                              setQuestionDraft((p) => ({ ...p, correctIndex: Number(v) }))
                            }
                          >
                            <RadioGroupItem value={String(index)} aria-label={`Option ${index + 1} is correct`} />
                          </RadioGroup>
                          <Input
                            value={opt}
                            onChange={(e) =>
                              setQuestionDraft((p) => {
                                const next = [...p.options];
                                next[index] = e.target.value;
                                return { ...p, options: next };
                              })
                            }
                            placeholder={`Option ${index + 1}`}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove option ${index + 1}`}
                            disabled={questionDraft.options.length <= 2}
                            onClick={() =>
                              setQuestionDraft((p) => {
                                const next = p.options.filter((_, i) => i !== index);
                                return {
                                  ...p,
                                  options: next,
                                  correctIndex: Math.min(p.correctIndex, next.length - 1),
                                };
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={questionDraft.options.length >= 8}
                        onClick={() =>
                          setQuestionDraft((p) => ({ ...p, options: [...p.options, ""] }))
                        }
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add option
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="q-why">Why that is correct (optional)</Label>
                      <Input
                        id="q-why"
                        value={questionDraft.explanation}
                        onChange={(e) =>
                          setQuestionDraft((p) => ({ ...p, explanation: e.target.value }))
                        }
                        placeholder="Shown to the reader after they sign."
                      />
                    </div>
                    <Button
                      size="sm"
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      disabled={
                        addQuestion.isPending ||
                        !questionDraft.question.trim() ||
                        questionDraft.options.filter((o) => o.trim()).length < 2 ||
                        !questionDraft.options[questionDraft.correctIndex]?.trim()
                      }
                      onClick={() => addQuestion.mutate()}
                    >
                      {addQuestion.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" /> Add question
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Before you publish</CardTitle>
            <CardDescription>
              The same checks the server runs, shown here so publishing is not a coin
              flip.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blockers.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                Nothing is missing. {form.requiresExam ? `The check has ${questions.length} question${questions.length === 1 ? "" : "s"}.` : "No check required."}
              </p>
            ) : (
              <ul className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                {blockers.map((b) => (
                  <li key={b} className="text-sm text-amber-900 dark:text-amber-300">
                    · {b}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2">
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={!draftId || !canApprove || blockers.length > 0 || saveMutation.isPending}
                onClick={() => draftId != null && onPublish(draftId)}
              >
                <Send className="mr-2 h-4 w-4" /> Publish this draft
              </Button>
              <Button
                variant="outline"
                disabled={!publishedRow || !canWrite}
                onClick={() => publishedRow && onNewVersion(publishedRow.id)}
              >
                <CopyPlus className="mr-2 h-4 w-4" />
                {publishedRow
                  ? `Issue version ${publishedRow.version + 1}`
                  : "Issue a new version"}
              </Button>
              {!publishedRow && form.code.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Nothing is published under {form.code.trim()} yet, so there is no
                  version to reissue — publishing this draft makes the first one.
                </p>
              ) : null}
              {!canApprove ? (
                <p className="text-xs text-muted-foreground">
                  Publishing and archiving need the payroll approval permission; save
                  the draft and someone with it can publish.
                </p>
              ) : null}
              {blockers.length > 0 && canApprove && draftId != null ? (
                <p className="text-xs text-muted-foreground">
                  The publish button unlocks when nothing is missing — the server would
                  refuse it and say the same thing.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Named readers</CardTitle>
            <CardDescription>
              Readers are chosen by account, because accounts are not yet linked to
              staff records in this product. That is deliberate: an outstanding
              signature list is always a real list of real people.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {draftId == null ? (
              <p className="text-sm text-muted-foreground">
                Save the draft first — the reader list belongs to one version.
              </p>
            ) : detailLoading ? (
              <LoadingRows rows={3} />
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={readerSearch}
                    onChange={(e) => setReaderSearch(e.target.value)}
                    placeholder="Find an account by name or email"
                    className="pl-9"
                    aria-label="Find an account"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedReaders.length} named · {detail?.readerCount ?? 0} on the
                  saved version · {detail?.signedCount ?? 0} signed
                </p>
                <ScrollArea className="h-72 rounded-lg border">
                  <div className="space-y-1 p-3">
                    {companyUsers.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No company accounts could be loaded.
                      </p>
                    ) : filteredUsers.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No account matches “{readerSearch}”.
                      </p>
                    ) : (
                      filteredUsers.map((u) => {
                        const checked = selectedReaders.includes(String(u.id));
                        return (
                          <label
                            key={u.id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setSelectedReaders((prev) =>
                                  v
                                    ? [...prev, String(u.id)]
                                    : prev.filter((id) => id !== String(u.id)),
                                )
                              }
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {u.name || u.username || u.email || "Unnamed account"}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {u.email}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <Button
                  className="w-full bg-blue-600 text-white hover:bg-blue-700"
                  disabled={
                    saveReaders.isPending ||
                    (draftId != null && detail != null && detail.document.status !== "DRAFT")
                  }
                  onClick={() => saveReaders.mutate()}
                >
                  {saveReaders.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving readers…
                    </>
                  ) : (
                    <>
                      <Users className="mr-2 h-4 w-4" /> Replace the reader list
                    </>
                  )}
                </Button>
                {detail?.document?.status !== "DRAFT" ? (
                  <p className="text-xs text-muted-foreground">
                    The reader list belongs to a draft; a published version already has
                    its list.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document view + signing
// ---------------------------------------------------------------------------

function DocumentView({
  companyId,
  documentId,
  seedAcknowledgement,
  onClose,
}: {
  companyId: number;
  documentId: number;
  seedAcknowledgement: Acknowledgement | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [signatureName, setSignatureName] = useState("");
  const [examFailure, setExamFailure] = useState<ExamFailure | null>(null);

  const accountName = String(user?.name || user?.username || user?.email || "");

  const { data, isLoading, isError, error } = useQuery<DocumentPayload>({
    queryKey: [`${sopBase(companyId)}/documents/${documentId}`],
    enabled: !!companyId && documentId > 0,
  });

  useEffect(() => {
    if (!signatureName) setSignatureName(accountName);
  }, [accountName, signatureName]);

  const acknowledge = useMutation({
    mutationFn: async (payload: {
      signatureName: string;
      answers?: Array<{ questionId: number; selectedIndex: number }>;
    }) => {
      // apiRequest flattens every failure to a message, but a failed check also
      // carries the score, the pass mark and which questions were wrong. The
      // reader needs those to re-read and retry, so this one call reads the body.
      const res = await apiFetch(`${sopBase(companyId)}/documents/${documentId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
            score?: number | string;
            passMark?: number | string;
            incorrectQuestionIds?: number[];
          }
        | null;
      return { ok: res.ok, status: res.status, body };
    },
    onSuccess: ({ ok, status, body }) => {
      if (ok) {
        setExamFailure(null);
        toast({
          title: "Signed",
          description: "Your signature is recorded against this version.",
        });
        invalidateSop(companyId);
        return;
      }
      const message = String(
        body?.message ||
          body?.error ||
          (status === 403
            ? "This version does not name you, so there is nothing for you to sign."
            : status === 409
              ? "You have already signed this version."
              : "Your signature was not recorded."),
      );
      if (status === 422 && body?.error === "EXAM_NOT_PASSED") {
        setExamFailure({
          score: body?.score ?? null,
          passMark: body?.passMark ?? null,
          incorrectQuestionIds: Array.isArray(body?.incorrectQuestionIds)
            ? body.incorrectQuestionIds.map(Number)
            : [],
        });
        toast({
          title: "Check not passed",
          description: "Nothing was recorded — read the procedure again and retry.",
          variant: "destructive",
        });
        return;
      }
      if (status === 409) {
        // Already signed: refresh so the receipt replaces the form.
        invalidateSop(companyId);
      }
      toast({ title: "Not signed", description: message, variant: "destructive" });
    },
    onError: (err: Error) => {
      toast({ title: "Not signed", description: err.message, variant: "destructive" });
    },
  });

  const doc = data?.document;
  const questions = data?.questions ?? [];
  // The detail response is authoritative; the list row's acknowledgement is only
  // a stand-in for a server that does not echo it on the detail route.
  const receipt = doc && doc.myAcknowledgement !== undefined ? doc.myAcknowledgement : seedAcknowledgement;
  const hasReceipt = !!(receipt && receipt.acknowledgedAt);
  const sortedQuestions = [...questions].sort(
    (a, b) => Number(a.questionOrder ?? 0) - Number(b.questionOrder ?? 0),
  );
  const wrongIds = new Set(examFailure?.incorrectQuestionIds ?? []);
  const allAnswered = sortedQuestions.every((q) => answers[String(q.id)] !== undefined);

  const submit = () => {
    setExamFailure(null);
    acknowledge.mutate({
      signatureName: signatureName.trim(),
      answers: doc?.requiresExam
        ? sortedQuestions.map((q) => ({
            questionId: q.id,
            selectedIndex: answers[String(q.id)] as number,
          }))
        : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{doc?.title ?? "Procedure"}</span>
            {doc ? (
              <Badge variant="secondary" className="font-mono">
                v{doc.version}
              </Badge>
            ) : null}
            {doc ? <StatusBadge status={doc.status} /> : null}
          </DialogTitle>
          <DialogDescription>
            {doc
              ? `${doc.code} · ${doc.category} · ${scopeLabel(doc)}${
                  doc.effectiveDate ? ` · effective ${fmtDate(doc.effectiveDate)}` : ""
                }${doc.publishedAt ? ` · published ${fmtDateTime(doc.publishedAt)}` : ""}`
              : "Loading this version…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingRows rows={6} />
        ) : isError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {error instanceof Error ? error.message : "This document could not be loaded."}
          </p>
        ) : doc ? (
          <div className="space-y-5">
            {doc.authorNote ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                {doc.authorNote}
              </p>
            ) : null}

            <div className="grid gap-3 rounded-xl border bg-slate-50/60 p-4 text-xs sm:grid-cols-2 md:grid-cols-5 dark:bg-slate-900/30">
              <div>
                <p className="font-semibold text-muted-foreground">Sign window</p>
                <p className="mt-1 text-foreground">
                  {doc.acknowledgementDays} days from being named
                </p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground">Check required</p>
                <p className="mt-1 text-foreground">
                  {doc.requiresExam ? `Yes — ${questions.length} question(s)` : "No"}
                </p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground">Signatures</p>
                <p className="mt-1 text-foreground">
                  {data?.signedCount ?? doc.signedCount} of {data?.readerCount ?? doc.readerCount}
                </p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground">Published by</p>
                <p className="mt-1 text-foreground">{doc.publishedByName || "—"}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground">Last changed</p>
                <p className="mt-1 text-foreground">{fmtDateTime(doc.updatedAt)}</p>
              </div>
            </div>

            <div className="max-h-[40vh] overflow-y-auto rounded-xl border bg-white p-5 dark:bg-slate-950/40">
              <SopBodyText body={doc.body ?? ""} />
            </div>

            {hasReceipt ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                  <ClipboardCheck className="h-4 w-4" /> You have signed this version
                </p>
                <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">
                  Signed {fmtDateTime(receipt?.acknowledgedAt)}
                  {receipt?.signatureName ? ` as “${receipt.signatureName}”` : ""}
                  {receipt?.examScore != null
                    ? ` · check ${scoreLabel(receipt.examScore)}${
                        receipt.examPassed === false ? " (not passed)" : ""
                      }`
                    : ""}
                  .
                </p>
                <p className="mt-2 text-xs text-emerald-900/70 dark:text-emerald-200/70">
                  This receipt is the evidence. If the procedure is reissued, a fresh
                  version will appear in your queue.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border p-4">
                <p className="text-sm font-semibold">
                  {doc.requiresExam ? "Check, then sign" : "Confirm you have read this"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only the accounts named on this version can sign it, and each account
                  signs once. If you are not on the list, the server will say so.
                </p>

                {doc.requiresExam ? (
                  <div className="mt-4 space-y-4">
                    {sortedQuestions.map((q, i) => {
                      const options = Array.isArray(q.options) ? q.options : [];
                      const wrong = wrongIds.has(Number(q.id));
                      return (
                        <div
                          key={q.id}
                          className={cn(
                            "rounded-lg border p-3",
                            wrong && "border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30",
                          )}
                        >
                          <p className="text-sm font-medium">
                            {i + 1}. {q.question}
                            {wrong ? (
                              <span className="ml-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                — answered incorrectly
                              </span>
                            ) : null}
                          </p>
                          <RadioGroup
                            className="mt-2 space-y-1.5"
                            value={answers[String(q.id)] === undefined ? "" : String(answers[String(q.id)])}
                            onValueChange={(v) =>
                              setAnswers((prev) => ({ ...prev, [String(q.id)]: Number(v) }))
                            }
                          >
                            {options.map((opt, j) => (
                              <Label
                                key={j}
                                className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 font-normal text-sm hover:bg-slate-50 dark:hover:bg-slate-900/40"
                              >
                                <RadioGroupItem value={String(j)} className="mt-0.5" />
                                <span>{opt}</span>
                              </Label>
                            ))}
                          </RadioGroup>
                          {options.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              This question has no options to choose from.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {examFailure ? (
                  <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    <p className="font-semibold">
                      Check not passed — you scored {scoreLabel(examFailure.score)}.
                      {examFailure.passMark != null
                        ? ` The pass mark is ${scoreLabel(examFailure.passMark)}.`
                        : ""}
                    </p>
                    <p className="mt-1">
                      Nothing was recorded. Your signature was not saved and your answers
                      were not kept. Re-read the procedure above, then try again.
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 space-y-2 border-t pt-4">
                  <Label htmlFor="sop-signature">Your signature</Label>
                  <p className="text-xs text-muted-foreground">
                    You are signed in as {accountName || "this account"}
                    {user?.email ? ` (${user.email})` : ""}. Type the name exactly as it
                    appears on your account — the typed name is the signature, a tick box
                    would prove nothing.
                  </p>
                  <Input
                    id="sop-signature"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    placeholder="Your full name"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {doc.requiresExam && !allAnswered ? (
                      <span className="text-xs text-muted-foreground">
                        Answer every question before signing.
                      </span>
                    ) : null}
                    <Button variant="outline" onClick={onClose}>
                      Close
                    </Button>
                    <Button
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      disabled={
                        acknowledge.isPending ||
                        !signatureName.trim() ||
                        (doc.requiresExam && !allAnswered)
                      }
                      onClick={submit}
                    >
                      {acknowledge.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording…
                        </>
                      ) : (
                        <>
                          <FileSignature className="mr-2 h-4 w-4" /> Sign this version
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing to show for this document.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function CoverageView({
  companyId,
  documentId,
  title,
  onClose,
}: {
  companyId: number;
  documentId: number;
  title: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery<CoveragePayload>({
    queryKey: [`${sopBase(companyId)}/documents/${documentId}/coverage`],
    enabled: !!companyId && documentId > 0,
  });

  const rows = data?.required ?? [];
  const outstanding = rows.filter((r) => !r.signedAt);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Coverage — {title}</DialogTitle>
          <DialogDescription>
            Who must sign this version, who has, and who still has to. This is the list
            a follow-up is made from.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingRows rows={5} />
        ) : isError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {error instanceof Error ? error.message : "Coverage could not be loaded."}{" "}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryStatCard label="Must sign" value={rows.length} icon={Users} tone="blue" />
              <SummaryStatCard label="Signed" value={data?.signed ?? 0} icon={ClipboardCheck} tone="emerald" />
              <SummaryStatCard
                label="Outstanding"
                value={data?.outstanding ?? outstanding.length}
                icon={History}
                tone={(data?.outstanding ?? 0) > 0 ? "amber" : "slate"}
              />
            </div>

            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nobody is named on this version yet, so nothing can be signed.
              </p>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-semibold text-foreground">Reader</TableHead>
                      <TableHead className="font-semibold text-foreground">Signed</TableHead>
                      <TableHead className="font-semibold text-foreground">Check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.userId}>
                        <TableCell>
                          <p className="font-medium">{r.name || r.email || "Unnamed account"}</p>
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        </TableCell>
                        <TableCell>
                          {r.signedAt ? (
                            <span className="text-sm text-muted-foreground">
                              {fmtDateTime(r.signedAt)}
                            </span>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              Outstanding
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.examScore == null ? "—" : scoreLabel(r.examScore)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HRSop() {
  const { activeCompanyId } = useActiveCompany();
  const { can } = usePermissions();
  const { toast } = useToast();
  const companyId = activeCompanyId ?? null;

  const canWrite = can("payroll.write");
  const canApprove = can("payroll.approve");
  // The library is payroll business on the server too: without payroll.view the list is a
  // 403, because it is where drafts and outstanding-signature counts live. A plain reader
  // gets their own sign-offs and the version they were named on, which is all they need.
  const canViewLibrary = can("payroll.view");

  const [tab, setTab] = useState("mine");
  const [view, setView] = useState<{ id: number; ack: Acknowledgement | null } | null>(null);
  const [coverage, setCoverage] = useState<{ id: number; title: string } | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SopListRow | null>(null);

  const publishMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `${sopBase(companyId)}/documents/${id}/publish`);
      return res.json();
    },
    onSuccess: (result: { document?: SopListRow; supersededId?: number | null }) => {
      toast({
        title: "Published",
        description: result?.supersededId
          ? "The version it replaces is now marked superseded — its signatures no longer cover the procedure."
          : "Named readers can now sign this version.",
      });
      invalidateSop(companyId);
    },
    onError: (err: Error) => {
      // 400 lists exactly what is missing. That list is the point, so show it.
      toast({ title: "Publish refused", description: err.message, variant: "destructive" });
    },
  });

  const newVersionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `${sopBase(companyId)}/documents/${id}/new-version`);
      return res.json();
    },
    onSuccess: (created: { id?: number; version?: number }) => {
      toast({
        title: "New draft created",
        description: `Version ${created?.version ?? ""} is a draft. Signatures on the published version stand until this one is published.`,
      });
      setDraftId(Number(created?.id));
      setTab("draft");
      invalidateSop(companyId);
    },
    onError: (err: Error) => {
      // 409 "a draft already exists for this code" — the reader needs the code,
      // not a generic failure.
      toast({ title: "Could not issue a new version", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `${sopBase(companyId)}/documents/${id}/archive`);
      return res.json();
    },
    onSuccess: (row: { title?: string }) => {
      toast({
        title: "Archived",
        description: `${row?.title ?? "The procedure"} no longer appears as current. Existing signatures are kept.`,
      });
      invalidateSop(companyId);
    },
    onError: (err: Error) => {
      toast({ title: "Could not archive", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${sopBase(companyId)}/documents/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Draft deleted" });
      if (deleteTarget?.id === draftId) setDraftId(null);
      setDeleteTarget(null);
      invalidateSop(companyId);
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    },
  });

  const anyWriteBusy =
    publishMutation.isPending ||
    newVersionMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending;

  // A signed row from GET /my carries the receipt on the row itself rather than
  // under myAcknowledgement, so seed the dialog from whichever the server used.
  const openDocument = (row: SopListRow) => {
    const signed = row as SopListRow & Partial<SignedRow>;
    const ack: Acknowledgement | null =
      row.myAcknowledgement ??
      (signed.acknowledgedAt
        ? {
            acknowledgedAt: signed.acknowledgedAt ?? null,
            signatureName: null,
            examScore: signed.examScore ?? null,
            examPassed: signed.examPassed ?? null,
          }
        : null);
    setView({ id: row.id, ack });
  };

  // A tab the viewer has no business in falls back to their own sign-offs rather than
  // rendering a screen whose every read answers 403.
  const activeTab =
    (tab === "draft" && !canWrite) || (tab === "library" && !canViewLibrary) ? "mine" : tab;

  if (!companyId) {
    return (
      <HRLayout>
        <div className="text-muted-foreground">Select a company to see its procedures.</div>
      </HRLayout>
    );
  }

  return (
    <HRLayout>
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
              <ClipboardCheck className="w-7 h-7 text-blue-600" />
              Procedures &amp; Sign-offs
            </h2>
            <p className="text-muted-foreground mt-1 max-w-3xl">
              Standard operating procedures and the record of who has read and signed
              each version. A procedure sitting on a shared drive proves nothing at a
              disciplinary hearing — a dated signature from a named person does, and
              that is what this screen keeps.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900 dark:bg-blue-950/30 dark:border-blue-900/50 dark:text-blue-200">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            A signature covers one version. When a procedure is reissued, the old
            signatures stop counting and everyone named on the new version signs again —
            that is the reason the version number lives on the document and not in its
            text.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList
            className={cn(
              "w-full max-w-2xl h-auto py-1 grid",
              canWrite ? "grid-cols-3" : canViewLibrary ? "grid-cols-2" : "grid-cols-1"
            )}
          >
            <TabsTrigger value="mine" className="text-xs">
              My sign-offs
            </TabsTrigger>
            {canViewLibrary ? (
              <TabsTrigger value="library" className="text-xs">
                Library
              </TabsTrigger>
            ) : null}
            {canWrite ? (
              <TabsTrigger value="draft" className="text-xs">
                Draft &amp; publish
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="mine" className="mt-6">
            <MySignoffs companyId={companyId} onOpen={openDocument} />
          </TabsContent>

          <TabsContent value="library" className="mt-6">
            {canViewLibrary ? (
              <Library
              companyId={companyId}
              canWrite={canWrite}
              canApprove={canApprove}
              busy={anyWriteBusy}
              onOpen={openDocument}
              onCoverage={(row) => setCoverage({ id: row.id, title: `${row.code} v${row.version}` })}
              onEditDraft={(row) => {
                setDraftId(row.id);
                setTab("draft");
              }}
              onPublish={(row) => publishMutation.mutate(row.id)}
              onNewVersion={(row) => newVersionMutation.mutate(row.id)}
              onArchive={(row) => archiveMutation.mutate(row.id)}
              onDeleteDraft={(row) => setDeleteTarget(row)}
            />
            ) : null}
          </TabsContent>

          {canWrite ? (
            <TabsContent value="draft" className="mt-6">
              <DraftAndPublish
                companyId={companyId}
                draftId={draftId}
                setDraftId={setDraftId}
                canWrite={canWrite}
                canApprove={canApprove}
                onPublish={(id) => publishMutation.mutate(id)}
                onNewVersion={(id) => newVersionMutation.mutate(id)}
              />
            </TabsContent>
          ) : null}
        </Tabs>

        {view ? (
          <DocumentView
            companyId={companyId}
            documentId={view.id}
            seedAcknowledgement={view.ack}
            onClose={() => setView(null)}
          />
        ) : null}

        {coverage ? (
          <CoverageView
            companyId={companyId}
            documentId={coverage.id}
            title={coverage.title}
            onClose={() => setCoverage(null)}
          />
        ) : null}

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => (open ? null : setDeleteTarget(null))}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `${deleteTarget.code} v${deleteTarget.version} — ${deleteTarget.title} has never been published, so no signature depends on it.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              >
                Delete draft
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </HRLayout>
  );
}
