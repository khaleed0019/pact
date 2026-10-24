import { randomUUID } from 'node:crypto'
import { RepoError } from '../db/repo.ts'
import type { Mission, MissionEvent } from './model.ts'

/**
 * Storage for missions and their audit log.
 *
 * `update` is compare-and-set on `version`: two concurrent requests (a double-tapped
 * Run, a retried payment check) cannot both win, and the loser gets a CONFLICT instead
 * of silently overwriting. That is the duplicate-action protection for every sensitive
 * transition, and the database adapter has to give the same guarantee.
 *
 * Events are append-only. There is no method to edit or delete one.
 */
export interface MissionStore {
  create(mission: Omit<Mission, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Mission>
  get(id: string): Promise<Mission | null>
  listByOwner(ownerAddress: string): Promise<Mission[]>
  /** Apply `next` only if the stored version is still `expectedVersion`. */
  update(id: string, expectedVersion: number, next: Omit<Mission, 'version' | 'updatedAt'>): Promise<Mission>
  /** The mission (if any) whose payment already used this transaction hash. */
  findByTxHash(txHash: string): Promise<Mission | null>

  addEvent(event: Omit<MissionEvent, 'id' | 'at'> & { at?: string }): Promise<MissionEvent>
  listEvents(missionId: string): Promise<MissionEvent[]>
}

export class MemoryMissionStore implements MissionStore {
  private missions = new Map<string, Mission>()
  private events: MissionEvent[] = []
  private readonly clock: () => Date

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock
  }

  async create(input: Omit<Mission, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Mission> {
    const at = this.clock().toISOString()
    const mission: Mission = structuredClone({ ...input, id: randomUUID(), version: 1, createdAt: at, updatedAt: at })
    this.missions.set(mission.id, mission)
    return structuredClone(mission)
  }

  async get(id: string): Promise<Mission | null> {
    const found = this.missions.get(id)
    return found ? structuredClone(found) : null
  }

  async listByOwner(ownerAddress: string): Promise<Mission[]> {
    return [...this.missions.values()]
      .filter((m) => m.ownerAddress === ownerAddress)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((m) => structuredClone(m))
  }

  async update(id: string, expectedVersion: number, next: Omit<Mission, 'version' | 'updatedAt'>): Promise<Mission> {
    const current = this.missions.get(id)
    if (!current) throw new RepoError('NOT_FOUND', 'That mission does not exist.')
    if (current.version !== expectedVersion) {
      throw new RepoError('CONFLICT', 'This mission changed while you were acting on it. Reload and try again.')
    }
    const saved: Mission = structuredClone({ ...next, id, version: current.version + 1, updatedAt: this.clock().toISOString() })
    this.missions.set(id, saved)
    return structuredClone(saved)
  }

  async findByTxHash(txHash: string): Promise<Mission | null> {
    const found = [...this.missions.values()].find((m) => m.payment.txHash === txHash)
    return found ? structuredClone(found) : null
  }

  async addEvent(input: Omit<MissionEvent, 'id' | 'at'> & { at?: string }): Promise<MissionEvent> {
    const event: MissionEvent = { ...input, id: randomUUID(), at: input.at ?? this.clock().toISOString() }
    this.events.push(event)
    return { ...event }
  }

  async listEvents(missionId: string): Promise<MissionEvent[]> {
    return this.events.filter((e) => e.missionId === missionId).map((e) => ({ ...e }))
  }
}
