import { escapeXml } from './soap.ts'

import type { MediaInformation } from 'chromecast-caf-receiver/cast.framework.messages'

interface DlnaMetadata {
  title: string
  seriesTitle: string
  subtitle: string
  episodeTitle: string
  episode: string
  episodeNumber: string
  posterUrl: string
}

const toText = (value: unknown) => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

const xmlEntry = (tag: string, value: string) => `<${tag}>${escapeXml(value)}</${tag}>`

const OPTIONAL_FIELD_MAP: Array<[keyof DlnaMetadata, string]> = [
  ['seriesTitle', 'upnp:album'],
  ['subtitle', 'upnp:longDescription'],
  ['episodeTitle', 'dc:description'],
  ['episode', 'upnp:genre'],
  ['episodeNumber', 'upnp:episodeNumber'],
  ['posterUrl', 'upnp:albumArtURI']
]

export interface DlnaResourceDetails {
  size?: number
  durationMilliseconds?: number
}

// The fourth protocolInfo field is where a DLNA server declares seekability. OP=01 means byte-range
// seeking; the value matches the contentFeatures.dlna.org header webtorrent's HTTP server already
// sends. LG webOS reads it from the DIDL-Lite <res> rather than from the header, and greys out the
// transport controls when it is missing. See gerbera/gerbera#839 for the same fix on the same TVs.
const DLNA_PROTOCOL_FLAGS = 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'

// DIDL-Lite duration format: H:MM:SS.mmm
const toDlnaDuration = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const fraction = Math.floor(milliseconds % 1000)
  const pad = (value: number, width: number) => String(value).padStart(width, '0')
  return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(fraction, 3)}`
}

export const buildDidlLiteMetadata = (media: MediaInformation, resource: DlnaResourceDetails = {}) => {
  const metadata = media.metadata as DlnaMetadata
  const contentId = media.contentId
  const contentType = media.contentType || 'video/*'

  const entries: string[] = [
    xmlEntry('dc:title', metadata.episodeTitle),
    '<upnp:class>object.item.videoItem</upnp:class>'
  ]

  for (const [field, tag] of OPTIONAL_FIELD_MAP) {
    const value = toText(metadata[field])
    if (!value) continue
    entries.push(xmlEntry(tag, value))
  }

  if (contentId) {
    const attributes = [`protocolInfo="http-get:*:${escapeXml(contentType)}:${DLNA_PROTOCOL_FLAGS}"`]
    if (resource.size && Number.isFinite(resource.size)) attributes.push(`size="${Math.floor(resource.size)}"`)
    if (resource.durationMilliseconds && Number.isFinite(resource.durationMilliseconds)) {
      attributes.push(`duration="${toDlnaDuration(resource.durationMilliseconds)}"`)
    }
    entries.push(`<res ${attributes.join(' ')}>${escapeXml(contentId)}</res>`)
  }

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">',
    `<item id="0" parentID="-1" restricted="1">${entries.join('')}</item>`,
    '</DIDL-Lite>'
  ].join('')
}
