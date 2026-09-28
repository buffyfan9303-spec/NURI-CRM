"use client";

/**
 * 시술 기록 + 사진(0023). 업로드는 서버 계약 3단계다:
 *  createSalonPhotoUploadUrl(서명 경로·토큰) → 브라우저가 storage.uploadToSignedUrl → attachSalonPhoto(경로 기록).
 * 버킷이 비공개라 사진은 항상 서명 URL(10분)로만 보여준다 — photoUrls는 서버가 이미 만들어 내려준다.
 *
 * 레퍼런스: Fresha — 사진은 예약(시술) 단위로 붙고, 메모는 직원만 본다.
 */
import * as React from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Trash2, Camera } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardHead, Alert } from "@/components/rental/listkit";
import type { TreatmentHistoryRow } from "@/lib/domain/salon";
import { updateTreatmentNote, createSalonPhotoUploadUrl, attachSalonPhoto, removeSalonPhoto } from "@/lib/domain/salon-actions";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

// salon-actions.ts는 "use server" 파일이라 상수 export를 클라이언트에서 그대로 import하지 않는다
// (서버 액션 번들 규칙 — 함수 외 export는 불안정할 수 있어 값만 여기 복제, 실제 판정은 항상 서버가 한다).
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_MIME = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT_MAP = Object.fromEntries(ACCEPT_MIME.map((m) => [m, []]));

export function TreatmentHistoryPanel({
  businessId,
  canWrite,
  history,
}: {
  businessId: string;
  canWrite: boolean;
  history: TreatmentHistoryRow[];
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState(history);
  React.useEffect(() => setItems(history), [history]);

  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="시술 기록" description={`${items.length}건 · 사진과 메모는 직원만 봅니다`} />
      {error && <Alert className="mb-3">{error}</Alert>}
      {items.length === 0 ? (
        <EmptyState title="시술 기록이 없습니다." description="예약 목록에서 완료된 예약의 '시술 기록'을 누르면 여기에 사진과 메모를 남길 수 있습니다." />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bd)]">
          {items.map((h) => (
            <TreatmentHistoryItem
              key={h.id}
              businessId={businessId}
              canWrite={canWrite}
              item={h}
              onError={setError}
              onUpdated={(next) => setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TreatmentHistoryItem({
  businessId,
  canWrite,
  item,
  onError,
  onUpdated,
}: {
  businessId: string;
  canWrite: boolean;
  item: TreatmentHistoryRow;
  onError: (m: string | null) => void;
  onUpdated: (next: TreatmentHistoryRow) => void;
}) {
  const [note, setNote] = React.useState(item.note ?? "");
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const dirty = note !== (item.note ?? "");

  const saveNote = async () => {
    if (!dirty) return;
    setBusy(true);
    onError(null);
    try {
      const r = await updateTreatmentNote(businessId, item.id, note);
      if (!r.ok) { onError(r.message); return; }
      onUpdated({ ...item, note: note.trim() || null });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch {
      onError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  /** 여러 장을 순서대로 올린다(서명 URL → 업로드 → attach, 한 장씩). 실패한 장은 건너뛰고 인라인 오류로 남긴다. */
  const uploadFiles = async (files: File[], rejectMessage?: string) => {
    onError(rejectMessage ?? null);
    if (files.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    let paths = item.photoPaths;
    let urls = item.photoUrls;
    const failed: string[] = [];
    try {
      for (const [i, file] of files.entries()) {
        try {
          const signed = await createSalonPhotoUploadUrl(businessId, { historyId: item.id, fileName: file.name, mime: file.type, size: file.size });
          if (!signed.ok) { failed.push(`${file.name}: ${signed.message}`); continue; }
          const { error: upErr } = await getBrowserSupabase()
            .storage.from("salon-photos")
            .uploadToSignedUrl(signed.data.path, signed.data.token, file, { contentType: file.type });
          if (upErr) { failed.push(`${file.name}: 업로드 실패`); continue; }
          const attached = await attachSalonPhoto(businessId, item.id, signed.data.path);
          if (!attached.ok) { failed.push(`${file.name}: ${attached.message}`); continue; }
          // 서명 URL은 새로 만들어야 하므로(경로만 갱신됨) 페이지를 새로고침해야 썸네일이 보인다 — 낙관적으로 경로만 반영.
          paths = attached.data.photoPaths;
          urls = [...urls, null];
          onUpdated({ ...item, photoPaths: paths, photoUrls: urls });
        } finally {
          setProgress({ done: i + 1, total: files.length });
        }
      }
      const okCount = files.length - failed.length;
      if (okCount > 0) toast.success(`사진 ${okCount}장을 올렸습니다.`);
      if (failed.length > 0) onError([rejectMessage, `올리지 못한 사진 — ${failed.join(" / ")}`].filter(Boolean).join(" "));
    } catch {
      onError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // 끌어서 올리기(PC) + 탭해서 선택(모바일, open()). 형식·10MB 는 dropzone 이 먼저 거르고 서버가 다시 판정한다.
  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    accept: ACCEPT_MAP,
    maxSize: MAX_BYTES,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    useFsAccessApi: false,
    disabled: !canWrite || busy,
    onDrop: (accepted, rejected) => {
      const tooBig = rejected.some((r) => r.errors.some((e) => e.code === "file-too-large"));
      const badType = rejected.some((r) => r.errors.some((e) => e.code === "file-invalid-type"));
      const rejectMessage = rejected.length
        ? `${rejected.length}개 건너뜀 — ${[badType && "JPEG·PNG·WebP 이미지만 올릴 수 있습니다.", tooBig && "사진은 10MB 이하여야 합니다."].filter(Boolean).join(" ")}`
        : undefined;
      void uploadFiles(accepted, rejectMessage);
    },
  });

  const removePhoto = async (path: string) => {
    if (!window.confirm("사진을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?")) return;
    setBusy(true);
    onError(null);
    try {
      const r = await removeSalonPhoto(businessId, item.id, path);
      if (!r.ok) { onError(r.message); return; }
      const idx = item.photoPaths.indexOf(path);
      onUpdated({
        ...item,
        photoPaths: r.data.photoPaths,
        photoUrls: item.photoUrls.filter((_, i) => i !== idx),
      });
    } catch {
      onError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium tabular-nums text-t2">{formatInTz(item.createdAt, DEFAULT_TZ, "yyyy.MM.dd HH:mm")}</span>
        {canWrite && (
          <>
            <input {...getInputProps({ "aria-label": "시술 사진 선택" })} />
            <Button variant="secondary" size="sm" loading={busy} onClick={openPicker}>
              <Upload size={13} aria-hidden />
              {progress ? `올리는 중 ${progress.done}/${progress.total}` : "사진 추가"}
            </Button>
          </>
        )}
      </div>
      {/* 사진 칸 + 메모 전체가 드롭 대상(PC). 끌고 오면 행 전체에 점선 테두리와 안내가 덮인다. */}
      <div
        {...getRootProps({
          className: cn("relative grid grid-cols-1 gap-3 rounded-[var(--r-md)] sm:grid-cols-[auto_1fr]", canWrite && "-m-1.5 p-1.5"),
        })}
      >
        {isDragActive && (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[var(--r-md)] bg-[var(--accent-soft)]/90 text-[13.5px] font-medium text-[var(--accent-ink)] outline-dashed outline-2 outline-[var(--accent)]">
            <Upload size={16} aria-hidden />
            여기에 놓으면 올라갑니다
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          {item.photoUrls.length === 0 && (
            <span className="flex h-[88px] w-[88px] flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--bd2)] text-[10.5px] text-t3">
              <Camera size={18} aria-hidden />사진 없음
            </span>
          )}
          {item.photoUrls.map((url, i) => (
            <div key={item.photoPaths[i] ?? i} className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL이라 next/image 원격 도메인 설정 대상이 아니다.
                <img src={url} alt="시술 사진" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10.5px] leading-tight text-t3">새로고침 후 표시</span>
              )}
              {canWrite && (
                <button
                  type="button"
                  aria-label="사진 삭제"
                  disabled={busy}
                  onClick={() => removePhoto(item.photoPaths[i])}
                  className="absolute right-1 top-1 flex h-[28px] w-[28px] items-center justify-center rounded-[6px] bg-black/60 text-white hover:bg-black/75 disabled:opacity-50 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            disabled={!canWrite}
            placeholder={canWrite ? "시술 메모 — 약제·톤·다음 방문 때 참고할 내용" : "메모 없음"}
            rows={3}
            aria-label="시술 메모"
            className="min-h-[88px] w-full resize-y rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 py-2 text-[16px] leading-relaxed text-t outline-none transition-colors placeholder:text-t3 focus:border-[var(--accent)] focus:shadow-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60 sm:text-[13px]"
          />
          <p className="mt-1 h-[16px] text-[11.5px] text-t3" aria-live="polite">
            {busy ? "저장 중…" : saved ? "저장됨" : dirty ? "입력창을 벗어나면 저장됩니다" : ""}
          </p>
        </div>
      </div>
    </li>
  );
}
