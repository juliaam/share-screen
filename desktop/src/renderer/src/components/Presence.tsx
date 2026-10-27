import { useParticipants, useRoomContext } from '@livekit/components-react'
import { ConnectionState, RoomEvent, type Participant } from 'livekit-client'
import { MonitorUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Member } from '../../../shared/api'
import { api } from '../lib/api'
import { playCue } from '../lib/sounds'
import { Avatar } from './ui'

/** Shown in the room header; the rest go into "+N". */
const STACK_MAX = 5
/** Coalesces bursts of events (several people at once, reconnects). */
const SOUND_SETTLE_MS = 300

const nameOf = (p: Participant) => p.name || p.identity
const people = (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`

/**
 * Who is in the call, in the middle of the stage: connected people up front,
 * room members who are not connected faded below.
 */
export function PresenceView({
  roomId,
  memberCount,
  canPublish
}: {
  roomId: string
  memberCount: number
  canPublish: boolean
}) {
  const participants = useParticipants()
  const [members, setMembers] = useState<Member[]>([])
  const online = new Set(participants.map((p) => p.identity))
  // Someone joined by code since the list was loaded: reload it.
  const unknown = participants.some((p) => !members.some((m) => m.user_id === p.identity))

  useEffect(() => {
    let alive = true
    api.rooms
      .members(roomId)
      .then((list) => alive && setMembers(list))
      .catch(() => undefined) // Without the list, only who is connected shows.
    return () => {
      alive = false
    }
  }, [roomId, memberCount, unknown])

  const offline = members
    .filter((m) => !m.disabled && !online.has(m.user_id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  return (
    <div className="presence-room">
      <section className="presence-section" aria-label="Na sala">
        <h3 className="presence-title">
          <span className="live-dot" /> Na sala · {participants.length}
        </h3>
        <ul className="presence-grid">
          {participants.map((p) => (
            <li key={p.identity} className="presence-person online" title={nameOf(p)}>
              <span className="presence-avatar">
                <Avatar id={p.identity} name={nameOf(p)} size="xl" />
                <span className="presence-status" />
              </span>
              <span className="presence-name">{nameOf(p)}</span>
              {p.isLocal && <span className="presence-tag">você</span>}
            </li>
          ))}
        </ul>
      </section>

      {offline.length > 0 && (
        <section className="presence-section" aria-label="Fora da sala">
          <h3 className="presence-title">Fora da sala · {offline.length}</h3>
          <ul className="presence-grid">
            {offline.map((m) => (
              <li key={m.user_id} className="presence-person offline" title={`${m.display_name} (fora da sala)`}>
                <Avatar id={m.user_id} name={m.display_name} size="large" />
                <span className="presence-name">{m.display_name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="presence-hint">
        <p className="muted">Ninguém está compartilhando a tela.</p>
        {canPublish && (
          <p className="muted small">
            Use <MonitorUp size={12} /> “Compartilhar” para começar.
          </p>
        )}
      </div>
    </div>
  )
}

/** Overlapping avatars of who is connected, for the room header (names in the tooltip). */
export function PresenceStack() {
  const participants = useParticipants()
  const shown = participants.slice(0, STACK_MAX)
  const extra = participants.length - shown.length
  const names = participants.map(nameOf).join(', ')
  const label = `${people(participants.length)} na sala: ${names}`
  return (
    <span className="presence-stack" role="img" title={names} aria-label={label}>
      {shown.map((p) => (
        <Avatar key={p.identity} id={p.identity} name={nameOf(p)} size="small" />
      ))}
      {extra > 0 && <span className="avatar small more">+{extra}</span>}
    </span>
  )
}

/**
 * Plays a cue when someone else enters or leaves the call. Compares who is
 * connected after events settle, so a reconnect (LiveKit drops and re-adds
 * everyone) or the same user replacing their own connection stays silent.
 */
export function usePresenceSounds() {
  const room = useRoomContext()
  useEffect(() => {
    let known = new Set(room.remoteParticipants.keys())
    let timer: ReturnType<typeof setTimeout> | undefined

    const settle = () => {
      timer = undefined
      if (room.state !== ConnectionState.Connected) return // Checked again on Reconnected.
      const now = new Set(room.remoteParticipants.keys())
      const joined = [...now].some((id) => !known.has(id))
      const left = [...known].some((id) => !now.has(id))
      known = now
      if (left) playCue('leave')
      if (joined) setTimeout(() => playCue('join'), left ? 350 : 0)
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(settle, SOUND_SETTLE_MS)
    }
    // Who was already there when we joined is the baseline, not news.
    const reset = () => {
      known = new Set(room.remoteParticipants.keys())
    }

    room
      .on(RoomEvent.Connected, reset)
      .on(RoomEvent.ParticipantConnected, schedule)
      .on(RoomEvent.ParticipantDisconnected, schedule)
      .on(RoomEvent.Reconnected, schedule)
    return () => {
      clearTimeout(timer)
      room
        .off(RoomEvent.Connected, reset)
        .off(RoomEvent.ParticipantConnected, schedule)
        .off(RoomEvent.ParticipantDisconnected, schedule)
        .off(RoomEvent.Reconnected, schedule)
    }
  }, [room])
}
