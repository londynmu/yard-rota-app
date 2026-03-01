import { openDB } from 'idb';
import { retryWithBackoff, runWithConcurrency, isLikelyNetworkError } from './uploadRetry';

const DB_NAME = 'precheck-queue';
const STORE_NAME = 'precheck_jobs';
const QUEUE_EVENT = 'precheck-queue-update';
const DEFAULT_UPLOAD_CONCURRENCY = 3;

let processingPromise = null;

const getDb = async () => openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('userId', 'userId', { unique: false });
      store.createIndex('status', 'status', { unique: false });
    }
  }
});

const createId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const notifyQueueUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(QUEUE_EVENT));
  }
};

const registerBackgroundSync = async () => {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration?.sync?.register) {
      await registration.sync.register('precheck-sync');
    }
  } catch {
    // Ignore background sync registration errors
  }
};

const getFileExt = (name, type) => {
  if (name && name.includes('.')) {
    const ext = name.split('.').pop();
    if (ext) return ext.toLowerCase();
  }
  if (type && type.includes('/')) {
    const ext = type.split('/').pop();
    if (ext) return ext.toLowerCase();
  }
  return 'jpg';
};

export const onPrecheckQueueUpdate = (callback) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(QUEUE_EVENT, callback);
  return () => window.removeEventListener(QUEUE_EVENT, callback);
};

export const mapImagesToQueueEntries = (images = []) => images
  .filter(img => (img?.file instanceof Blob) || img?.url)
  .map(img => {
    // Already uploaded (has URL) - pass through
    if (img.url && !(img.file instanceof Blob)) {
      return { id: img.id || createId(), url: img.url };
    }
    // Not yet uploaded - include blob for upload
    return {
      id: img.id || createId(),
      name: img.file?.name || 'photo.jpg',
      type: img.file?.type || 'image/jpeg',
      size: img.file?.size || 0,
      blob: img.file,
    };
  });

export const queuePrecheckSubmission = async (payload) => {
  const db = await getDb();
  const job = {
    id: createId(),
    type: 'precheck',
    userId: payload.userId,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    payload,
  };
  await db.put(STORE_NAME, job);
  notifyQueueUpdate();
  await registerBackgroundSync();
  return job;
};

export const queueDuringShiftSubmission = async (payload) => {
  const db = await getDb();
  const job = {
    id: createId(),
    type: 'during_shift',
    userId: payload.userId,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    payload,
  };
  await db.put(STORE_NAME, job);
  notifyQueueUpdate();
  await registerBackgroundSync();
  return job;
};

export const getPrecheckQueueStatus = async (userId) => {
  const db = await getDb();
  const jobs = await db.getAll(STORE_NAME);
  const filtered = userId ? jobs.filter(j => j.userId === userId) : jobs;
  return {
    total: filtered.length,
    pending: filtered.filter(j => j.status === 'pending').length,
    uploading: filtered.filter(j => j.status === 'uploading').length,
    failed: filtered.filter(j => j.status === 'failed').length,
  };
};

const uploadImages = async (supabase, submissionId, images, options = {}) => {
  const allEntries = (images || []).filter(img => (img?.blob instanceof Blob) || img?.url);
  if (allEntries.length === 0) return [];

  // Separate pre-uploaded (have URL) from needing upload (have blob)
  const preUploaded = allEntries.filter(img => img.url && !(img.blob instanceof Blob)).map(img => img.url);
  const entries = allEntries.filter(img => img?.blob instanceof Blob);
  if (entries.length === 0) return preUploaded;

  const concurrency = options.concurrency || DEFAULT_UPLOAD_CONCURRENCY;
  const urls = await runWithConcurrency(entries, concurrency, async (img) => {
    const ext = getFileExt(img.name, img.type);
    const filePath = `damages/${submissionId}/${img.id}.${ext}`;

    await retryWithBackoff(async () => {
      const { error: uploadError } = await supabase.storage
        .from('precheck-images')
        .upload(filePath, img.blob, { upsert: true, contentType: img.type || 'image/jpeg' });
      if (uploadError) throw uploadError;
    }, options.retryOptions);

    const { data: { publicUrl } } = supabase.storage
      .from('precheck-images')
      .getPublicUrl(filePath);

    return publicUrl;
  });

  return [...preUploaded, ...urls.filter(Boolean)];
};

export const submitPrecheckPayload = async (payload, supabase) => {
  // ─── Deduplication: check if this form session was already submitted ───
  if (payload.formSessionId) {
    const { data: existing } = await supabase
      .from('precheck_submissions')
      .select('id')
      .eq('form_session_id', payload.formSessionId)
      .maybeSingle();

    if (existing) {
      // Already submitted - return existing to prevent duplicate
      return existing;
    }
  }

  const { data: submission, error: subError } = await supabase
    .from('precheck_submissions')
    .insert({
      user_id: payload.userId,
      tug_id: payload.tugId,
      check_type: payload.checkType,
      remarks: payload.remarks || null,
      form_session_id: payload.formSessionId || null,
    })
    .select()
    .single();

  if (subError) {
    // Handle unique constraint violation (race condition - another request already inserted)
    if (subError.code === '23505' && payload.formSessionId) {
      const { data: existing } = await supabase
        .from('precheck_submissions')
        .select('id')
        .eq('form_session_id', payload.formSessionId)
        .maybeSingle();
      if (existing) return existing;
    }
    throw subError;
  }

  const items = payload.items || [];
  const allRows = items.map(item => ({
    submission_id: submission.id,
    item_category: 'check',
    item_name: item.key,
    status: item.status,
    notes: item.notes || null,
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from('precheck_items')
    .insert(allRows)
    .select('id, item_name');

  if (itemsError) throw itemsError;

  const itemIdMap = {};
  if (insertedItems) {
    insertedItems.forEach(row => { itemIdMap[row.item_name] = row.id; });
  }

  if (payload.remarks || (payload.remarksImages || []).length > 0) {
    const remarksImageUrls = await uploadImages(
      supabase,
      submission.id,
      payload.remarksImages,
    );
    const { error: remarksError } = await supabase
      .from('precheck_damages')
      .insert({
        submission_id: submission.id,
        description: payload.remarks || 'Additional photos',
        severity: 'minor',
        image_urls: remarksImageUrls,
        source: 'remarks',
      });
    if (remarksError) throw remarksError;
  }

  for (const item of items) {
    if (item.status !== 'repair_needed') continue;

    if (item.linkedDamageId) {
      // Shunter confirmed "same problem – still exists" – add confirmation, no new damage
      const { data: damage, error: dErr } = await supabase
        .from('precheck_damages')
        .select(`
          id,
          repair_status,
          precheck_submissions!inner(tug_id),
          precheck_items!inner(item_name)
        `)
        .eq('id', item.linkedDamageId)
        .single();

      const sub = damage?.precheck_submissions;
      const pi = damage?.precheck_items;
      const tugMatch = sub?.tug_id === payload.tugId;
      const itemMatch = pi?.item_name === item.key;

      if (!dErr && damage && damage.repair_status !== 'resolved' && tugMatch && itemMatch) {
        const { error: confError } = await supabase
          .from('precheck_damage_confirmations')
          .insert({
            damage_id: item.linkedDamageId,
            user_id: payload.userId,
            submission_id: submission.id,
          });
        if (confError) throw confError;
      }
    } else if (item.images?.length > 0 || item.notes) {
      const imageUrls = await uploadImages(supabase, submission.id, item.images);
      const { error: damageError } = await supabase
        .from('precheck_damages')
        .insert({
          submission_id: submission.id,
          item_id: itemIdMap[item.key] || null,
          description: item.notes || `${item.label || item.key} - repair needed`,
          severity: 'minor',
          image_urls: imageUrls,
          source: 'check_item',
        });
      if (damageError) throw damageError;
    }
  }

  return submission;
};

export const submitDuringShiftPayload = async (payload, supabase) => {
  const { data: submission, error: subError } = await supabase
    .from('precheck_submissions')
    .insert({
      user_id: payload.userId,
      tug_id: payload.tugId,
      check_type: 'during_shift',
      remarks: payload.description?.trim() || null,
    })
    .select()
    .single();

  if (subError) throw subError;

  const imageUrls = await uploadImages(
    supabase,
    submission.id,
    payload.images,
  );

  const { error: damageError } = await supabase
    .from('precheck_damages')
    .insert({
      submission_id: submission.id,
      description: payload.description?.trim() || 'Damage report',
      severity: 'minor',
      image_urls: imageUrls,
      source: 'during_shift',
    });

  if (damageError) throw damageError;

  return submission;
};

export const processPrecheckQueue = async ({ supabase, userId }) => {
  if (!supabase || !userId) return { processed: 0 };
  if (!navigator?.onLine) return { processed: 0 };

  if (processingPromise) return processingPromise;

  processingPromise = (async () => {
    const db = await getDb();
    const jobs = (await db.getAll(STORE_NAME))
      .filter(job => job.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);

    let processed = 0;

    for (const job of jobs) {
      if (!navigator?.onLine) break;

      const updating = { ...job, status: 'uploading', updatedAt: Date.now() };
      await db.put(STORE_NAME, updating);
      notifyQueueUpdate();

      try {
        if (job.type === 'precheck') {
          const submission = await submitPrecheckPayload(job.payload, supabase);
          const ids = job.payload.markedResolvedDamageIds;
          if (Array.isArray(ids) && ids.length > 0) {
            for (const damageId of ids) {
              const { error } = await supabase.rpc('record_precheck_damage_fixed_confirmation', {
                damage_id: damageId,
                submission_id: submission.id,
              });
              if (error) throw error;
            }
          }
        } else if (job.type === 'during_shift') {
          await submitDuringShiftPayload(job.payload, supabase);
        }
        await db.delete(STORE_NAME, job.id);
        processed += 1;
        notifyQueueUpdate();
      } catch (err) {
        const failed = {
          ...job,
          status: 'failed',
          attempts: (job.attempts || 0) + 1,
          lastError: String(err?.message || err),
          updatedAt: Date.now(),
        };
        await db.put(STORE_NAME, failed);
        notifyQueueUpdate();
        if (isLikelyNetworkError(err)) break;
      }
    }

    return { processed };
  })().finally(() => {
    processingPromise = null;
  });

  return processingPromise;
};
