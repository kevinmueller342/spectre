import { DEFAULT_SETTINGS } from './defaults'
import type { Settings, Task } from './types'

const DB_NAME = 'spectre-matrix'
const DB_VERSION = 1
const TASKS = 'tasks'
const META = 'meta'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(TASKS)) db.createObjectStore(TASKS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadAppData(): Promise<{ tasks: Task[]; settings: Settings }> {
  const db = await openDatabase()
  const transaction = db.transaction([TASKS, META], 'readonly')
  const tasks = await requestResult(transaction.objectStore(TASKS).getAll()) as Task[]
  const storedSettings = await requestResult(transaction.objectStore(META).get('settings')) as Partial<Settings> | undefined
  db.close()
  return { tasks, settings: { ...DEFAULT_SETTINGS, ...storedSettings } }
}

export async function putTasks(tasks: Task[]) {
  const db = await openDatabase()
  const transaction = db.transaction(TASKS, 'readwrite')
  const store = transaction.objectStore(TASKS)
  tasks.forEach((task) => store.put(task))
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function removeTask(id: string) {
  const db = await openDatabase()
  const transaction = db.transaction(TASKS, 'readwrite')
  transaction.objectStore(TASKS).delete(id)
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function putSettings(settings: Settings) {
  const db = await openDatabase()
  const transaction = db.transaction(META, 'readwrite')
  transaction.objectStore(META).put(settings, 'settings')
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const max = 2400
        const scale = Math.min(1, max / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/webp', 0.86))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
