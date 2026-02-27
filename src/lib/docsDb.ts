const DATABASE_NAME = 'sloppysource-docs'
const DATABASE_VERSION = 1
const STORE_NAME = 'documents'

export interface StoredDocument {
  id: string
  name: string
  markdown: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    throw new Error('IndexedDB is not supported in this browser.')
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
        store.createIndex('name', 'name', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()
    const documents = await requestToPromise(request)

    await transactionToPromise(transaction)

    return documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    database.close()
  }
}

export async function putDocument(document: StoredDocument): Promise<StoredDocument> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await requestToPromise(store.put(document))
    await transactionToPromise(transaction)

    return document
  } finally {
    database.close()
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await requestToPromise(store.delete(id))
    await transactionToPromise(transaction)
  } finally {
    database.close()
  }
}

export async function clearDocuments(): Promise<void> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await requestToPromise(store.clear())
    await transactionToPromise(transaction)
  } finally {
    database.close()
  }
}
