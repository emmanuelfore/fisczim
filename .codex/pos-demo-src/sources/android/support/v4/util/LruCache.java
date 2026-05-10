package android.support.v4.util;

import java.util.LinkedHashMap;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public class LruCache<K, V> {
    private int createCount;
    private int evictionCount;
    private int hitCount;
    private final LinkedHashMap<K, V> map;
    private int maxSize;
    private int missCount;
    private int putCount;
    private int size;

    public LruCache(int maxSize) {
        if (maxSize <= 0) {
            throw new IllegalArgumentException("maxSize <= 0");
        }
        this.maxSize = maxSize;
        this.map = new LinkedHashMap<>(0, 0.75f, true);
    }

    public void resize(int maxSize) {
        if (maxSize <= 0) {
            throw new IllegalArgumentException("maxSize <= 0");
        }
        synchronized (this) {
            this.maxSize = maxSize;
        }
        trimToSize(maxSize);
    }

    public final V get(K k) throws Throwable {
        V vPut;
        if (k == null) {
            throw new NullPointerException("key == null");
        }
        synchronized (this) {
            try {
                try {
                    V v = this.map.get(k);
                    if (v != null) {
                        this.hitCount++;
                        return v;
                    }
                    this.missCount++;
                    V vCreate = create(k);
                    if (vCreate == null) {
                        return null;
                    }
                    synchronized (this) {
                        this.createCount++;
                        vPut = this.map.put(k, vCreate);
                        if (vPut != null) {
                            this.map.put(k, vPut);
                        } else {
                            this.size += safeSizeOf(k, vCreate);
                        }
                    }
                    if (vPut != null) {
                        entryRemoved(false, k, vCreate, vPut);
                        return vPut;
                    }
                    trimToSize(this.maxSize);
                    return vCreate;
                } catch (Throwable th) {
                    th = th;
                    throw th;
                }
            } catch (Throwable th2) {
                th = th2;
            }
        }
    }

    public final V put(K key, V value) {
        V previous;
        if (key == null || value == null) {
            throw new NullPointerException("key == null || value == null");
        }
        synchronized (this) {
            this.putCount++;
            this.size += safeSizeOf(key, value);
            previous = this.map.put(key, value);
            if (previous != null) {
                this.size -= safeSizeOf(key, previous);
            }
        }
        if (previous != null) {
            entryRemoved(false, key, previous, value);
        }
        trimToSize(this.maxSize);
        return previous;
    }

    /* JADX WARN: Code restructure failed: missing block: B:21:0x0074, code lost:
    
        throw new java.lang.IllegalStateException(getClass().getName() + ".sizeOf() is reporting inconsistent results!");
     */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    public void trimToSize(int r7) {
        /*
            r6 = this;
            r0 = 0
            r1 = r0
            r2 = r1
        L3:
            monitor-enter(r6)
            int r3 = r6.size     // Catch: java.lang.Throwable -> L75
            if (r3 < 0) goto L56
            java.util.LinkedHashMap<K, V> r3 = r6.map     // Catch: java.lang.Throwable -> L75
            boolean r3 = r3.isEmpty()     // Catch: java.lang.Throwable -> L75
            if (r3 == 0) goto L14
            int r3 = r6.size     // Catch: java.lang.Throwable -> L75
            if (r3 != 0) goto L56
        L14:
            int r3 = r6.size     // Catch: java.lang.Throwable -> L75
            if (r3 <= r7) goto L54
            java.util.LinkedHashMap<K, V> r3 = r6.map     // Catch: java.lang.Throwable -> L75
            boolean r3 = r3.isEmpty()     // Catch: java.lang.Throwable -> L75
            if (r3 == 0) goto L21
            goto L54
        L21:
            java.util.LinkedHashMap<K, V> r3 = r6.map     // Catch: java.lang.Throwable -> L75
            java.util.Set r3 = r3.entrySet()     // Catch: java.lang.Throwable -> L75
            java.util.Iterator r3 = r3.iterator()     // Catch: java.lang.Throwable -> L75
            java.lang.Object r3 = r3.next()     // Catch: java.lang.Throwable -> L75
            java.util.Map$Entry r3 = (java.util.Map.Entry) r3     // Catch: java.lang.Throwable -> L75
            java.lang.Object r4 = r3.getKey()     // Catch: java.lang.Throwable -> L75
            r1 = r4
            java.lang.Object r4 = r3.getValue()     // Catch: java.lang.Throwable -> L75
            r2 = r4
            java.util.LinkedHashMap<K, V> r4 = r6.map     // Catch: java.lang.Throwable -> L75
            r4.remove(r1)     // Catch: java.lang.Throwable -> L75
            int r4 = r6.size     // Catch: java.lang.Throwable -> L75
            int r5 = r6.safeSizeOf(r1, r2)     // Catch: java.lang.Throwable -> L75
            int r4 = r4 - r5
            r6.size = r4     // Catch: java.lang.Throwable -> L75
            int r4 = r6.evictionCount     // Catch: java.lang.Throwable -> L75
            r5 = 1
            int r4 = r4 + r5
            r6.evictionCount = r4     // Catch: java.lang.Throwable -> L75
            monitor-exit(r6)     // Catch: java.lang.Throwable -> L75
            r6.entryRemoved(r5, r1, r2, r0)
            goto L3
        L54:
            monitor-exit(r6)     // Catch: java.lang.Throwable -> L75
            return
        L56:
            java.lang.IllegalStateException r0 = new java.lang.IllegalStateException     // Catch: java.lang.Throwable -> L75
            java.lang.StringBuilder r3 = new java.lang.StringBuilder     // Catch: java.lang.Throwable -> L75
            r3.<init>()     // Catch: java.lang.Throwable -> L75
            java.lang.Class r4 = r6.getClass()     // Catch: java.lang.Throwable -> L75
            java.lang.String r4 = r4.getName()     // Catch: java.lang.Throwable -> L75
            r3.append(r4)     // Catch: java.lang.Throwable -> L75
            java.lang.String r4 = ".sizeOf() is reporting inconsistent results!"
            r3.append(r4)     // Catch: java.lang.Throwable -> L75
            java.lang.String r3 = r3.toString()     // Catch: java.lang.Throwable -> L75
            r0.<init>(r3)     // Catch: java.lang.Throwable -> L75
            throw r0     // Catch: java.lang.Throwable -> L75
        L75:
            r0 = move-exception
            monitor-exit(r6)     // Catch: java.lang.Throwable -> L75
            throw r0
        */
        throw new UnsupportedOperationException("Method not decompiled: android.support.v4.util.LruCache.trimToSize(int):void");
    }

    public final V remove(K key) throws Throwable {
        Throwable th;
        if (key == null) {
            throw new NullPointerException("key == null");
        }
        synchronized (this) {
            try {
                try {
                    V previous = this.map.remove(key);
                    if (previous != null) {
                        this.size -= safeSizeOf(key, previous);
                    }
                    if (previous != null) {
                        entryRemoved(false, key, previous, null);
                    }
                    return previous;
                } catch (Throwable th2) {
                    th = th2;
                    throw th;
                }
            } catch (Throwable th3) {
                th = th3;
                throw th;
            }
        }
    }

    protected void entryRemoved(boolean evicted, K key, V oldValue, V newValue) {
    }

    protected V create(K key) {
        return null;
    }

    private int safeSizeOf(K key, V value) {
        int result = sizeOf(key, value);
        if (result < 0) {
            throw new IllegalStateException("Negative size: " + key + "=" + value);
        }
        return result;
    }

    protected int sizeOf(K key, V value) {
        return 1;
    }

    public final void evictAll() {
        trimToSize(-1);
    }

    public final synchronized int size() {
        return this.size;
    }

    public final synchronized int maxSize() {
        return this.maxSize;
    }

    public final synchronized int hitCount() {
        return this.hitCount;
    }

    public final synchronized int missCount() {
        return this.missCount;
    }

    public final synchronized int createCount() {
        return this.createCount;
    }

    public final synchronized int putCount() {
        return this.putCount;
    }

    public final synchronized int evictionCount() {
        return this.evictionCount;
    }

    public final synchronized Map<K, V> snapshot() {
        return new LinkedHashMap(this.map);
    }

    public final synchronized String toString() {
        int hitPercent;
        int accesses = this.hitCount + this.missCount;
        hitPercent = accesses != 0 ? (this.hitCount * 100) / accesses : 0;
        return String.format("LruCache[maxSize=%d,hits=%d,misses=%d,hitRate=%d%%]", Integer.valueOf(this.maxSize), Integer.valueOf(this.hitCount), Integer.valueOf(this.missCount), Integer.valueOf(hitPercent));
    }
}
