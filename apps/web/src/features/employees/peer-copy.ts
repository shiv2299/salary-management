import type { PeerContext } from '@acme/shared';

export function peerGroupLabel(peer: PeerContext, countryName: string): string {
  return `${countryName} ${peer.levelCode}`;
}

/** Set only when pay is outside the usual range (the outlier fences), never for the middle half. */
export function outlierSentence(peer: PeerContext, countryName: string): string | null {
  const outlier = peer.position?.outlier;
  if (!outlier) return null;
  return `${outlier === 'above' ? 'Above' : 'Below'} the usual range for ${peerGroupLabel(peer, countryName)}`;
}

export function tooFewPeersSentence(peer: PeerContext, countryName: string): string {
  return `Too few ${peerGroupLabel(peer, countryName)} peers to show a typical range`;
}

/** The one peer sentence under the salary change comparison. */
export function comparisonSentence(
  next: PeerContext,
  countryName: string,
  current: PeerContext | undefined,
): string {
  if (!next.position) return tooFewPeersSentence(next, countryName);
  const outlier = outlierSentence(next, countryName);
  if (outlier) return outlier;
  const group = peerGroupLabel(next, countryName);
  if (next.position.typical === 'inside') {
    const stayed =
      current?.countryCode === next.countryCode &&
      current.levelId === next.levelId &&
      current.position?.typical === 'inside';
    return `${stayed ? 'Still inside' : 'Inside'} the typical range for ${group}`;
  }
  return `${next.position.typical === 'above' ? 'Above' : 'Below'} the typical range for ${group}`;
}
