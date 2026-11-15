import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Sprout,
  X,
} from 'lucide-react';
import heroFarmlandImg from '../assets/images/hero_farmland_1790691713410.jpg';
import aerialCinematicImg from '../assets/images/farm_aerial_cinematic_1793374539769.jpg';
import irrigationTwilightImg from '../assets/images/farm_irrigation_twilight_1793374566818.jpg';
import {
  FarmObservationItem,
  FarmTaskItem,
  IrrigationLogItem,
  MyFarmRecord,
  MyFarmsSubTab,
  OutboxOperation,
  PlanDecisionEvent,
  PortfolioFieldRecord,
  PortfolioFilterState,
  SavedFarmSnapshot,
} from '../types/myFarms';
import { GeoJsonPolygonGeometry } from '../types/maps';
import {
  buildAssessedFarmRecord,
  computePortfolioAggregates,
  formatStatusLabel,
  handleLocalProfileDeletionCleanup,
  propagateFarmRenameEverywhere,
  ServerRawFarmDto,
  syncFarmToLocalProfiles,
} from '../lib/myFarmsEngine';
import {
  downloadJsonFile,
  enqueueOutboxOp,
  loadCachedPortfolio,
  loadOutbox,
  removeOutboxOp,
  saveCachedPortfolio,
} from '../lib/myFarmsOutbox';
import {
  ConflictApiError,
  executeDirectMutation,
  fetchMyFarmsPortfolio,
  PortfolioApiResponse,
  replaySyncOutbox,
} from '../services/myFarmsApi';
import { getActiveFarmId, setActiveFarmId } from '../lib/farmStorage';
import { useToast } from '../components/Toast';
import { OfflineSyncBar } from '../components/myFarms/OfflineSyncBar';
import { PortfolioTable } from '../components/myFarms/PortfolioTable';
import { AddFarmWizardModal } from '../components/myFarms/AddFarmWizardModal';
import {
  DeleteFarmModal,
  DuplicateFarmModal,
  ExportFarmModal,
  RenameFarmModal,
} from '../components/myFarms/FarmModals';
import { FarmDetailWorkspace } from '../components/myFarms/FarmDetailWorkspace';

const TOP_FOLIAGE_BG = '/assets/aistudio/image_13b15b65.png';

const STATUS_RANK: Record<string, number> = {
  alert: 1,
  needs_attention: 2,
  needs_refresh: 3,
  partial: 4,
  not_assessed: 5,
  good: 6,
  archived: 7,
};

export const MyFarms: React.FC = () => {
  const { farmId: routeFarmId } = useParams<{ farmId?: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Raw server/cached store data
  const [rawFarms, setRawFarms] = useState<ServerRawFarmDto[]>([]);
  const [fields, setFields] = useState<PortfolioFieldRecord[]>([]);
  const [decisions, setDecisions] = useState<PlanDecisionEvent[]>([]);
  const [observations, setObservations] = useState<FarmObservationItem[]>([]);
  const [tasks, setTasks] = useState<FarmTaskItem[]>([]);
  const [irrigationLogs, setIrrigationLogs] = useState<IrrigationLogItem[]>([]);
  const [snapshots, setSnapshots] = useState<SavedFarmSnapshot[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxOperation[]>(() => loadOutbox());
  const [isSyncing, setIsSyncing] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [detailTab, setDetailTab] = useState<MyFarmsSubTab>('overview');
  const [filter, setFilter] = useState<PortfolioFilterState>({
    search: '',
    status: 'all',
    region: 'all',
    sortBy: 'assessedAt',
    sortDir: 'desc',
  });

  // Modals
  const [wizardOpen, setWizardOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<MyFarmRecord | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<MyFarmRecord | null>(null);
  const [exportTarget, setExportTarget] = useState<MyFarmRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MyFarmRecord | null>(null);

  const applyPortfolioBundle = useCallback((bundle: PortfolioApiResponse) => {
    setRawFarms(bundle.farms);
    setFields(bundle.fields);
    setDecisions(bundle.decisions);
    setObservations(bundle.observations);
    setTasks(bundle.tasks);
    setIrrigationLogs(bundle.irrigationLogs);
    setSnapshots(bundle.snapshots);
    setLastSyncedAt(bundle.serverTimestamp);
    const cacheRes = saveCachedPortfolio({
      farms: bundle.farms,
      fields: bundle.fields,
      decisions: bundle.decisions,
      observations: bundle.observations,
      tasks: bundle.tasks,
      irrigationLogs: bundle.irrigationLogs,
      snapshots: bundle.snapshots,
    });
    if (cacheRes.quotaExceeded && cacheRes.error) {
      setQuotaError(cacheRes.error);
    }
  }, []);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchMyFarmsPortfolio();
      applyPortfolioBundle(data);
    } catch (err) {
      const cached = loadCachedPortfolio();
      if (cached) {
        setRawFarms(cached.farms);
        setFields(cached.fields);
        setDecisions(cached.decisions);
        setObservations(cached.observations);
        setTasks(cached.tasks);
        setIrrigationLogs(cached.irrigationLogs);
        setSnapshots(cached.snapshots);
        setLastSyncedAt(cached.cachedAt);
        setLoadError(
          `Using locally cached portfolio (${new Date(cached.cachedAt).toLocaleString()}) — server unavailable.`
        );
      } else {
        setLoadError(err instanceof Error ? err.message : 'Unable to load My Farms portfolio.');
      }
    } finally {
      setLoading(false);
    }
  }, [applyPortfolioBundle]);

  const handleSyncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await replaySyncOutbox();
      setOutbox(result.remaining);
      if (result.latestPortfolio) {
        applyPortfolioBundle(result.latestPortfolio);
      } else if (result.syncedCount > 0) {
        await loadPortfolio();
      }
      if (result.syncedCount > 0) {
        showToast(`Synced ${result.syncedCount} offline change${result.syncedCount > 1 ? 's' : ''}`, 'success');
      }
      if (result.conflictCount > 0) {
        showToast(`${result.conflictCount} sync conflict(s) require your choice`, 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [applyPortfolioBundle, isSyncing, loadPortfolio, showToast]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      handleSyncNow();
    };
    const onOffline = () => setIsOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        handleSyncNow();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [handleSyncNow]);

  // Build derived assessed farm entities
  const farms: MyFarmRecord[] = useMemo(
    () =>
      rawFarms.map((rf) =>
        buildAssessedFarmRecord(rf, fields, observations, tasks)
      ),
    [rawFarms, fields, observations, tasks]
  );

  // Sync active farm record to localStorage so Home, Header & Deep Analysis stay coherent
  useEffect(() => {
    if (farms.length === 0) return;
    const activeId = getActiveFarmId();
    const target = farms.find((f) => f.id === routeFarmId) || farms.find((f) => f.id === activeId);
    if (target) {
      syncFarmToLocalProfiles(target);
    }
  }, [farms, routeFarmId]);

  const aggregates = useMemo(
    () => computePortfolioAggregates(farms, fields),
    [farms, fields]
  );

  const uniqueRegions = useMemo(
    () =>
      Array.from(
        new Set(farms.map((f) => f.regionLabel).filter(Boolean))
      ).sort(),
    [farms]
  );

  const filteredFarms = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    const showingArchived = filter.status === 'archived' || filter.region === '__archived__';
    const matching = farms.filter((farm) => {
      if (showingArchived) {
        if (!farm.archivedAt) return false;
      } else {
        if (farm.archivedAt) return false;
        if (filter.status === 'good' && farm.assessment.status !== 'good') return false;
        if (
          filter.status === 'needs_attention' &&
          farm.assessment.status !== 'needs_attention' &&
          farm.assessment.status !== 'needs_refresh'
        ) {
          return false;
        }
        if (filter.status === 'alert' && farm.assessment.status !== 'alert') return false;
        if (
          filter.status === 'not_assessed' &&
          farm.assessment.status !== 'not_assessed' &&
          farm.assessment.status !== 'partial'
        ) {
          return false;
        }
      }

      if (filter.region !== 'all' && filter.region !== '__archived__' && farm.regionLabel !== filter.region) {
        return false;
      }

      if (q) {
        const farmFieldNames = fields
          .filter((fl) => fl.farmId === farm.id)
          .map((fl) => `${fl.name} ${fl.cropName || ''}`)
          .join(' ');
        const statusText = formatStatusLabel(farm.assessment.status);
        const haystack = `${farm.name} ${farm.locationLabel} ${farm.regionLabel} ${farm.primaryCrop || ''} ${statusText} ${farmFieldNames}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const dir = filter.sortDir === 'asc' ? 1 : -1;
    return [...matching].sort((a, b) => {
      if (filter.sortBy === 'name') {
        return a.name.localeCompare(b.name) * dir;
      }
      if (filter.sortBy === 'area') {
        const aa = a.mappedAreaHa > 0 ? a.mappedAreaHa : a.declaredAreaHa ?? 0;
        const ab = b.mappedAreaHa > 0 ? b.mappedAreaHa : b.declaredAreaHa ?? 0;
        return (aa - ab) * dir;
      }
      if (filter.sortBy === 'fields') {
        const fa = fields.filter((fl) => fl.farmId === a.id).length || (a.hasBoundary ? 1 : 0);
        const fb = fields.filter((fl) => fl.farmId === b.id).length || (b.hasBoundary ? 1 : 0);
        return (fa - fb) * dir;
      }
      if (filter.sortBy === 'alerts') {
        return (a.assessment.activeAlertsCount - b.assessment.activeAlertsCount) * dir;
      }
      if (filter.sortBy === 'status') {
        return ((STATUS_RANK[a.assessment.status] ?? 9) - (STATUS_RANK[b.assessment.status] ?? 9)) * dir;
      }
      const ta = Date.parse(a.assessment.assessedAt || a.updatedAt) || 0;
      const tb = Date.parse(b.assessment.assessedAt || b.updatedAt) || 0;
      return (ta - tb) * dir;
    });
  }, [farms, fields, filter]);

  const selectedDetailFarm = useMemo(
    () => (routeFarmId ? farms.find((f) => f.id === routeFarmId) ?? null : null),
    [farms, routeFarmId]
  );

  // Unified mutation helper with offline-tolerant queueing & 409 conflict surfacing
  const runMutationWithOfflineFallback = async (opts: {
    entityType: OutboxOperation['entityType'];
    entityId: string;
    farmId: string;
    baseVersion: number | null;
    conflictPolicy: OutboxOperation['conflictPolicy'];
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    endpoint: string;
    payload: Record<string, unknown>;
    summaryLabel: string;
    optimisticUpdate?: () => void;
    successMessage?: string;
  }) => {
    if (!isOnline) {
      opts.optimisticUpdate?.();
      const { outbox: nextQueue, storageResult } = enqueueOutboxOp({
        entityType: opts.entityType,
        entityId: opts.entityId,
        farmId: opts.farmId,
        baseVersion: opts.baseVersion,
        conflictPolicy: opts.conflictPolicy,
        method: opts.method,
        endpoint: opts.endpoint,
        payload: opts.payload,
        summaryLabel: opts.summaryLabel,
      });
      setOutbox(nextQueue);
      if (storageResult.quotaExceeded && storageResult.error) setQuotaError(storageResult.error);
      showToast(`Saved locally — queued for sync (${opts.summaryLabel})`, 'info');
      return;
    }

    try {
      const res = await executeDirectMutation<{ portfolio?: PortfolioApiResponse }>(
        opts.method,
        opts.endpoint,
        opts.method === 'DELETE' ? undefined : opts.payload
      );
      if (res.portfolio) {
        applyPortfolioBundle(res.portfolio);
      } else {
        await loadPortfolio();
      }
      if (opts.successMessage) showToast(opts.successMessage, 'success');
    } catch (err) {
      if (err instanceof ConflictApiError) {
        const { outbox: nextQueue } = enqueueOutboxOp({
          entityType: opts.entityType,
          entityId: opts.entityId,
          farmId: opts.farmId,
          baseVersion: opts.baseVersion,
          conflictPolicy: 'ask_user',
          method: opts.method,
          endpoint: opts.endpoint,
          payload: opts.payload,
          summaryLabel: opts.summaryLabel,
        });
        // Mark immediately as conflict in outbox so Sync Drawer shows diff
        const updated = nextQueue.map((o, idx) =>
          idx === nextQueue.length - 1
            ? {
                ...o,
                status: 'conflict' as const,
                lastError: err.message,
                conflictServerSnapshot: (err.serverFarm as unknown as Record<string, unknown>) ?? null,
              }
            : o
        );
        setOutbox(updated);
        showToast('Version conflict detected — review in Sync Outbox', 'error');
        throw err;
      }

      // Network drop fallback -> queue offline cleanly
      if (err instanceof TypeError || (err instanceof Error && err.message.toLowerCase().includes('fetch'))) {
        opts.optimisticUpdate?.();
        const { outbox: nextQueue, storageResult } = enqueueOutboxOp({
          entityType: opts.entityType,
          entityId: opts.entityId,
          farmId: opts.farmId,
          baseVersion: opts.baseVersion,
          conflictPolicy: opts.conflictPolicy,
          method: opts.method,
          endpoint: opts.endpoint,
          payload: opts.payload,
          summaryLabel: opts.summaryLabel,
        });
        setOutbox(nextQueue);
        if (storageResult.quotaExceeded && storageResult.error) setQuotaError(storageResult.error);
        showToast(`Connection interrupted — queued locally (${opts.summaryLabel})`, 'info');
        return;
      }

      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      throw err;
    }
  };

  // Specific Handlers
  const handleCreateFarm = async (payload: Record<string, unknown>) => {
    if (!isOnline) {
      const { outbox: nextQueue } = enqueueOutboxOp({
        entityType: 'farm_create',
        entityId: `temp-${Date.now()}`,
        farmId: 'pending',
        baseVersion: null,
        conflictPolicy: 'append_only',
        method: 'POST',
        endpoint: '/api/my-farms/farms',
        payload,
        summaryLabel: `Create farm "${String(payload.name || 'New Farm')}"`,
      });
      setOutbox(nextQueue);
      showToast('Offline: new farm queued for creation once back online', 'info');
      return;
    }

    const res = await executeDirectMutation<{ farm?: ServerRawFarmDto; portfolio?: PortfolioApiResponse }>(
      'POST',
      '/api/my-farms/farms',
      payload
    );
    if (res.portfolio) applyPortfolioBundle(res.portfolio);
    if (res.farm) {
      setActiveFarmId(res.farm.id);
      showToast(`Created "${res.farm.name}"`, 'success');
      navigate(`/my-farms/${res.farm.id}`);
    }
  };

  const handlePatchFarm = async (
    farm: MyFarmRecord,
    patch: Record<string, unknown>,
    summaryLabel: string
  ) => {
    await runMutationWithOfflineFallback({
      entityType: 'farm_patch',
      entityId: farm.id,
      farmId: farm.id,
      baseVersion: farm.versionNumber,
      conflictPolicy: 'ask_user',
      method: 'PATCH',
      endpoint: `/api/my-farms/farms/${farm.id}`,
      payload: { ...patch, expectedVersion: farm.versionNumber },
      summaryLabel,
      optimisticUpdate: () => {
        setRawFarms((prev) =>
          prev.map((rf) =>
            rf.id === farm.id
              ? {
                  ...rf,
                  ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
                  ...(patch.archived !== undefined
                    ? { archivedAt: patch.archived ? new Date().toISOString() : null }
                    : {}),
                  ...(patch.soil ? { soil: { ...rf.soil, ...(patch.soil as Record<string, unknown>) } as ServerRawFarmDto['soil'] } : {}),
                  ...(patch.water ? { water: { ...rf.water, ...(patch.water as Record<string, unknown>) } as ServerRawFarmDto['water'] } : {}),
                  updatedAt: new Date().toISOString(),
                }
              : rf
          )
        );
      },
      successMessage: summaryLabel,
    });
  };

  const handleRenameConfirm = async (farm: MyFarmRecord, newName: string) => {
    await handlePatchFarm(farm, { name: newName }, `Renamed "${farm.name}" → "${newName}"`);
    propagateFarmRenameEverywhere(farm.id, farm.name, newName);
  };

  const handleDuplicateConfirm = async (
    farm: MyFarmRecord,
    opts: { newName: string; includeFields: boolean; includeHistory: boolean }
  ) => {
    const res = await executeDirectMutation<{ farm?: ServerRawFarmDto; portfolio?: PortfolioApiResponse }>(
      'POST',
      `/api/my-farms/farms/${farm.id}/duplicate`,
      opts
    );
    if (res.portfolio) applyPortfolioBundle(res.portfolio);
    showToast(`Duplicated configuration as "${opts.newName}"`, 'success');
  };

  const handleDeleteConfirm = async (farm: MyFarmRecord) => {
    const res = await executeDirectMutation<{
      deletedFarmId: string;
      removedCounts?: Record<string, number>;
    }>('DELETE', `/api/my-farms/farms/${farm.id}`);

    const remainingIds = rawFarms.filter((f) => f.id !== farm.id).map((f) => f.id);
    handleLocalProfileDeletionCleanup(farm.id, remainingIds);

    await loadPortfolio();
    showToast(
      `Deleted "${farm.name}" (${res.removedCounts?.fields ?? 0} fields removed)`,
      'success'
    );
    if (routeFarmId === farm.id) {
      navigate('/my-farms');
    }
  };

  const handleExportJson = (farm: MyFarmRecord) => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      privacyNotice: 'Private ANCHOR farm portfolio export',
      farm,
      fields: fields.filter((f) => f.farmId === farm.id),
      decisions: decisions.filter((d) => d.farmId === farm.id),
      observations: observations.filter((o) => o.farmId === farm.id),
      tasks: tasks.filter((t) => t.farmId === farm.id),
      irrigationLogs: irrigationLogs.filter((l) => l.farmId === farm.id),
      snapshots: snapshots.filter((s) => s.farmId === farm.id),
    };
    downloadJsonFile(
      `${farm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-record.json`,
      bundle
    );
    showToast(`Exported ${farm.name} JSON record`, 'success');
  };

  const handleExportGeoJson = (farm: MyFarmRecord) => {
    const farmFields = fields.filter((f) => f.farmId === farm.id);
    const features = farmFields.length > 0
      ? farmFields.map((fl) => ({
          type: 'Feature',
          properties: {
            farmId: farm.id,
            farmName: farm.name,
            fieldId: fl.id,
            fieldName: fl.name,
            crop: fl.cropName || null,
            areaHa: fl.versions[0]?.netAreaHectares ?? null,
            status: fl.status,
          },
          geometry: fl.versions[0]?.geometry ?? null,
        }))
      : farm.geometry
        ? [
            {
              type: 'Feature',
              properties: {
                farmId: farm.id,
                farmName: farm.name,
                areaHa: farm.mappedAreaHa,
              },
              geometry: farm.geometry,
            },
          ]
        : [];

    downloadJsonFile(`${farm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.geojson`, {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'EPSG:4326' } },
      features,
    });
    showToast(`Exported ${farm.name} GeoJSON`, 'success');
  };

  const handleResolveConflict = async (
    operationId: string,
    resolution: 'keep_mine' | 'accept_server'
  ) => {
    const op = outbox.find((o) => o.operationId === operationId);
    if (!op) return;
    if (resolution === 'accept_server') {
      const next = removeOutboxOp(operationId);
      setOutbox(next);
      await loadPortfolio();
      showToast('Accepted server version; discarded conflicting local edit', 'info');
      return;
    }

    try {
      const res = await executeDirectMutation<{ portfolio?: PortfolioApiResponse }>(
        op.method,
        op.endpoint,
        { ...op.payload, forceOverwrite: true, operationId: op.operationId }
      );
      const next = removeOutboxOp(operationId);
      setOutbox(next);
      if (res.portfolio) applyPortfolioBundle(res.portfolio);
      showToast('Applied your local edit cleanly', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to force apply edit', 'error');
    }
  };

  const handleOpenInMaps = (farm: MyFarmRecord) => {
    syncFarmToLocalProfiles(farm);
    setActiveFarmId(farm.id);
    navigate(`/maps?farmId=${encodeURIComponent(farm.id)}`);
  };

  const handleRunDeepAnalysis = (farm: MyFarmRecord) => {
    syncFarmToLocalProfiles(farm);
    setActiveFarmId(farm.id);
    navigate(`/analyze?mode=farm&reanalyze=1&stage=4&farmId=${encodeURIComponent(farm.id)}`);
  };

  const hasActiveFilters =
    filter.search.trim() !== '' || filter.status !== 'all' || filter.region !== 'all';

  const sortSelectValue = `${filter.sortBy}:${filter.sortDir}`;
  const mappedActiveFarmsCount = farms.filter((f) => !f.archivedAt && f.hasBoundary).length;
  const activeFieldsCount = fields.filter((fl) => fl.status === 'Active').length;

  return (
    <div
      className={
        routeFarmId
          ? 'relative isolate min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#D4EAE5] text-[#072622] dark:bg-[#031411] dark:text-[#ECF8F5]'
          : 'relative isolate min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#C2DFD9] text-[#072622] dark:bg-[#041513] dark:text-[#ECF8F5]'
      }
    >
      {/* Top Foliage Image + Deep Pine-Teal Atmospheric Layer */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <img
          src={TOP_FOLIAGE_BG}
          alt=""
          referrerPolicy="no-referrer"
          className={
            routeFarmId
              ? 'absolute inset-x-0 top-0 w-full h-[680px] sm:h-[780px] object-cover object-center opacity-35 dark:opacity-55 blur-[1px]'
              : 'absolute inset-x-0 top-0 w-full h-[640px] sm:h-[740px] object-cover object-right-top opacity-35 dark:opacity-55'
          }
        />
        <div
          className="hidden dark:block absolute inset-0"
          style={{
            background: routeFarmId
              ? 'radial-gradient(ellipse at 45% 0%, rgba(16, 128, 102, 0.24), transparent 46%), radial-gradient(ellipse at 100% 60%, rgba(8, 104, 82, 0.16), transparent 42%), linear-gradient(135deg, rgba(4, 24, 20, 0.56), rgba(3, 18, 15, 0.86) 58%, #031411 100%)'
              : 'radial-gradient(ellipse at 52% 14%, rgba(20, 184, 154, 0.20), transparent 50%), radial-gradient(ellipse at 10% 72%, rgba(13, 148, 136, 0.16), transparent 44%), linear-gradient(180deg, rgba(4, 22, 19, 0.48) 0%, rgba(4, 26, 22, 0.78) 440px, #041513 680px)',
          }}
        />
        <div
          className="dark:hidden absolute inset-0"
          style={{
            background: routeFarmId
              ? 'radial-gradient(ellipse at 50% 0%, rgba(167, 232, 220, 0.45), transparent 60%), linear-gradient(180deg, rgba(220, 244, 238, 0.62) 0%, rgba(212, 236, 230, 0.84) 380px, #D4EAE5 620px)'
              : 'radial-gradient(ellipse at 50% 0%, rgba(160, 226, 214, 0.46), transparent 60%), linear-gradient(180deg, rgba(210, 240, 234, 0.58) 0%, rgba(194, 223, 217, 0.82) 380px, #C2DFD9 620px)',
          }}
        />
      </div>

      <div className={routeFarmId ? 'w-full px-3 sm:px-5 lg:px-6 py-2.5 lg:py-3 space-y-2.5 lg:space-y-3' : 'max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6'}>
        {/* VIEW A COMPACT MODE omits duplicate header; VIEW B BOTANICAL GLASS HEADER remains unchanged */}
        {routeFarmId ? null : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
            <div className="flex items-center gap-4 sm:gap-5">
              {/* Home-Style Frosted Glass Emblem with 3-Leaf Symbol */}
              <div className="fs-glass-card w-[74px] h-[68px] sm:w-[94px] sm:h-[86px] !rounded-[22px] sm:!rounded-[26px] shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 64 64" fill="none" className="w-11 h-11 sm:w-14 sm:h-14" aria-hidden="true">
                  <path
                    d="M32 52C32 39 32 25 32 13"
                    stroke="#00D5C6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M32 29C32 18 39 9 50 9C50 20 42 29 32 29Z"
                    fill="url(#leafGradA)"
                    stroke="#047857"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M32 35C22 35 14 27 14 16C24 16 32 24 32 35Z"
                    fill="url(#leafGradB)"
                    stroke="#047857"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M32 45C32 36 39 29 49 29C49 38 41 45 32 45Z"
                    fill="url(#leafGradC)"
                    stroke="#0F7B42"
                    strokeWidth="1.2"
                  />
                  <defs>
                    <linearGradient id="leafGradA" x1="32" y1="9" x2="50" y2="29" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#6EE7B7" />
                      <stop offset="1" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="leafGradB" x1="14" y1="16" x2="32" y2="35" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#34D399" />
                      <stop offset="1" stopColor="#047857" />
                    </linearGradient>
                    <linearGradient id="leafGradC" x1="32" y1="29" x2="49" y2="45" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#5EEAD4" />
                      <stop offset="1" stopColor="#0D9488" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <div>
                <h1 className="text-3xl sm:text-[46px] font-bold tracking-tight leading-[1.05] text-[#072622] dark:text-[#ECF8F5]">
                  My Farms
                </h1>
                <p className="text-sm sm:text-[17px] text-[#1B4D46] dark:text-[#B8DCD4] mt-1.5">
                  Manage your farms and explore detailed insights
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <OfflineSyncBar
                isOnline={isOnline}
                lastSyncedAt={lastSyncedAt}
                outbox={outbox}
                isSyncing={isSyncing}
                quotaError={quotaError}
                onSyncNow={handleSyncNow}
                onResolveConflict={handleResolveConflict}
                onDiscardOp={(opId) => setOutbox(removeOutboxOp(opId))}
                onExportBackup={() =>
                  downloadJsonFile(`anchor-myfarms-backup-${Date.now()}.json`, {
                    farms: rawFarms,
                    fields,
                    decisions,
                    observations,
                    tasks,
                    outbox,
                  })
                }
                onDismissQuotaError={() => setQuotaError(null)}
              />

              <button
                type="button"
                onClick={() => navigate('/questions?mode=create&new=1')}
                className="h-[52px] px-5 rounded-full inline-flex items-center justify-center gap-2 bg-white/75 dark:bg-white/[0.08] text-[#072622] dark:text-[#ECF8F5] text-sm font-semibold border border-[#0F766E]/30 dark:border-white/20 hover:bg-white dark:hover:bg-white/[0.14] transition-all cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-[#0F766E] dark:text-[#5EEAD4]" />
                Guided Questionnaire
              </button>

              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="h-[52px] px-7 rounded-full inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#5EEAD4] via-[#2DD4BF] to-[#0F766E] text-[#031F1C] text-base font-bold border border-white/70 dark:border-[#5EEAD4]/60 shadow-[0_0_24px_rgba(20,184,154,0.34),0_6px_18px_rgba(0,0,0,0.2)] hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[2.6]" />
                Add Farm
              </button>
            </div>
          </div>
        )}

        {/* Network / Cache Banner */}
        {loadError && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={loadPortfolio}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-500/40 font-semibold hover:bg-amber-500/15 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* VIEW A: FARM DETAIL WORKSPACE */}
        {routeFarmId ? (
          loading && !selectedDetailFarm ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--text-secondary)]">
              Loading farm workspace…
            </div>
          ) : !selectedDetailFarm ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
              <div className="text-base font-bold text-[var(--text-primary)]">
                Farm record not found
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                It may have been deleted or renamed on another session.
              </p>
              <button
                type="button"
                onClick={() => navigate('/my-farms')}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
              >
                Return to My Farms
              </button>
            </div>
          ) : (
            <FarmDetailWorkspace
              farm={selectedDetailFarm}
              allFields={fields}
              decisions={decisions}
              observations={observations}
              tasks={tasks}
              irrigationLogs={irrigationLogs}
              snapshots={snapshots}
              activeTab={detailTab}
              isOnline={isOnline}
              syncBarSlot={
                <OfflineSyncBar
                  isOnline={isOnline}
                  lastSyncedAt={lastSyncedAt}
                  outbox={outbox}
                  isSyncing={isSyncing}
                  quotaError={quotaError}
                  onSyncNow={handleSyncNow}
                  onResolveConflict={handleResolveConflict}
                  onDiscardOp={(opId) => setOutbox(removeOutboxOp(opId))}
                  onExportBackup={() =>
                    downloadJsonFile(`anchor-myfarms-backup-${Date.now()}.json`, {
                      farms: rawFarms,
                      fields,
                      decisions,
                      observations,
                      tasks,
                      outbox,
                    })
                  }
                  onDismissQuotaError={() => setQuotaError(null)}
                />
              }
              onChangeTab={setDetailTab}
              onBackToPortfolio={() => navigate('/my-farms')}
              onPatchFarm={handlePatchFarm}
              onCreateField={async (payload) => {
                await runMutationWithOfflineFallback({
                  entityType: 'field_create',
                  entityId: `temp-field-${Date.now()}`,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'append_only',
                  method: 'POST',
                  endpoint: '/api/my-farms/fields',
                  payload,
                  summaryLabel: `Add field "${String(payload.name)}"`,
                  successMessage: `Created field "${String(payload.name)}"`,
                });
              }}
              onPatchField={async (fieldId, patch) => {
                await runMutationWithOfflineFallback({
                  entityType: 'field_patch',
                  entityId: fieldId,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'server_wins',
                  method: 'PATCH',
                  endpoint: `/api/my-farms/fields/${fieldId}`,
                  payload: patch,
                  summaryLabel: 'Update field settings',
                  successMessage: 'Field updated',
                });
              }}
              onSaveFieldBoundary={async (fieldId, geometry: GeoJsonPolygonGeometry, editReason) => {
                await runMutationWithOfflineFallback({
                  entityType: 'field_boundary',
                  entityId: fieldId,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'server_wins',
                  method: 'PUT',
                  endpoint: `/api/maps/fields/${fieldId}/boundary`,
                  payload: { geometry, source: 'edited', editReason },
                  summaryLabel: 'Update field boundary geometry',
                  successMessage: 'Boundary version saved',
                });
                await loadPortfolio();
              }}
              onDeleteField={async (fieldId) => {
                await executeDirectMutation('DELETE', `/api/maps/fields/${fieldId}`);
                await loadPortfolio();
                showToast('Field deleted', 'success');
              }}
              onRecordDecision={async ({
                fieldId,
                fieldName,
                action,
                candidate,
                isRecommendedPlan,
                reasonCode,
                reasonNote,
              }) => {
                await runMutationWithOfflineFallback({
                  entityType: 'decision_log',
                  entityId: candidate.id,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'append_only',
                  method: 'POST',
                  endpoint: `/api/my-farms/farms/${selectedDetailFarm.id}/decisions`,
                  payload: {
                    fieldId,
                    fieldName,
                    action,
                    candidateId: candidate.id,
                    candidateTitle: candidate.title,
                    candidateScoreSnapshot: candidate.suitabilityScore,
                    candidateCrops: candidate.steps.map((s) => ({
                      cropId: s.cropId,
                      cropName: s.cropName,
                      cycleLabel: s.cycleLabel,
                    })),
                    isRecommendedPlan,
                    reasonCode,
                    reasonNote,
                  },
                  summaryLabel: `Plan decision (${action}): ${candidate.title}`,
                  successMessage: `Recorded ${action} decision in Plan History`,
                });
              }}
              onAddObservation={async (payload) => {
                await runMutationWithOfflineFallback({
                  entityType: 'observation_add',
                  entityId: `obs-${Date.now()}`,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'append_only',
                  method: 'POST',
                  endpoint: `/api/my-farms/farms/${selectedDetailFarm.id}/observations`,
                  payload,
                  summaryLabel: `Observation: ${String(payload.title)}`,
                  successMessage: 'Observation logged',
                });
              }}
              onAddTask={async (payload) => {
                await runMutationWithOfflineFallback({
                  entityType: 'task_add',
                  entityId: `task-${Date.now()}`,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'append_only',
                  method: 'POST',
                  endpoint: `/api/my-farms/farms/${selectedDetailFarm.id}/tasks`,
                  payload,
                  summaryLabel: `Task: ${String(payload.title)}`,
                  successMessage: 'Task added',
                });
              }}
              onToggleTask={async (taskId, completed) => {
                await runMutationWithOfflineFallback({
                  entityType: 'task_toggle',
                  entityId: taskId,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'server_wins',
                  method: 'PATCH',
                  endpoint: `/api/my-farms/tasks/${taskId}`,
                  payload: { completed },
                  summaryLabel: `${completed ? 'Complete' : 'Reopen'} task`,
                  optimisticUpdate: () => {
                    setTasks((prev) =>
                      prev.map((t) => (t.id === taskId ? { ...t, completed } : t))
                    );
                  },
                });
              }}
              onAddIrrigation={async (payload) => {
                await runMutationWithOfflineFallback({
                  entityType: 'irrigation_add',
                  entityId: `irr-${Date.now()}`,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'append_only',
                  method: 'POST',
                  endpoint: `/api/my-farms/farms/${selectedDetailFarm.id}/irrigation`,
                  payload,
                  summaryLabel: `Log ${String(payload.volumeM3)} m³ irrigation`,
                  successMessage: 'Irrigation run logged',
                });
              }}
              onCreateSnapshot={async (payload) => {
                await runMutationWithOfflineFallback({
                  entityType: 'snapshot_save',
                  entityId: `snap-${Date.now()}`,
                  farmId: selectedDetailFarm.id,
                  baseVersion: null,
                  conflictPolicy: 'append_only',
                  method: 'POST',
                  endpoint: `/api/my-farms/farms/${selectedDetailFarm.id}/snapshots`,
                  payload,
                  summaryLabel: 'Save assessment snapshot',
                  successMessage: 'Assessment snapshot saved',
                });
              }}
              onOpenRename={setRenameTarget}
              onOpenDuplicate={setDuplicateTarget}
              onOpenExport={setExportTarget}
              onArchiveToggle={(f) =>
                handlePatchFarm(
                  f,
                  { archived: !f.archivedAt },
                  f.archivedAt ? `Unarchived "${f.name}"` : `Archived "${f.name}"`
                )
              }
              onOpenDelete={setDeleteTarget}
              onOpenInMaps={handleOpenInMaps}
              onRunDeepAnalysis={handleRunDeepAnalysis}
            />
          )
        ) : (
          /* VIEW B: PORTFOLIO OVERVIEW */
          <>
            {/* 4 Home-Matched Translucent Glass Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
              {/* 1. Farms */}
              <div className="fs-glass-card fs-glass-card-interactive !rounded-[28px] h-[136px]">
                <img
                  src={heroFarmlandImg}
                  alt=""
                  className="fs-glass-card-bg w-full h-full object-cover object-center opacity-[0.58] dark:opacity-[0.68]"
                  style={{
                    maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.36) 36%, rgba(0,0,0,0.92) 66%, rgba(0,0,0,1) 100%)',
                    WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.36) 36%, rgba(0,0,0,0.92) 66%, rgba(0,0,0,1) 100%)',
                  }}
                />
                <div className="h-full px-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 shrink-0" aria-hidden="true">
                      <path
                        d="M7 22L24 9L41 22V39C41 40.1 40.1 41 39 41H9C7.9 41 7 40.1 7 39V22Z"
                        fill="#14B89A"
                        fillOpacity="0.24"
                        stroke="#14B89A"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M19 41V28H29V41"
                        stroke="#2DD4BF"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <rect x="21" y="17" width="6" height="5" rx="1" fill="#2DD4BF" />
                    </svg>
                    <div>
                      <div className="text-[36px] font-bold leading-none text-[#072622] dark:text-[#ECF8F5] tabular-nums drop-shadow-[0_1px_2px_rgba(255,255,255,0.45)] dark:drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
                        {aggregates.activeFarms}
                      </div>
                      <div className="text-sm font-medium text-[#16423B] dark:text-[#CCE8E2] mt-1.5">
                        Farms
                      </div>
                    </div>
                  </div>
                  <div className="self-end mb-3.5 px-2.5 py-0.5 rounded-lg bg-white/60 dark:bg-[#031B18]/72 backdrop-blur-[4px] text-xs sm:text-sm font-semibold text-[#065F46] dark:text-[#5EEAD4] tabular-nums whitespace-nowrap">
                    ↑ {mappedActiveFarmsCount} mapped
                  </div>
                </div>
              </div>

              {/* 2. Fields */}
              <div className="fs-glass-card fs-glass-card-interactive !rounded-[28px] h-[136px]">
                <img
                  src={aerialCinematicImg}
                  alt=""
                  className="fs-glass-card-bg w-full h-full object-cover object-center opacity-[0.58] dark:opacity-[0.68]"
                  style={{
                    maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.36) 36%, rgba(0,0,0,0.92) 66%, rgba(0,0,0,1) 100%)',
                    WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.36) 36%, rgba(0,0,0,0.92) 66%, rgba(0,0,0,1) 100%)',
                  }}
                />
                <div className="h-full px-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 shrink-0" aria-hidden="true">
                      <path
                        d="M9 38L18 19M17 38L22 19M24 38V19M31 38L26 19M39 38L30 19"
                        stroke="#14B89A"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                      />
                      <path d="M24 9L28 13L24 17L20 13L24 9Z" fill="#2DD4BF" />
                    </svg>
                    <div>
                      <div className="text-[36px] font-bold leading-none text-[#072622] dark:text-[#ECF8F5] tabular-nums drop-shadow-[0_1px_2px_rgba(255,255,255,0.45)] dark:drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
                        {aggregates.totalFields}
                      </div>
                      <div className="text-sm font-medium text-[#16423B] dark:text-[#CCE8E2] mt-1.5">
                        Fields
                      </div>
                    </div>
                  </div>
                  <div className="self-end mb-3.5 px-2.5 py-0.5 rounded-lg bg-white/60 dark:bg-[#031B18]/72 backdrop-blur-[4px] text-xs sm:text-sm font-semibold text-[#065F46] dark:text-[#5EEAD4] tabular-nums whitespace-nowrap">
                    ↑ {activeFieldsCount} active
                  </div>
                </div>
              </div>

              {/* 3. Total Area */}
              <div className="fs-glass-card fs-glass-card-interactive !rounded-[28px] h-[136px]">
                <img
                  src={TOP_FOLIAGE_BG}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="fs-glass-card-bg w-full h-full object-cover object-center opacity-[0.62] dark:opacity-[0.74]"
                  style={{
                    maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.40) 36%, rgba(0,0,0,0.95) 66%, rgba(0,0,0,1) 100%)',
                    WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.40) 36%, rgba(0,0,0,0.95) 66%, rgba(0,0,0,1) 100%)',
                  }}
                />
                <div className="h-full px-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <svg viewBox="0 0 48 48" fill="none" className="w-11 h-11 shrink-0" aria-hidden="true">
                      <path
                        d="M24 39V16"
                        stroke="#14B8A6"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                      <path
                        d="M24 26C24 17 29.5 10 38 10C38 19 32 26 24 26Z"
                        fill="#2DD4BF"
                      />
                      <path
                        d="M24 30C16 30 10 24 10 15C18 15 24 21 24 30Z"
                        fill="#14B8A6"
                      />
                    </svg>
                    <div className="min-w-0">
                      <div className="text-[28px] sm:text-[31px] font-bold leading-none text-[#072622] dark:text-[#ECF8F5] tabular-nums truncate drop-shadow-[0_1px_2px_rgba(255,255,255,0.45)] dark:drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
                        {Math.round(aggregates.totalMappedHa).toLocaleString()}{' '}
                        <span className="text-xl font-semibold text-[#16423B] dark:text-[#CCE8E2]">ha</span>
                      </div>
                      <div className="text-sm font-medium text-[#16423B] dark:text-[#CCE8E2] mt-1.5">
                        Total Area
                      </div>
                    </div>
                  </div>
                  <div className="self-end mb-3.5 px-2.5 py-0.5 rounded-lg bg-white/60 dark:bg-[#031B18]/72 backdrop-blur-[4px] text-xs sm:text-sm font-semibold text-[#065F46] dark:text-[#5EEAD4] tabular-nums whitespace-nowrap">
                    {aggregates.overlapWarningFarms > 0
                      ? `${aggregates.overlapWarningFarms} overlap`
                      : `↑ ${uniqueRegions.length} region${uniqueRegions.length === 1 ? '' : 's'}`}
                  </div>
                </div>
              </div>

              {/* 4. Alerts */}
              <div className="fs-glass-card fs-glass-card-interactive !rounded-[28px] h-[136px]">
                <img
                  src={irrigationTwilightImg}
                  alt=""
                  className="fs-glass-card-bg w-full h-full object-cover object-center opacity-[0.58] dark:opacity-[0.68]"
                  style={{
                    maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.36) 36%, rgba(0,0,0,0.92) 66%, rgba(0,0,0,1) 100%)',
                    WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.36) 36%, rgba(0,0,0,0.92) 66%, rgba(0,0,0,1) 100%)',
                  }}
                />
                <div className="h-full px-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 shrink-0" aria-hidden="true">
                      <path
                        d="M21.4 9.5C22.6 7.5 25.4 7.5 26.6 9.5L40.6 33.5C41.8 35.5 40.4 38 38 38H10C7.6 38 6.2 35.5 7.4 33.5L21.4 9.5Z"
                        fill="#FFBF37"
                      />
                      <path d="M24 18V26.5" stroke="#1E1404" strokeWidth="3.2" strokeLinecap="round" />
                      <circle cx="24" cy="31.5" r="2" fill="#1E1404" />
                    </svg>
                    <div>
                      <div className="text-[36px] font-bold leading-none text-[#072622] dark:text-[#ECF8F5] tabular-nums drop-shadow-[0_1px_2px_rgba(255,255,255,0.45)] dark:drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
                        {aggregates.totalAlerts}
                      </div>
                      <div className="text-sm font-medium text-[#16423B] dark:text-[#CCE8E2] mt-1.5">
                        Alerts
                      </div>
                    </div>
                  </div>
                  <div
                    className={`self-end mb-3.5 px-2.5 py-0.5 rounded-lg bg-white/60 dark:bg-[#031B18]/72 backdrop-blur-[4px] text-xs sm:text-sm font-semibold tabular-nums whitespace-nowrap ${
                      aggregates.needsAttentionOrAlertFarms > 0
                        ? 'text-amber-700 dark:text-[#FFD15C]'
                        : 'text-[#065F46] dark:text-[#5EEAD4]'
                    }`}
                  >
                    {aggregates.needsAttentionOrAlertFarms > 0
                      ? `${aggregates.needsAttentionOrAlertFarms} flagged`
                      : 'All clear'}
                  </div>
                </div>
              </div>
            </div>

            {/* Capsule Search, Filtering, Sorting & View Switcher Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Capsule Search Input */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4.5 h-4.5 text-[#1B4D46] dark:text-[#96C7BE] absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                <input
                  type="text"
                  value={filter.search}
                  onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Search farms, fields or locations..."
                  aria-label="Search farms"
                  className="fs-dash-field-item w-full h-[52px] pl-12 pr-10 !rounded-full text-sm text-[#072622] dark:text-[#ECF8F5] placeholder:text-[#21524B] dark:placeholder:text-[#96C7BE] focus:outline-none"
                />
                {filter.search && (
                  <button
                    type="button"
                    onClick={() => setFilter((f) => ({ ...f, search: '' }))}
                    aria-label="Clear search"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1B4D46] hover:text-[#072622] dark:text-[#96C7BE] dark:hover:text-white cursor-pointer z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* All Farms Grouping / Region Dropdown */}
              <div className="relative">
                <select
                  aria-label="Filter farms by group or region"
                  value={filter.region}
                  onChange={(e) => setFilter((f) => ({ ...f, region: e.target.value }))}
                  className="fs-dash-field-item appearance-none h-[52px] pl-5 pr-10 !rounded-full text-sm font-medium text-[#072622] dark:text-[#ECF8F5] focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    All Farms ({aggregates.activeFarms})
                  </option>
                  {uniqueRegions.map((r) => (
                    <option
                      key={r}
                      value={r}
                      className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]"
                    >
                      {r}
                    </option>
                  ))}
                  {aggregates.archivedFarms > 0 && (
                    <option
                      value="__archived__"
                      className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]"
                    >
                      Archived ({aggregates.archivedFarms})
                    </option>
                  )}
                </select>
                <ChevronDown className="w-4 h-4 text-[#1B4D46] dark:text-[#96C7BE] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* All Status Dropdown */}
              <div className="relative">
                <select
                  aria-label="Filter by status"
                  value={filter.status}
                  onChange={(e) =>
                    setFilter((f) => ({
                      ...f,
                      status: e.target.value as PortfolioFilterState['status'],
                    }))
                  }
                  className="fs-dash-field-item appearance-none h-[52px] pl-5 pr-10 !rounded-full text-sm font-medium text-[#072622] dark:text-[#ECF8F5] focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    All Status
                  </option>
                  <option value="good" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Healthy
                  </option>
                  <option value="needs_attention" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Attention
                  </option>
                  <option value="alert" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Critical
                  </option>
                  <option value="not_assessed" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Not assessed
                  </option>
                  <option value="archived" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Archived ({aggregates.archivedFarms})
                  </option>
                </select>
                <ChevronDown className="w-4 h-4 text-[#1B4D46] dark:text-[#96C7BE] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Sort By Dropdown */}
              <div className="relative">
                <select
                  aria-label="Sort farms"
                  value={sortSelectValue}
                  onChange={(e) => {
                    const [by, dir] = e.target.value.split(':') as [
                      PortfolioFilterState['sortBy'],
                      'asc' | 'desc',
                    ];
                    setFilter((f) => ({ ...f, sortBy: by, sortDir: dir }));
                  }}
                  className="fs-dash-field-item appearance-none h-[52px] pl-5 pr-10 !rounded-full text-sm font-medium text-[#072622] dark:text-[#ECF8F5] focus:outline-none cursor-pointer"
                >
                  <option value="assessedAt:desc" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Sort by: Last Updated
                  </option>
                  <option value="name:asc" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Sort by: Farm Name (A–Z)
                  </option>
                  <option value="area:desc" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Sort by: Largest Area
                  </option>
                  <option value="area:asc" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Sort by: Smallest Area
                  </option>
                  <option value="fields:desc" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Sort by: Most Fields
                  </option>
                  <option value="alerts:desc" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Sort by: Highest Alerts
                  </option>
                  <option value="status:asc" className="bg-[#E7F4F1] text-[#072622] dark:bg-[#06221F] dark:text-[#ECF8F5]">
                    Sort by: Status Priority
                  </option>
                </select>
                <ChevronDown className="w-4 h-4 text-[#1B4D46] dark:text-[#96C7BE] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Segmented List | Grid View Switcher */}
              <div className="fs-dash-field-item h-[52px] p-1 !rounded-full inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                  className={`h-full w-12 rounded-full inline-flex items-center justify-center transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-gradient-to-br from-[#5EEAD4] via-[#2DD4BF] to-[#0F766E] text-[#031F1C] shadow-[0_0_16px_rgba(20,184,154,0.4)]'
                      : 'text-[#1B4D46] hover:text-[#072622] dark:text-[#96C7BE] dark:hover:text-white'
                  }`}
                >
                  <List className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                  className={`h-full w-12 rounded-full inline-flex items-center justify-center transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-gradient-to-br from-[#5EEAD4] via-[#2DD4BF] to-[#0F766E] text-[#031F1C] shadow-[0_0_16px_rgba(20,184,154,0.4)]'
                      : 'text-[#1B4D46] hover:text-[#072622] dark:text-[#96C7BE] dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Table / Grid / Empty / Zero-Match */}
            {loading && farms.length === 0 ? (
              <div className="fs-dash-panel !rounded-[30px] p-12 text-center text-sm text-[#1B4D46] dark:text-[#B8DCD4]">
                Loading farms…
              </div>
            ) : farms.length === 0 ? (
              <div className="fs-dash-panel !rounded-[30px] p-12 text-center space-y-3.5">
                <Sprout className="w-9 h-9 mx-auto text-[#0F766E] dark:text-[#2DD4BF]" />
                <div className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5]">No farms yet</div>
                <p className="text-xs sm:text-sm text-[#1B4D46] dark:text-[#B8DCD4] max-w-md mx-auto">
                  Register your first farm parcel, import or draw field boundaries, and start tracking soil, water, weather, and rotation decisions.
                </p>
                <button
                  type="button"
                  onClick={() => setWizardOpen(true)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-[#5EEAD4] via-[#2DD4BF] to-[#0F766E] text-[#031F1C] text-sm font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add First Farm
                </button>
              </div>
            ) : filteredFarms.length === 0 ? (
              <div className="fs-dash-panel !rounded-[30px] p-10 text-center space-y-3 text-xs sm:text-sm">
                <div className="text-base font-bold text-[#072622] dark:text-[#ECF8F5]">
                  No farms match your current filters
                </div>
                <div className="text-[#1B4D46] dark:text-[#B8DCD4]">
                  Active criteria: {filter.search ? `search "${filter.search}" · ` : ''}
                  status={filter.status} · group={filter.region === '__archived__' ? 'archived' : filter.region}
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() =>
                      setFilter((f) => ({ ...f, search: '', status: 'all', region: 'all' }))
                    }
                    className="fs-dash-field-item px-4 py-2 !rounded-full font-semibold text-[#072622] dark:text-[#ECF8F5] cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <PortfolioTable
                farms={filteredFarms}
                fields={fields}
                filter={filter}
                viewMode={viewMode}
                selectedFarmId={getActiveFarmId() || null}
                onChangeSort={(sortBy) =>
                  setFilter((f) => ({
                    ...f,
                    sortBy,
                    sortDir: f.sortBy === sortBy && f.sortDir === 'asc' ? 'desc' : 'asc',
                  }))
                }
                onOpenDetails={(farmId, subTab = 'overview') => {
                  const found = farms.find((x) => x.id === farmId);
                  if (found) syncFarmToLocalProfiles(found);
                  setActiveFarmId(farmId);
                  setDetailTab(subTab);
                  navigate(`/my-farms/${farmId}`);
                }}
                onRenameFarm={setRenameTarget}
                onDeleteFarm={setDeleteTarget}
              />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AddFarmWizardModal
        open={wizardOpen}
        existingNames={farms.map((f) => f.name)}
        onClose={() => setWizardOpen(false)}
        onComplete={handleCreateFarm}
      />

      <RenameFarmModal
        farm={renameTarget}
        existingNames={farms.map((f) => f.name)}
        onClose={() => setRenameTarget(null)}
        onConfirm={handleRenameConfirm}
      />

      <DuplicateFarmModal
        farm={duplicateTarget}
        fieldCount={
          duplicateTarget ? fields.filter((f) => f.farmId === duplicateTarget.id).length : 0
        }
        onClose={() => setDuplicateTarget(null)}
        onConfirm={handleDuplicateConfirm}
      />

      <ExportFarmModal
        farm={exportTarget}
        onClose={() => setExportTarget(null)}
        onDownloadJson={handleExportJson}
        onDownloadGeoJson={handleExportGeoJson}
      />

      <DeleteFarmModal
        farm={deleteTarget}
        downstreamCounts={
          deleteTarget
            ? {
                fields: fields.filter((f) => f.farmId === deleteTarget.id).length,
                decisions: decisions.filter((d) => d.farmId === deleteTarget.id).length,
                observations: observations.filter((o) => o.farmId === deleteTarget.id).length,
                tasks: tasks.filter((t) => t.farmId === deleteTarget.id).length,
                snapshots: snapshots.filter((s) => s.farmId === deleteTarget.id).length,
              }
            : { fields: 0, decisions: 0, observations: 0, tasks: 0, snapshots: 0 }
        }
        isActiveFarm={Boolean(deleteTarget && getActiveFarmId() === deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
