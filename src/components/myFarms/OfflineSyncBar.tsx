import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  RefreshCw,
  Wifi,
  X,
} from 'lucide-react';
import { OutboxOperation } from '../../types/myFarms';
import { downloadJsonFile } from '../../lib/myFarmsOutbox';

interface OfflineSyncBarProps {
  isOnline: boolean;
  lastSyncedAt: string | null;
  outbox: OutboxOperation[];
  isSyncing: boolean;
  quotaError: string | null;
  onSyncNow: () => void;
  onResolveConflict: (operationId: string, resolution: 'keep_mine' | 'accept_server') => void;
  onDiscardOp: (operationId: string) => void;
  onExportBackup: () => void;
  onDismissQuotaError: () => void;
}

export const OfflineSyncBar: React.FC<OfflineSyncBarProps> = ({
  isOnline,
  lastSyncedAt,
  outbox,
  isSyncing,
  quotaError,
  onSyncNow,
  onResolveConflict,
  onDiscardOp,
  onExportBackup,
  onDismissQuotaError,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pendingOps = outbox.filter((o) => o.status === 'pending' || o.status === 'syncing');
  const conflictOps = outbox.filter((o) => o.status === 'conflict');
  const failedOps = outbox.filter((o) => o.status === 'failed');
  const totalQueued = outbox.length;

  const statusTone = conflictOps.length > 0 || failedOps.length > 0
    ? 'issue'
    : !isOnline
      ? 'offline'
      : pendingOps.length > 0
        ? 'pending'
        : 'online';

  return (
    <>
      {quotaError && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{quotaError}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rose-500/40 font-semibold hover:bg-rose-500/15 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Backup JSON
            </button>
            <button
              type="button"
              onClick={onDismissQuotaError}
              aria-label="Dismiss storage warning"
              className="p-1 rounded hover:bg-rose-500/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            statusTone === 'issue'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : statusTone === 'offline'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                : statusTone === 'pending'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {statusTone === 'offline' ? (
            <CloudOff className="w-3.5 h-3.5 shrink-0" />
          ) : statusTone === 'issue' ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ) : statusTone === 'pending' ? (
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
          ) : (
            <Wifi className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}

          <span>
            {statusTone === 'issue'
              ? `Sync issue (${conflictOps.length + failedOps.length})`
              : statusTone === 'offline'
                ? 'Offline mode'
                : statusTone === 'pending'
                  ? `Changes pending (${pendingOps.length})`
                  : 'Synced'}
          </span>

          {lastSyncedAt && statusTone === 'online' && (
            <span className="hidden sm:inline text-[11px] opacity-75 tabular-nums">
              · {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </button>

        {totalQueued > 0 && isOnline && (
          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>

      {/* Sync Outbox & Conflict Resolution Drawer */}
      {drawerOpen && (
        <div className="fs-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div
            className="fs-drawer-shell w-full max-w-md h-full p-6 flex flex-col justify-between overflow-y-auto fs-thin-scroll"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Sync Outbox & Offline Queue"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-[#0F766E]/15 dark:border-white/12 pb-3.5">
                <div>
                  <h3 className="text-lg font-bold text-[#072622] dark:text-white">
                    Sync Outbox &amp; Offline Status
                  </h3>
                  <p className="text-[13px] text-[#285E55] dark:text-[#96C7BE] mt-0.5">
                    {isOnline
                      ? 'Connected to workspace server. Local edits sync automatically.'
                      : 'Offline mode active. Supported edits queue locally and replay when connection returns.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close sync drawer"
                  className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!isOnline && (
                <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-[13px] text-amber-900 dark:text-amber-200 space-y-1.5">
                  <div className="font-bold">Offline capabilities &amp; restrictions</div>
                  <p className="leading-relaxed">
                    Available offline: view cached portfolio/reports, rename farms, archive/restore, log scouting observations, complete tasks, and draft field polygons.
                  </p>
                  <p className="opacity-85 text-xs">
                    Requires connection: live weather refresh, NASA POWER climatology, elevation sampling, and satellite imagery reload.
                  </p>
                </div>
              )}

              {outbox.length === 0 ? (
                <div className="fs-modal-subpanel p-6 text-center space-y-2">
                  <CheckCircle2 className="w-6 h-6 mx-auto text-[#059669] dark:text-[#24E982]" />
                  <div className="text-sm font-bold text-[#072622] dark:text-white">
                    All local edits synced
                  </div>
                  <div className="text-xs text-[#285E55] dark:text-[#96C7BE]">
                    {lastSyncedAt
                      ? `Last server sync at ${new Date(lastSyncedAt).toLocaleString()}`
                      : 'Workspace is up to date.'}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {outbox.map((op) => (
                    <div
                      key={op.operationId}
                      className={`rounded-2xl border p-4 text-[13px] space-y-2 ${
                        op.status === 'conflict'
                          ? 'border-rose-500/45 bg-rose-500/10'
                          : op.status === 'failed'
                            ? 'border-amber-500/45 bg-amber-500/10'
                            : 'fs-modal-subpanel'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-[#072622] dark:text-white">
                            {op.summaryLabel}
                          </div>
                          <div className="text-xs text-[#285E55] dark:text-[#96C7BE] tabular-nums mt-0.5">
                            {op.entityType} · {new Date(op.createdAt).toLocaleString()} · {op.status}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDiscardOp(op.operationId)}
                          className="text-xs text-[#285E55] dark:text-[#96C7BE] hover:text-rose-600 underline cursor-pointer"
                        >
                          Discard
                        </button>
                      </div>

                      {op.lastError && (
                        <div className="text-xs text-rose-700 dark:text-rose-300">{op.lastError}</div>
                      )}

                      {op.status === 'conflict' && (
                        <div className="pt-2 border-t border-rose-500/25 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="fs-modal-subpanel p-2.5">
                              <div className="font-semibold text-[#072622] dark:text-white mb-1">
                                Your Local Edit
                              </div>
                              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-[#285E55] dark:text-[#96C7BE]">
                                {JSON.stringify(op.payload, null, 1).slice(0, 180)}
                              </pre>
                            </div>
                            <div className="fs-modal-subpanel p-2.5">
                              <div className="font-semibold text-[#072622] dark:text-white mb-1">
                                Server State
                              </div>
                              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-[#285E55] dark:text-[#96C7BE]">
                                {op.conflictServerSnapshot
                                  ? JSON.stringify(
                                      {
                                        name: op.conflictServerSnapshot.name,
                                        version: op.conflictServerSnapshot.versionNumber,
                                        updatedAt: op.conflictServerSnapshot.updatedAt,
                                      },
                                      null,
                                      1
                                    )
                                  : 'Server record modified'}
                              </pre>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onResolveConflict(op.operationId, 'keep_mine')}
                              className="flex-1 h-9 px-3 rounded-full bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer"
                            >
                              Keep My Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onResolveConflict(op.operationId, 'accept_server')}
                              className="flex-1 h-9 px-3 rounded-full bg-white/75 dark:bg-white/10 border border-[#0F766E]/25 dark:border-white/20 text-[#072622] dark:text-white text-xs font-semibold cursor-pointer"
                            >
                              Accept Server
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#0F766E]/15 dark:border-white/12 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => downloadJsonFile(`anchor-outbox-backup-${Date.now()}.json`, outbox)}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-xs font-semibold text-[#072622] dark:text-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={onSyncNow}
                disabled={!isOnline || isSyncing || outbox.length === 0}
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-gradient-to-r from-[#5EEAD4] via-[#2DD4BF] to-[#24E982] text-[#031F1C] text-xs font-bold hover:brightness-105 disabled:opacity-45 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Replay Queue</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
